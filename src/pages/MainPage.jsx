import { useState, useRef } from 'react'

import { ChatPanel }         from '../cmps/ChatPanel/ChatPanel.jsx'
import { readStoredModel }   from '../cmps/modelOptions.js'
import { PortfolioPanel }    from '../cmps/PortfolioPanel/PortfolioPanel.jsx'
import { NewsFeed }          from '../cmps/NewsFeed/NewsFeed.jsx'
import { TradingViewChart }  from '../cmps/TradingViewChart/TradingViewChart.jsx'
import { TradeIdeasList }    from '../cmps/TradeIdeas/TradeIdeasList.jsx'
import { OrderConfirmDialog } from '../cmps/TradeIdeas/OrderConfirmDialog.jsx'
import { buildOrderPreview, orderTypeLabel } from '../cmps/TradeIdeas/tradeIdea.utils.js'
import { MonitorDashboard }  from '../cmps/MonitorDashboard/MonitorDashboard.jsx'
import { userPromptService } from '../services/userPrompt/userPrompt.service.remote.js'
import { tradeIdeasService } from '../services/tradeIdeas/tradeIdeas.service.remote.js'
import { portfolioService }  from '../services/portfolio/portfolio.service.remote.js'
import { showErrorMsg }      from '../services/event-bus.service'
import { useTypewriter }     from '../customHooks/useTypewriter.js'
import { useNewsFeed }       from '../customHooks/useNewsFeed.js'
import { useBrokerAccounts } from '../customHooks/useBrokerAccounts.js'
import { usePositions }      from '../customHooks/usePositions.js'
import { useTradeIdeas }     from '../customHooks/useTradeIdeas.js'
import { useAuth }           from '../context/AuthContext.jsx'

// Chart defaults — restored when a build/edit session ends.
const DEFAULT_CHART_SYMBOL   = 'SPY'
const DEFAULT_CHART_INTERVAL = 'D'

// Pick the chart timeframe most relevant to a trade — entry leads, then stop/tp.
// Values are the encoded strings ('1min'…'month') that TradingViewChart maps to
// TradingView interval codes.
function deriveChartInterval(pendingTrade) {
    if (!pendingTrade) return null
    return pendingTrade.entry_timeframe
        || pendingTrade.entry_conditions?.[0]?.timeframe
        || pendingTrade.stop_timeframe
        || pendingTrade.tp_timeframe
        || null
}

// Derive a live "building" idea from chat state — shown in the list but not yet saved
function deriveBuildingIdea(analysisState) {
    if (!analysisState) return null
    const s  = analysisState.structured_state || {}
    const pt = s.pending_trade || {}
    if (!s.active_asset) return null   // nothing to show yet
    return {
        id:               '__building__',
        status:           'building',
        asset:            s.active_asset,
        asset_class:      pt.asset_class     || null,
        direction:        pt.direction       || null,
        type:             pt.type            || null,
        quantity:         pt.quantity        ?? null,
        immediate:        pt.immediate       || false,
        entry_order_type: pt.entry_order_type || null,
        entry_timeframe:  pt.entry_timeframe || null,
        stop_timeframe:   pt.stop_timeframe  || null,
        tp_timeframe:     pt.tp_timeframe    || null,
        entry_conditions: pt.entry_conditions || [],
        stop_conditions:  pt.stop_conditions  || [],
        tp_conditions:    pt.tp_conditions    || [],
        notes:            pt.notes           || null,
    }
}

export function MainPage() {
    const [messages, setMessages] = useState([])
    const [analysisState, setAnalysisState] = useState(null)
    const [chartSymbol, setChartSymbol]   = useState(DEFAULT_CHART_SYMBOL)
    const [chartInterval, setChartInterval] = useState(DEFAULT_CHART_INTERVAL)
    const [isLoading, setIsLoading] = useState(false)
    const [editingIdeaId, setEditingIdeaId] = useState(null)
    const [activeTab, setActiveTab]             = useState('idea')
    const [portfolioChatRestore, setPortfolioChatRestore] = useState(null)
    const [buildingPortfolio, setBuildingPortfolio] = useState(null)
    const [dismissedConfirmIds, setDismissedConfirmIds] = useState(() => new Set())
    const [placingOrders, setPlacingOrders] = useState(false)
    const [mobileChatOpen, setMobileChatOpen] = useState(false)
    const [ideaModel, setIdeaModel] = useState(() => readStoredModel('ideaModel'))

    function handleIdeaModelChange(m) {
        setIdeaModel(m)
        localStorage.setItem('ideaModel', m)
    }
    const latestMessagesRef = useRef([])

    const news = useNewsFeed()
    const { user } = useAuth()
    const { availableAccounts, selectedAccounts, setSelectedAccounts, mainAccountId, setMainAccountId } = useBrokerAccounts()
    const { positions, loading: positionsLoading, refresh: refreshPositions, closePosition } = usePositions()
    const { ideas, setIdeas, loadIdeas, handleStatusChange } = useTradeIdeas()

    // Typewriter queue — smooths streamed tokens into the last message
    const { enqueue: enqueueToken, start: startDrain, stop: stopDrain } = useTypewriter(setMessages)

    const buildingIdea = deriveBuildingIdea(analysisState)
    // buildingPortfolio is reported up from PortfolioPanel (assets recommended /
    // pending plan) → drives the list's "building" portfolio row.

    // Build the per-account order list for a hit idea: prefer the server-built plan,
    // fall back to a client preview for legacy ideas saved before plans were persisted.
    const ordersForIdea = (idea) =>
        idea.pendingOrder?.plan?.length
            ? idea.pendingOrder.plan.map(o => ({
                broker:    o.broker,
                accountId: o.accountId,
                accountNo: o.accountNo,
                quantity:  o.quantity,
                orderType: orderTypeLabel(idea.direction, o.type),
                isMain:    String(o.accountId) === String(idea.mainAccountId),
            }))
            : buildOrderPreview(idea, availableAccounts)

    // Idea awaiting order confirmation: a still-triggered ('hit') idea with accounts,
    // not yet placed and not dismissed. 'awaiting_market' ideas stay deferred (no
    // dialog). Keying off status (not just orderState) is what makes dismiss stick:
    // once the idea is sent back to 'waiting' the dialog disappears even if a lingering
    // orderState 'awaiting_confirm' wasn't cleared.
    //
    // We pick the first such idea that *also* resolves to a non-empty order list — a
    // newer hit whose client-side preview can't resolve (e.g. its broker account isn't
    // in the current session) must not mask an older hit that has a ready plan.
    //
    // Ownership: an admin's idea list includes every user's ideas (for dev/visibility),
    // but confirming places orders through the *current* user's broker session — so we
    // only ever offer the confirm dialog for the viewer's own ideas. Legacy ideas with
    // no userId are treated as the viewer's own.
    let confirmIdea  = null
    let confirmOrders = []
    for (const i of ideas) {
        if (i.userId != null && i.userId !== user?._id) continue
        if (i.status !== 'hit' || i.ordersPlacedAt || dismissedConfirmIds.has(i.id)) continue
        if (!Array.isArray(i.accounts) || i.accounts.length === 0) continue
        if (i.orderState !== 'awaiting_confirm' && i.orderState != null) continue
        const orders = ordersForIdea(i)
        if (orders.length > 0) { confirmIdea = i; confirmOrders = orders; break }
    }

    async function handleSend(userPrompt, currentAnalysisState) {
        setMessages(prev => [
            ...prev,
            { role: 'user', content: userPrompt },
            { role: 'assistant', content: '', streaming: true },
        ])
        setIsLoading(true)
        startDrain()

        try {
            const ideaAccounts = availableAccounts.filter(a => selectedAccounts.includes(a.id))
            await userPromptService.sendPromptStream(
                userPrompt,
                currentAnalysisState,
                {
                    // Buffer only — drain timer handles the actual state updates
                    onToken:    (text)     => { enqueueToken(text) },
                    onInterval: (interval) => { if (interval) setChartInterval(interval) },
                    onAsset: (symbol) => {
                        if (symbol) {
                            setChartSymbol(symbol)
                            news.previewAsset(symbol)
                        }
                    },

                    // Agent surfaced a chart it wants the user to see — drop an
                    // image bubble in just before the streaming assistant reply.
                    onChart: (data) => {
                        if (!data?.imageBase64) return
                        setMessages(prev => {
                            const msgs = [...prev]
                            const chartMsg = {
                                role:        'assistant',
                                type:        'chart',
                                symbol:      data.symbol,
                                timeframe:   data.timeframe,
                                imageBase64: data.imageBase64,
                            }
                            const lastIdx = msgs.length - 1
                            if (msgs[lastIdx]?.streaming) msgs.splice(lastIdx, 0, chartMsg)
                            else msgs.push(chartMsg)
                            return msgs
                        })
                    },

                    onDone: (data) => {
                        stopDrain()
                        setMessages(prev => {
                            const msgs = [...prev]
                            const last = msgs[msgs.length - 1]
                            if (last?.streaming) {
                                msgs[msgs.length - 1] = { role: 'assistant', content: data.reply, analysisState: data.analysisState ?? null }
                            }
                            // Charts are transient visual aids — keep them on screen but
                            // exclude them from the persisted chat_state (base64 bloat).
                            latestMessagesRef.current = msgs.filter(m => m.type !== 'chart')
                            return msgs
                        })
                        setAnalysisState(data.analysisState ?? null)
                        const newAsset   = data.analysisState?.structured_state?.active_asset
                        const newCompany = data.analysisState?.structured_state?.active_company_name
                        if (newAsset) setChartSymbol(newAsset)
                        // Follow the established timeframe even if the LLM omitted <interval>
                        const newInterval = deriveChartInterval(data.analysisState?.structured_state?.pending_trade)
                        if (newInterval) setChartInterval(newInterval)
                        news.focusAsset(newAsset, newCompany)
                        if (data.ideaSaved) loadIdeas()

                        // Save chat state progressively when editing
                        if (editingIdeaId && data.analysisState) {
                            tradeIdeasService.updateIdea(editingIdeaId, {
                                chat_state: { messages: latestMessagesRef.current, analysisState: data.analysisState }
                            }).catch(err => console.error('[chat_state] save failed', err))
                        }
                    },

                    onError: (message) => {
                        stopDrain()
                        setMessages(prev => {
                            const msgs = [...prev]
                            const last = msgs[msgs.length - 1]
                            if (last?.streaming) {
                                msgs[msgs.length - 1] = {
                                    role: 'assistant',
                                    content: message || 'Error communicating with the server.',
                                }
                            }
                            return msgs
                        })
                    },
                },
                ideaAccounts,
                ideaModel
            )
        } catch (err) {
            console.error(err)
            stopDrain()
            setMessages(prev => {
                const msgs = [...prev]
                const last = msgs[msgs.length - 1]
                if (last?.streaming) {
                    msgs[msgs.length - 1] = {
                        role: 'assistant',
                        content: 'Error communicating with the server. Please try again.',
                    }
                }
                return msgs
            })
        } finally {
            setIsLoading(false)
        }
    }

    function handleCancelBuild() {
        setAnalysisState(null)
        setMessages([])
        setEditingIdeaId(null)
        news.clearAsset()
        setChartSymbol(DEFAULT_CHART_SYMBOL)
        setChartInterval(DEFAULT_CHART_INTERVAL)
        latestMessagesRef.current = []
    }

    function handleEditIdea(idea) {
        const cs = idea.chat_state
        // Restore prior chat if available, otherwise seed state from the idea's conditions
        const restoredState = cs?.analysisState ?? {
            recent_messages: [],
            recent_chat_summary: '',
            structured_state: {
                active_asset: idea.asset || '',
                pending_trade: {
                    direction:        idea.direction        ?? null,
                    type:             idea.type             ?? null,
                    asset_class:      idea.asset_class      ?? null,
                    quantity:         idea.quantity         ?? null,
                    entry_timeframe:  idea.entry_timeframe  ?? null,
                    stop_timeframe:   idea.stop_timeframe   ?? null,
                    tp_timeframe:     idea.tp_timeframe     ?? null,
                    entry_logic:      idea.entry_logic      ?? 'AND',
                    entry_conditions: idea.entry_conditions ?? [],
                    stop_logic:       idea.stop_logic       ?? 'OR',
                    stop_conditions:  idea.stop_conditions  ?? [],
                    tp_logic:           idea.tp_logic           ?? 'OR',
                    tp_conditions:      idea.tp_conditions      ?? [],
                    additional_entries: (idea.additional_entries ?? []).map(ae => ({
                        conditions: ae.conditions ?? [],
                        logic:      ae.logic      ?? 'AND',
                        quantity:   ae.quantity   ?? null,
                    })),
                    notes:            idea.notes            ?? null,
                },
            },
        }
        const restoredMessages = cs?.messages ?? []
        setMessages(restoredMessages)
        latestMessagesRef.current = restoredMessages
        setAnalysisState(restoredState)
        setChartSymbol(restoredState.structured_state?.active_asset || idea.asset || 'SPY')
        const editInterval = deriveChartInterval(restoredState.structured_state?.pending_trade)
        if (editInterval) setChartInterval(editInterval)
        setEditingIdeaId(idea.id)
        setSelectedAccounts(Array.isArray(idea.accounts) ? idea.accounts : [])
        setMainAccountId(idea.mainAccountId ?? null)
    }

    async function handleGenerate() {
        if (!buildingIdea) {
            // Nothing to save — if we're editing, just leave edit mode so the
            // user is never stuck (the Update button doubles as "exit edit").
            if (editingIdeaId) handleCancelBuild()
            return
        }
        const { id: _id, status: _status, ...ideaFields } = buildingIdea
        const chatState = { messages: latestMessagesRef.current, analysisState }

        if (editingIdeaId) {
            try {
                const res = await tradeIdeasService.updateIdea(editingIdeaId, {
                    ...ideaFields,
                    status:     'waiting',
                    chat_state: chatState,
                    accounts:      selectedAccounts,
                    mainAccountId: mainAccountId,
                })
                setIdeas(prev => prev.map(i => i.id === editingIdeaId ? res.idea : i))
                setEditingIdeaId(null)
                setAnalysisState(null)
                setMessages([])
                news.clearAsset()
                setChartSymbol(DEFAULT_CHART_SYMBOL)
                setChartInterval(DEFAULT_CHART_INTERVAL)
                latestMessagesRef.current = []
            } catch (err) {
                console.error('[tradeIdeas] edit update failed', err)
            }
        } else {
            try {
                const saved = await tradeIdeasService.createIdea({ ...ideaFields, chat_state: chatState, accounts: selectedAccounts, mainAccountId })
                // createIdea returns an array — one idea, or N when a multi-broker
                // idea was forked into single-broker children.
                setIdeas(prev => [...saved, ...prev])
                setAnalysisState(null)
                setMessages([])
                news.clearAsset()
                setChartSymbol(DEFAULT_CHART_SYMBOL)
                setChartInterval(DEFAULT_CHART_INTERVAL)
                latestMessagesRef.current = []
            } catch (err) {
                console.error('[tradeIdeas] create failed', err)
            }
        }
    }

    async function handleDeleteIdea(id) {
        try {
            await tradeIdeasService.deleteIdea(id)
            setIdeas(prev => prev.filter(idea => idea.id !== id))
            if (id === editingIdeaId) handleCancelBuild()
        } catch (err) {
            console.error('[tradeIdeas] delete failed', err)
        }
    }

    async function handleDeletePortfolio(portfolioId) {
        const portfolioIdeas = ideas.filter(i => i.portfolioId === portfolioId)
        try {
            await Promise.all(portfolioIdeas.map(i => tradeIdeasService.deleteIdea(i.id)))
            setIdeas(prev => prev.filter(i => i.portfolioId !== portfolioId))
            if (portfolioIdeas.some(i => i.id === editingIdeaId)) handleCancelBuild()
            // Also delete the portfolio's chat history
            await portfolioService.deleteChatState(portfolioId)
                .catch(err => console.error('[portfolio] chat delete failed', err))
        } catch (err) {
            console.error('[portfolio] delete failed', err)
            loadIdeas()
        }
    }

    async function handleConfirmOrders(idea, orders) {
        setPlacingOrders(true)
        try {
            const updated = await tradeIdeasService.placeOrders(idea.id, orders)
            if (updated) setIdeas(prev => prev.map(i => i.id === idea.id ? updated : i))
        } catch (err) {
            console.error('[tradeIdeas] place orders failed', err)
            // Surface the broker's rejection reason (e.g. "symbol 'QQQ' not found on
            // account") instead of failing silently. The 502 body carries per-account
            // results; prefer a specific broker error, then the generic message.
            const data      = err?.response?.data
            const brokerErr = data?.results?.find(r => r && r.ok === false && r.error)?.error
            showErrorMsg(`Order placement failed: ${brokerErr || data?.error || err.message}`)
            // Keep the idea in 'hit' so the user can retry from the detail dialog
            setDismissedConfirmIds(prev => new Set(prev).add(idea.id))
        } finally {
            setPlacingOrders(false)
        }
    }

    // Both Dismiss and Reset send the triggered idea back to 'waiting'; they differ
    // only in the server-side entry-floor handling (Reset pushes the floor forward via
    // the resetWindow flag, Dismiss leaves it so a re-activation re-surfaces the event).
    // The optimistic id-set hides the dialog during the round-trip; we clear it afterwards
    // so a future re-activation that hits again will show the dialog rather than stay hidden.
    async function _sendHitToWaiting(idea, extra) {
        setDismissedConfirmIds(prev => new Set(prev).add(idea.id))
        try {
            const res = await tradeIdeasService.updateIdea(idea.id, { status: 'waiting', ...extra })
            if (res?.idea) setIdeas(prev => prev.map(i => i.id === idea.id ? res.idea : i))
        } catch (err) {
            console.error('[tradeIdeas] send hit → waiting failed', err)
        } finally {
            setDismissedConfirmIds(prev => { const next = new Set(prev); next.delete(idea.id); return next })
        }
    }

    // Dismiss: park back to waiting, entry floor untouched (changed-mind re-fire path).
    const handleDismissConfirm = idea => _sendHitToWaiting(idea, {})

    // Reset window: park back to waiting and push the entry floor forward so this event
    // can't re-fire — only new events after now will trigger.
    const handleResetWindow = idea => _sendHitToWaiting(idea, { resetWindow: true })

    function handleReopenConfirm(idea) {
        // Re-show the confirmation dialog for an idea dismissed earlier
        setDismissedConfirmIds(prev => {
            const next = new Set(prev)
            next.delete(idea.id)
            return next
        })
    }

    async function handleGeneratePlan(plan, messages = []) {
        try {
            const ideaAccounts = availableAccounts.filter(a => selectedAccounts.includes(a.id))
            const accountIds   = ideaAccounts.map(a => a.id)
            const newIdeas     = await tradeIdeasService.createBatch(plan, accountIds, mainAccountId)
            setIdeas(prev => [...newIdeas, ...prev])
            if (newIdeas.length > 0) {
                const portfolioId = newIdeas[0].portfolioId
                const chatMessages = messages.filter(m => !m.streaming).map(m => ({ role: m.role, content: m.content }))
                portfolioService.saveChatState(portfolioId, chatMessages).catch(err =>
                    console.error('[portfolio] chat state save failed', err)
                )
            }
        } catch (err) {
            console.error('[portfolio] batch create failed', err)
        }
    }

    async function handleEditPortfolio(portfolioId) {
        const portfolioIdeas = ideas.filter(i => i.portfolioId === portfolioId)

        // Seed the account selector from the portfolio's own ideas so it reflects
        // what's actually attached (not stale global selection) — and so saving the
        // edit doesn't wipe accounts the user never meant to change.
        const seedAccounts = [...new Set(portfolioIdeas.flatMap(i => Array.isArray(i.accounts) ? i.accounts : []))]
        setSelectedAccounts(seedAccounts)
        setMainAccountId(portfolioIdeas.find(i => i.mainAccountId)?.mainAccountId ?? null)

        // Editing the plan de-activates it: move every idea back to 'waiting'
        // until the user re-activates via the plan row's status toggle.
        const toReset = portfolioIdeas.filter(i => i.status !== 'waiting')
        if (toReset.length > 0) {
            setIdeas(prev => prev.map(i => i.portfolioId === portfolioId ? { ...i, status: 'waiting' } : i))
            Promise.all(toReset.map(i => tradeIdeasService.updateIdea(i.id, { status: 'waiting' })))
                .catch(err => console.error('[portfolio] reset to waiting failed', err))
        }

        try {
            const chatState = await portfolioService.getChatState(portfolioId)
            setPortfolioChatRestore({
                key: Date.now(),
                messages:      chatState?.messages ?? [],
                portfolioId,
                portfolioIdeas: portfolioIdeas.map(i => ({ ...i, status: 'waiting' })),
            })
            setActiveTab('portfolio')
        } catch (err) {
            console.error('[portfolio] restore failed', err)
            setActiveTab('portfolio')
        }
    }

    // Edit mode "Update plan": persist the edited portfolio. A re-plan (when one is
    // ready) replaces the portfolio's ideas in place, keeping the same portfolioId
    // (fixes updates creating a whole new portfolio). The chat history is saved on
    // every finish — even without a re-plan — so re-opening restores the conversation.
    async function handleUpdatePlan(plan, portfolioId, messages = []) {
        if (!portfolioId) return handleGeneratePlan(plan, messages)
        try {
            const accountIds = availableAccounts.filter(a => selectedAccounts.includes(a.id)).map(a => a.id)

            if (plan?.ideas?.length) {
                const existing   = ideas.filter(i => i.portfolioId === portfolioId)
                await Promise.all(existing.map(i => tradeIdeasService.deleteIdea(i.id)))

                const newIdeas   = await tradeIdeasService.createBatch(plan, accountIds, mainAccountId, portfolioId)
                setIdeas(prev => [...newIdeas, ...prev.filter(i => i.portfolioId !== portfolioId)])
            } else {
                // No re-plan, but the account selection may have changed while editing.
                // Push the current accounts onto every idea so a marked account actually
                // reaches the portfolio's ideas (mirrors the single-idea attach flow).
                const existing = ideas.filter(i => i.portfolioId === portfolioId)
                await Promise.all(existing.map(i => tradeIdeasService.updateIdea(i.id, { accounts: accountIds, mainAccountId })))
                setIdeas(prev => prev.map(i => i.portfolioId === portfolioId ? { ...i, accounts: accountIds, mainAccountId } : i))
            }

            const chatMessages = messages.filter(m => !m.streaming).map(m => ({ role: m.role, content: m.content }))
            await portfolioService.saveChatState(portfolioId, chatMessages).catch(err =>
                console.error('[portfolio] chat state save failed', err)
            )
        } catch (err) {
            console.error('[portfolio] update plan failed', err)
            loadIdeas()
        }
    }

    async function handlePortfolioUpdate(update) {
        if (!update?.changes?.length) return
        try {
            const promises = []
            for (const change of update.changes) {
                if (change.action === 'update_idea' && change.ideaId && change.patch) {
                    promises.push(tradeIdeasService.updateIdea(change.ideaId, change.patch))
                } else if (change.action === 'remove_idea' && change.ideaId) {
                    promises.push(tradeIdeasService.deleteIdea(change.ideaId))
                } else if (change.action === 'add_idea' && change.idea) {
                    const existing = ideas.filter(i => i.portfolioId === update.portfolioId)
                    promises.push(tradeIdeasService.createIdea({
                        ...change.idea,
                        portfolioId:   update.portfolioId,
                        portfolioName: existing[0]?.portfolioName || 'Portfolio',
                        accounts:      selectedAccounts,
                        mainAccountId,
                    }))
                }
            }
            await Promise.all(promises)
            loadIdeas()
        } catch (err) {
            console.error('[portfolio] update failed', err)
        }
    }

    function handleTickerSelect(ticker) {
        // Switch to idea tab and set the chart to the selected ticker
        setActiveTab('idea')
        setChartSymbol(ticker)
        // If not already editing an idea, clear state so chat is ready for new idea
        if (!editingIdeaId && messages.length === 0) {
            setAnalysisState(null)
        }
    }

    // Shared by the desktop workspace chat and the mobile chat sheet so the two
    // instances never drift. The mobile sheet overrides onGenerate to also close.
    const chatPanelProps = {
        messages,
        analysisState,
        onSend:              handleSend,
        onGenerate:          handleGenerate,
        onClear:             handleCancelBuild,
        isLoading,
        isEditing:           !!editingIdeaId,
        availableAccounts,
        selectedAccounts,
        onAccountsChange:    setSelectedAccounts,
        mainAccountId,
        onMainAccountChange: setMainAccountId,
        model:               ideaModel,
        onModelChange:       handleIdeaModelChange,
    }

    return (
        <>
            <main>
                {/* ── Desktop / tablet workspace ── */}
                <div className="workspace">
                    <div className="workspace__chart">
                        <TradingViewChart symbol={chartSymbol} interval={chartInterval} />
                    </div>
                    <div className="workspace__chat">
                        <div className="chat-tabs">
                            <button
                                className={`chat-tabs__tab${activeTab === 'idea' ? ' chat-tabs__tab--active' : ''}`}
                                onClick={() => setActiveTab('idea')}
                            >Idea</button>
                            <button
                                className={`chat-tabs__tab chat-tabs__tab--portfolio${activeTab === 'portfolio' ? ' chat-tabs__tab--active' : ''}`}
                                onClick={() => setActiveTab('portfolio')}
                            >Portfolio</button>
                        </div>
                        <div className="chat-tabs__panel" style={{ display: activeTab === 'idea' ? 'flex' : 'none' }}>
                            <ChatPanel {...chatPanelProps} />
                        </div>
                        <div className="chat-tabs__panel" style={{ display: activeTab === 'portfolio' ? 'flex' : 'none' }}>
                            <PortfolioPanel
                                onTickerSelect={handleTickerSelect}
                                onGeneratePlan={handleGeneratePlan}
                                onUpdatePlan={handleUpdatePlan}
                                onPortfolioUpdate={handlePortfolioUpdate}
                                onBuildingPlanChange={setBuildingPortfolio}
                                chatRestore={portfolioChatRestore}
                                availableAccounts={availableAccounts}
                                selectedAccounts={selectedAccounts}
                                onAccountsChange={setSelectedAccounts}
                                mainAccountId={mainAccountId}
                                onMainAccountChange={setMainAccountId}
                            />
                        </div>
                    </div>
                    <div className="workspace__news">
                        <NewsFeed
                            articles={news.activeNewsSymbol ? news.assetArticles : news.newsArticles}
                            isLoading={news.activeNewsSymbol ? news.assetNewsLoading : news.newsLoading}
                            sentimentLoading={!!news.activeNewsSymbol && news.assetSentimentLoading}
                            symbol={news.activeNewsSymbol}
                        />
                    </div>
                    <div className="workspace__ideas">
                        <TradeIdeasList
                            ideas={ideas
                                .filter(i => i.status !== 'closed')
                                .filter(i => i.id !== editingIdeaId)}
                            chatTab={activeTab}
                            buildingIdea={buildingIdea}
                            buildingPortfolio={buildingPortfolio}
                            onDelete={handleDeleteIdea}
                            onCancelBuild={handleCancelBuild}
                            onStatusChange={handleStatusChange}
                            onSymbolClick={setChartSymbol}
                            onEdit={handleEditIdea}
                            onEditPortfolio={handleEditPortfolio}
                            onDeletePortfolio={handleDeletePortfolio}
                            onPlaceOrder={handleReopenConfirm}
                            positions={positions}
                            positionsLoading={positionsLoading}
                            onRefreshPositions={refreshPositions}
                            onClosePosition={closePosition}
                        />
                    </div>
                </div>

                {/* ── Mobile monitor dashboard ── */}
                <MonitorDashboard
                    ideas={ideas.filter(i => i.status !== 'closed')}
                    onDelete={handleDeleteIdea}
                    onEdit={handleEditIdea}
                />
            </main>

            {/* ── Mobile chat: floating trigger + full-screen sheet ── */}
            <button
                className="mobile-chat-fab"
                onClick={() => setMobileChatOpen(true)}
                aria-label="Build a trade idea"
            >
                <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <line x1="10" y1="5" x2="10" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <circle cx="10" cy="1.5" r="1" fill="currentColor"/>
                    <rect x="2" y="5" width="16" height="12" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                    <circle cx="7" cy="10" r="1.8" fill="currentColor"/>
                    <circle cx="13" cy="10" r="1.8" fill="currentColor"/>
                    <rect x="6.5" y="13" width="7" height="1.5" rx="0.75" fill="currentColor"/>
                </svg>
            </button>

            {mobileChatOpen && (
                <div className="mobile-chat-sheet">
                    <div className="mobile-chat-sheet__bar">
                        <span className="mobile-chat-sheet__title">Build idea</span>
                        <button
                            className="mobile-chat-sheet__close"
                            onClick={() => setMobileChatOpen(false)}
                            aria-label="Close"
                        >✕</button>
                    </div>
                    <div className="mobile-chat-sheet__body">
                        <ChatPanel
                            {...chatPanelProps}
                            onGenerate={async () => { await handleGenerate(); setMobileChatOpen(false) }}
                        />
                    </div>
                </div>
            )}

            {confirmIdea && confirmOrders.length > 0 && (
                <OrderConfirmDialog
                    idea={confirmIdea}
                    orders={confirmOrders}
                    placing={placingOrders}
                    onConfirm={handleConfirmOrders}
                    onDismiss={handleDismissConfirm}
                    onReset={handleResetWindow}
                />
            )}
        </>
    )
}
