import { useState, useEffect, useCallback, useRef } from 'react'

import { ChatPanel }         from '../cmps/ChatPanel/ChatPanel.jsx'
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
import { brokerService }     from '../services/broker/broker.service.remote.js'

const NEWS_STREAM_URL = import.meta.env.PROD
    ? '/news-feed/stream'
    : 'http://localhost:3030/news-feed/stream'

const NEWS_ASSET_BASE = import.meta.env.PROD
    ? '/news-feed/asset'
    : 'http://localhost:3030/news-feed/asset'

const COMPANY_NEWS_INTERVAL_MS = 30 * 60 * 1000

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
        direction:        pt.direction       || null,
        type:             pt.type            || null,
        quantity:         pt.quantity        ?? null,
        immediate:        pt.immediate       || false,
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
    const [newsArticles, setNewsArticles] = useState([])
    const [newsLoading, setNewsLoading] = useState(false)
    const [activeNewsSymbol, setActiveNewsSymbol] = useState(null)
    const [activeNewsQuery, setActiveNewsQuery]   = useState(null)
    const [assetArticles, setAssetArticles] = useState([])
    const [assetNewsLoading, setAssetNewsLoading] = useState(false)
    const [assetSentimentLoading, setAssetSentimentLoading] = useState(false)
    const [ideas, setIdeas] = useState([])
    const [editingIdeaId, setEditingIdeaId] = useState(null)
    const [availableAccounts, setAvailableAccounts] = useState([])
    const [selectedAccounts, setSelectedAccounts]   = useState([])
    const [mainAccountId, setMainAccountId]         = useState(null)
    const [activeTab, setActiveTab]             = useState('idea')
    const [portfolioChatRestore, setPortfolioChatRestore] = useState(null)
    const [buildingPortfolio, setBuildingPortfolio] = useState(null)
    const [dismissedConfirmIds, setDismissedConfirmIds] = useState(() => new Set())
    const [placingOrders, setPlacingOrders] = useState(false)
    const latestMessagesRef    = useRef([])
    const lastFetchedAssetRef  = useRef(null)

    // ── Typewriter queue ──────────────────────────────────────────────────────
    // Tokens from the API go into the queue (ref — zero React overhead).
    // A 16ms drain timer flushes a small chunk per frame, producing smooth output.
    const tokenQueueRef = useRef('')
    const drainTimerRef = useRef(null)

    function _startDrain() {
        if (drainTimerRef.current) return
        drainTimerRef.current = setInterval(() => {
            const q = tokenQueueRef.current
            if (!q.length) return
            const chunk = q.slice(0, 1)
            tokenQueueRef.current = q.slice(1)
            setMessages(prev => {
                const msgs = [...prev]
                const last = msgs[msgs.length - 1]
                if (!last?.streaming) return prev
                msgs[msgs.length - 1] = { ...last, content: last.content + chunk }
                return msgs
            })
        }, 60)
    }

    function _stopDrain() {
        clearInterval(drainTimerRef.current)
        drainTimerRef.current = null
        tokenQueueRef.current = ''
    }

    const buildingIdea = deriveBuildingIdea(analysisState)
    // buildingPortfolio is reported up from PortfolioPanel (assets recommended /
    // pending plan) → drives the list's "building" portfolio row.

    // First idea awaiting order confirmation: orderState 'awaiting_confirm' (or a
    // legacy hit idea saved before orderState existed), with accounts, not yet
    // placed and not dismissed. 'awaiting_market' ideas stay deferred (no dialog).
    const confirmIdea = ideas.find(i =>
        !i.ordersPlacedAt &&
        !dismissedConfirmIds.has(i.id) &&
        Array.isArray(i.accounts) && i.accounts.length > 0 &&
        (i.orderState === 'awaiting_confirm' || (i.orderState == null && i.status === 'hit'))
    )
    // Prefer the server-built plan; fall back to a client preview for legacy ideas.
    const confirmOrders = !confirmIdea
        ? []
        : confirmIdea.pendingOrder?.plan?.length
            ? confirmIdea.pendingOrder.plan.map(o => ({
                broker:    o.broker,
                accountId: o.accountId,
                accountNo: o.accountNo,
                quantity:  o.quantity,
                orderType: orderTypeLabel(confirmIdea.direction, o.type),
                isMain:    String(o.accountId) === String(confirmIdea.mainAccountId),
            }))
            : buildOrderPreview(confirmIdea, availableAccounts)

    useEffect(() => {
        setNewsLoading(true)
        const es = new EventSource(NEWS_STREAM_URL)

        es.onmessage = (e) => {
            try {
                const articles = JSON.parse(e.data)
                setNewsArticles(articles)
            } catch {
                console.error('[newsFeed] parse error', e.data)
            } finally {
                setNewsLoading(false)
            }
        }

        es.onerror = () => setNewsLoading(false)

        return () => es.close()
    }, [])

    useEffect(() => {
        if (!activeNewsSymbol || !activeNewsQuery) {
            setAssetArticles([])
            setAssetNewsLoading(false)
            setAssetSentimentLoading(false)
            return
        }

        let active = true
        const sym  = encodeURIComponent(activeNewsSymbol)
        const q    = encodeURIComponent(activeNewsQuery)

        function doFetch() {
            if (!active) return
            setAssetNewsLoading(true)
            setAssetSentimentLoading(false)

            // Phase 1 — render articles ASAP (no LLM on the server)
            fetch(`${NEWS_ASSET_BASE}/${sym}?q=${q}`)
                .then(r => r.json())
                .then(d => {
                    if (!active) return
                    const articles = Array.isArray(d.articles) ? d.articles : []
                    setAssetArticles(articles)
                    setAssetNewsLoading(false)
                    if (articles.length === 0) return

                    // Phase 2 — LLM relevance filter + sentiment
                    setAssetSentimentLoading(true)
                    fetch(`${NEWS_ASSET_BASE}/${sym}/sentiment?q=${q}`)
                        .then(r => r.json())
                        .then(s => {
                            if (!active) return
                            const enriched = Array.isArray(s.articles) ? s.articles : []
                            const byUrl    = new Map(enriched.map(a => [a.url, a]))
                            setAssetArticles(prev => {
                                const reconciled = prev
                                    .filter(a => byUrl.has(a.url))
                                    .map(a => ({ ...a, sentiment: byUrl.get(a.url).sentiment, confidence: byUrl.get(a.url).confidence }))
                                return reconciled.length > 0 ? reconciled : enriched
                            })
                        })
                        .catch(() => {})
                        .finally(() => { if (active) setAssetSentimentLoading(false) })
                })
                .catch(() => { if (active) { setAssetArticles([]); setAssetNewsLoading(false) } })
        }

        doFetch()
        const interval = setInterval(doFetch, COMPANY_NEWS_INTERVAL_MS)

        return () => {
            active = false
            clearInterval(interval)
            setAssetArticles([])
        }
    }, [activeNewsQuery])

    const loadIdeas = useCallback(async () => {
        try {
            const fetched = await tradeIdeasService.getIdeas()
            setIdeas(fetched)
        } catch (err) {
            console.error('[tradeIdeas] load failed', err)
        }
    }, [])

    useEffect(() => {
        loadIdeas()
        const interval = setInterval(loadIdeas, 30_000)
        return () => clearInterval(interval)
    }, [loadIdeas])

    useEffect(() => {
        if (selectedAccounts.length === 1) {
            setMainAccountId(selectedAccounts[0])
        } else if (selectedAccounts.length === 0) {
            setMainAccountId(null)
        }
        // length > 1: keep existing main as-is
    }, [selectedAccounts])

    useEffect(() => {
        async function fetchAccounts() {
            try {
                const connections = await brokerService.listConnections()
                const all = []
                for (const [broker, connected] of Object.entries(connections)) {
                    if (!connected) continue
                    const { accounts = [] } = await brokerService.getTradingAccounts(broker)
                    accounts.forEach(a => all.push({ ...a, broker }))
                }
                setAvailableAccounts(all)
            } catch (err) {
                console.error('[accounts] fetch failed', err)
            }
        }
        fetchAccounts()
    }, [])


    async function handleSend(userPrompt, currentAnalysisState) {
        setMessages(prev => [
            ...prev,
            { role: 'user', content: userPrompt },
            { role: 'assistant', content: '', streaming: true },
        ])
        setIsLoading(true)
        _startDrain()

        try {
            const ideaAccounts = availableAccounts.filter(a => selectedAccounts.includes(a.id))
        await userPromptService.sendPromptStream(
                userPrompt,
                currentAnalysisState,
                {
                    // Buffer only — drain timer handles the actual state updates
                    onToken:    (text)     => { tokenQueueRef.current += text },
                    onInterval: (interval) => { if (interval) setChartInterval(interval) },
                    onAsset: (symbol) => {
                        if (symbol) {
                            setChartSymbol(symbol)
                            if (symbol !== lastFetchedAssetRef.current) {
                                setActiveNewsSymbol(symbol)
                                setAssetNewsLoading(true)
                            }
                        }
                    },

                    onDone: (data) => {
                        _stopDrain()
                        console.log('[stream done]', data)
                        setMessages(prev => {
                            const msgs = [...prev]
                            const last = msgs[msgs.length - 1]
                            if (last?.streaming) {
                                msgs[msgs.length - 1] = { role: 'assistant', content: data.reply, analysisState: data.analysisState ?? null }
                            }
                            latestMessagesRef.current = msgs
                            return msgs
                        })
                        setAnalysisState(data.analysisState ?? null)
                        const newAsset   = data.analysisState?.structured_state?.active_asset
                        const newCompany = data.analysisState?.structured_state?.active_company_name
                        if (newAsset) setChartSymbol(newAsset)
                        // Follow the established timeframe even if the LLM omitted <interval>
                        const newInterval = deriveChartInterval(data.analysisState?.structured_state?.pending_trade)
                        if (newInterval) setChartInterval(newInterval)
                        if (newAsset && newAsset !== lastFetchedAssetRef.current) {
                            lastFetchedAssetRef.current = newAsset
                            setActiveNewsSymbol(newAsset)
                            setActiveNewsQuery(newCompany || newAsset)
                            setAssetNewsLoading(true)
                        }
                        if (data.ideaSaved) loadIdeas()

                        // Save chat state progressively when editing
                        if (editingIdeaId && data.analysisState) {
                            tradeIdeasService.updateIdea(editingIdeaId, {
                                chat_state: { messages: latestMessagesRef.current, analysisState: data.analysisState }
                            }).catch(err => console.error('[chat_state] save failed', err))
                        }
                    },

                    onError: (message) => {
                        _stopDrain()
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
                ideaAccounts
            )
        } catch (err) {
            console.error(err)
            _stopDrain()
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
        setActiveNewsSymbol(null)
        setActiveNewsQuery(null)
        setChartSymbol(DEFAULT_CHART_SYMBOL)
        setChartInterval(DEFAULT_CHART_INTERVAL)
        latestMessagesRef.current   = []
        lastFetchedAssetRef.current = null
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
                setActiveNewsSymbol(null)
                setActiveNewsQuery(null)
                setChartSymbol(DEFAULT_CHART_SYMBOL)
                setChartInterval(DEFAULT_CHART_INTERVAL)
                latestMessagesRef.current   = []
                lastFetchedAssetRef.current = null
            } catch (err) {
                console.error('[tradeIdeas] edit update failed', err)
            }
        } else {
            try {
                const saved = await tradeIdeasService.createIdea({ ...ideaFields, chat_state: chatState, accounts: selectedAccounts, mainAccountId })
                setIdeas(prev => [saved, ...prev])
                setAnalysisState(null)
                setMessages([])
                setActiveNewsSymbol(null)
                setActiveNewsQuery(null)
                setChartSymbol(DEFAULT_CHART_SYMBOL)
                setChartInterval(DEFAULT_CHART_INTERVAL)
                latestMessagesRef.current   = []
                lastFetchedAssetRef.current = null
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

    async function handleStatusChange(id, status) {
        // Optimistic update — React controlled selects snap back without this
        setIdeas(prev => prev.map(idea => idea.id === id ? { ...idea, status } : idea))
        try {
            const res = await tradeIdeasService.updateIdea(id, { status })
            // Confirm with the server's returned document
            setIdeas(prev => prev.map(idea => idea.id === id ? res.idea : idea))
        } catch (err) {
            console.error('[tradeIdeas] status update failed', err)
            // Revert by reloading from server
            loadIdeas()
        }
    }

    async function handleUpdateIdea(id, patch) {
        try {
            const res = await tradeIdeasService.updateIdea(id, patch)
            setIdeas(prev => prev.map(idea => idea.id === id ? res.idea : idea))
        } catch (err) {
            console.error('[tradeIdeas] update failed', err)
        }
    }

    async function handleConfirmOrders(idea, orders) {
        setPlacingOrders(true)
        try {
            const updated = await tradeIdeasService.placeOrders(idea.id, orders)
            if (updated) setIdeas(prev => prev.map(i => i.id === idea.id ? updated : i))
        } catch (err) {
            console.error('[tradeIdeas] place orders failed', err)
            // Keep the idea in 'hit' so the user can retry from the detail dialog
            setDismissedConfirmIds(prev => new Set(prev).add(idea.id))
        } finally {
            setPlacingOrders(false)
        }
    }

    function handleDismissConfirm(idea) {
        setDismissedConfirmIds(prev => new Set(prev).add(idea.id))
    }

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
            if (plan?.ideas?.length) {
                const existing   = ideas.filter(i => i.portfolioId === portfolioId)
                await Promise.all(existing.map(i => tradeIdeasService.deleteIdea(i.id)))

                const accountIds = availableAccounts.filter(a => selectedAccounts.includes(a.id)).map(a => a.id)
                const newIdeas   = await tradeIdeasService.createBatch(plan, accountIds, mainAccountId, portfolioId)
                setIdeas(prev => [...newIdeas, ...prev.filter(i => i.portfolioId !== portfolioId)])
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
                            <ChatPanel
                                messages={messages}
                                analysisState={analysisState}
                                onSend={handleSend}
                                onGenerate={handleGenerate}
                                onClear={handleCancelBuild}
                                isLoading={isLoading}
                                isEditing={!!editingIdeaId}
                                availableAccounts={availableAccounts}
                                selectedAccounts={selectedAccounts}
                                onAccountsChange={setSelectedAccounts}
                                mainAccountId={mainAccountId}
                                onMainAccountChange={setMainAccountId}
                            />
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
                            articles={activeNewsSymbol ? assetArticles : newsArticles}
                            isLoading={activeNewsSymbol ? assetNewsLoading : newsLoading}
                            sentimentLoading={!!activeNewsSymbol && assetSentimentLoading}
                            symbol={activeNewsSymbol}
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
                            onUpdate={handleUpdateIdea}
                            onSymbolClick={setChartSymbol}
                            onEdit={handleEditIdea}
                            onEditPortfolio={handleEditPortfolio}
                            onDeletePortfolio={handleDeletePortfolio}
                            onPlaceOrder={handleReopenConfirm}
                        />
                    </div>
                </div>

                {/* ── Mobile monitor dashboard ── */}
                <MonitorDashboard
                    ideas={ideas.filter(i => i.status !== 'closed')}
                    newsArticles={newsArticles}
                    newsLoading={newsLoading}
                    onUpdate={handleUpdateIdea}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDeleteIdea}
                    onEdit={handleEditIdea}
                />
            </main>

            {confirmIdea && confirmOrders.length > 0 && (
                <OrderConfirmDialog
                    idea={confirmIdea}
                    orders={confirmOrders}
                    placing={placingOrders}
                    onConfirm={handleConfirmOrders}
                    onDismiss={handleDismissConfirm}
                />
            )}
        </>
    )
}
