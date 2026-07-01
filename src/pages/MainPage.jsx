import { useState, useRef, useEffect } from 'react'

import { ChatPanel }         from '../cmps/ChatPanel/ChatPanel.jsx'
import { readStoredModel }   from '../cmps/modelOptions.js'
import { readStoredReasoning } from '../cmps/reasoningOptions.js'
import { readStoredRoutingMode } from '../cmps/RoutingModeSelector.jsx'
import { PortfolioPanel }    from '../cmps/PortfolioPanel/PortfolioPanel.jsx'
import { ScannerPanel }      from '../cmps/ScannerPanel/ScannerPanel.jsx'
import { Radar }             from '../cmps/Radar/Radar.jsx'
import { TradingViewChart }  from '../cmps/TradingViewChart/TradingViewChart.jsx'
import { TradeIdeasList }    from '../cmps/TradeIdeas/TradeIdeasList.jsx'
import { OrderConfirmDialog } from '../cmps/TradeIdeas/OrderConfirmDialog.jsx'
import { DeleteIdeaDialog }   from '../cmps/TradeIdeas/DeleteIdeaDialog.jsx'
import { buildOrderPreview, orderTypeLabel, isDeleteLocked, isDeleteConfirmRequired, deriveIdeaInterval } from '../cmps/TradeIdeas/tradeIdea.utils.js'
import { MonitorDashboard }  from '../cmps/MonitorDashboard/MonitorDashboard.jsx'
import { userPromptService } from '../services/userPrompt/userPrompt.service.remote.js'
import { toolStatusLabel }   from '../services/toolStatusLabels.js'
import { tradeIdeasService } from '../services/tradeIdeas/tradeIdeas.service.remote.js'
import { portfolioService }  from '../services/portfolio/portfolio.service.remote.js'
import { showErrorMsg, eventBus, INVALIDATION_EDIT_IDEA, PORTFOLIO_REVIEW } from '../services/event-bus.service'
import { useTypewriter }     from '../customHooks/useTypewriter.js'
import { useTextPace }       from '../customHooks/useTextPace.js'
import { useNewsFeed }       from '../customHooks/useNewsFeed.js'
import { useCalendarEvents } from '../customHooks/useCalendarEvents.js'
import { useScans }          from '../customHooks/useScans.js'
import { useBrokerAccounts } from '../customHooks/useBrokerAccounts.js'
import { usePositions }      from '../customHooks/usePositions.js'
import { useTradeIdeas }     from '../customHooks/useTradeIdeas.js'
import { useAuth }           from '../context/AuthContext.jsx'

// Chart defaults — restored when a build/edit session ends.
const DEFAULT_CHART_SYMBOL   = 'SPY'
const DEFAULT_CHART_INTERVAL = 'D'

// Chart bubbles are persisted in chat_state (so they re-show on edit) but capped
// so accumulated base64 doesn't bloat the idea doc. Keeps the most recent charts,
// dropping the oldest first; non-chart messages are untouched.
const MAX_PERSISTED_CHARTS = 4
function _capPersistedCharts(msgs) {
    let over = msgs.filter(m => m.type === 'chart').length - MAX_PERSISTED_CHARTS
    if (over <= 0) return msgs
    return msgs.filter(m => {
        if (m.type === 'chart' && over > 0) { over--; return false }
        return true
    })
}

// The persisted messages array is display-only (re-shown on edit); the model
// restores context from analysisState, not this. Cap it to the most recent N so
// the save/update payload stays small over the wire — mirrors the backend trim.
const MAX_PERSISTED_MESSAGES = 40
function _capPersistedMessages(msgs) {
    if (!Array.isArray(msgs) || msgs.length <= MAX_PERSISTED_MESSAGES) return msgs
    return msgs.slice(-MAX_PERSISTED_MESSAGES)
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
        conviction:       pt.conviction       || null,
        invalidation:     pt.invalidation     || null,
    }
}

function _periodPhrase(period) {
    if (!period) return ''
    const range = period.start && period.end && period.start !== period.end
        ? `${period.start} – ${period.end}`
        : (period.start || period.end || '')
    return [period.label, range && `(${range})`].filter(Boolean).join(' ')
}

// Readable summary of a scan candidate, shown as an assistant bubble when the
// user opens it — markdown so it renders nicely in the chat.
function buildCandidateSummary(c, period) {
    const dir   = c.direction === 'short' ? 'short' : 'long'
    const lines = [`**Scan pick — ${c.ticker}${c.name ? ` · ${c.name}` : ''} — ${dir.toUpperCase()}**`]

    const when = _periodPhrase(period)
    if (when) lines.push(`*Time horizon: ${when}*`)

    if (c.thesis)   lines.push(`\n**Thesis:** ${c.thesis}`)
    if (c.analysis) lines.push(`\n${c.analysis}`)

    const signals = c.signals && Object.entries(c.signals).filter(([, v]) => v)
    if (signals?.length) {
        lines.push('\n**Signals**')
        signals.forEach(([k, v]) => lines.push(`- **${k}:** ${v}`))
    }
    if (c.sources?.length) {
        lines.push('\n**Sources**')
        c.sources.forEach(s => lines.push(`- [${s.title || s.url}](${s.url})`))
    }

    lines.push(`\n_Ask me about entry, stop, or take-profit and I'll build this into a trade — I already have the scan context above._`)
    return lines.join('\n')
}

// Same context, phrased for the idea agent's system prompt (recent_chat_summary).
// Lets the agent answer the user's first question already knowing the candidate,
// without pre-filling structured trade fields (keeps the idea flow natural).
function buildCandidateContext(c, period) {
    const dir  = c.direction === 'short' ? 'short' : 'long'
    const when = _periodPhrase(period)
    const signals = c.signals && Object.entries(c.signals).filter(([, v]) => v)
    return [
        `The user opened this trade idea from a market scan and is reading the candidate summary.`,
        `Pick: ${c.ticker}${c.name ? ` (${c.name})` : ''}, intended direction ${dir}.`,
        when ? `Time horizon: ${when} — treat this as the idea's intended time condition.` : '',
        c.thesis   ? `Scanner thesis: ${c.thesis}` : '',
        c.analysis ? `Scanner analysis: ${c.analysis}` : '',
        signals?.length ? `Signals — ${signals.map(([k, v]) => `${k}: ${v}`).join('; ')}.` : '',
        `Do not respond yet; when the user asks, use this context to help shape the trade (entry, stop, take-profit) and set the time condition from the horizon.`,
    ].filter(Boolean).join(' ')
}

export function MainPage() {
    const [messages, setMessages] = useState([])
    const [analysisState, setAnalysisState] = useState(null)
    const [chartSymbol, setChartSymbol]   = useState(DEFAULT_CHART_SYMBOL)
    const [chartInterval, setChartInterval] = useState(DEFAULT_CHART_INTERVAL)
    const [isLoading, setIsLoading] = useState(false)
    const [streamStatus, setStreamStatus] = useState('')
    const [chatPhase, setChatPhase] = useState(null)
    const [editingIdeaId,     setEditingIdeaId]     = useState(null)
    const [isInvalidationReview, setIsInvalidationReview] = useState(false)
    const [activeTab, setActiveTab]             = useState('idea')
    const [newsTab, setNewsTab]                 = useState('news')
    const [scannerChatRestore, setScannerChatRestore] = useState(null)
    const [portfolioChatRestore, setPortfolioChatRestore] = useState(null)
    const [buildingPortfolio, setBuildingPortfolio] = useState(null)
    const [dismissedConfirmIds, setDismissedConfirmIds] = useState(() => new Set())
    const [placingOrders, setPlacingOrders] = useState(false)
    const [pendingDeleteIdea, setPendingDeleteIdea] = useState(null)
    const [pendingRebalance,  setPendingRebalance]  = useState(null)
    const [applyingRebalance, setApplyingRebalance] = useState(false)
    const [deletingIdea, setDeletingIdea] = useState(false)
    const [mobileChatOpen, setMobileChatOpen] = useState(false)
    const latestMessagesRef = useRef([])
    const abortRef          = useRef(null)

    const news = useNewsFeed()
    const { earnings, earningsDate, earningsLoading, fda, fdaDate, fdaLoading } = useCalendarEvents()
    const { scans, loading: scansLoading, createScan, updateScan, deleteScan } = useScans()
    const { user } = useAuth()
    const { availableAccounts, selectedAccounts, setSelectedAccounts, mainAccountId, setMainAccountId } = useBrokerAccounts()
    const { positions, loading: positionsLoading, refresh: refreshPositions, closePosition } = usePositions()
    const { ideas, setIdeas, loadIdeas, handleStatusChange } = useTradeIdeas()

    // Typewriter queue — smooths streamed tokens into the last message at the
    // user's chosen pace (the global text-speed slider)
    const { paceCps } = useTextPace()
    const { enqueue: enqueueToken, start: startDrain, stop: stopDrain, finish: finishDrain } = useTypewriter(setMessages, paceCps)

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
        setStreamStatus('')
        startDrain()

        const ctrl = new AbortController()
        abortRef.current = ctrl

        // On a clean finish we keep isLoading true until the typewriter has fully
        // drained (cleared from finishDrain's onComplete), so the Stop button stays
        // live while text is still being typed out. Error/abort paths clear it in
        // the finally below (drain is hard-stopped there, so onComplete won't fire).
        let deferLoading = false
        let reasoningAcc = ''

        try {
            const ideaAccounts = availableAccounts.filter(a => selectedAccounts.includes(a.id))
            await userPromptService.sendPromptStream(
                userPrompt,
                currentAnalysisState,
                {
                    signal: ctrl.signal,
                    // Buffer only — drain timer handles the actual state updates
                    onToken:    (text)     => { setStreamStatus(''); enqueueToken(text) },
                    onStatus:   (tool)     => { setStreamStatus(toolStatusLabel(tool)) },
                    onInterval: (interval) => { if (interval) setChartInterval(interval) },
                    onReasoning: (text)    => {
                        reasoningAcc += text
                        setMessages(prev => {
                            const idx = prev.findIndex(m => m.streaming)
                            if (idx < 0) return prev
                            const next = [...prev]
                            next[idx] = { ...next[idx], reasoning: reasoningAcc }
                            return next
                        })
                    },
                    onPhase:    (phase)    => {
                        if (!phase) return
                        // Only mark the phase when it actually changes — the model emits
                        // a phase tag every turn, so this avoids a repeated heading.
                        const changed = phase !== chatPhase
                        setChatPhase(phase)
                        if (!changed) return
                        setMessages(prev => {
                            const idx = prev.findIndex(m => m.streaming)
                            if (idx < 0) return prev
                            const next = [...prev]
                            next.splice(idx, 0, { role: 'phase', phase })
                            return next
                        })
                    },
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
                        const finalMsg = { role: 'assistant', content: data.reply, analysisState: data.analysisState ?? null, ...(reasoningAcc ? { reasoning: reasoningAcc } : {}) }
                        // Mirror the final messages into the persisted-state ref now —
                        // so a navigate/generate while the typewriter is still catching
                        // up still saves the complete reply — without changing what's on
                        // screen (the read returns prev unchanged).
                        setMessages(prev => {
                            const finalMsgs = prev.map((m, i) => (i === prev.length - 1 && m.streaming ? finalMsg : m))
                            // Keep chart bubbles in the saved chat_state so they re-render
                            // when the idea is reopened for editing. They stay display-only:
                            // the trade chat sends analysisState (text), never this messages
                            // array, so charts never enter the model's context. Cap the count
                            // so the saved base64 doesn't bloat the idea doc / each progressive
                            // save (oldest charts are dropped first).
                            latestMessagesRef.current = _capPersistedCharts(finalMsgs)
                            return prev
                        })
                        // Visually finish typing the backlog, then swap in finalMsg —
                        // no end-of-stream dump. Keep Stop live until the drain ends.
                        deferLoading = true
                        finishDrain(finalMsg, () => setIsLoading(false))
                        // Save chat state progressively when editing
                        if (editingIdeaId && data.analysisState) {
                            tradeIdeasService.updateIdea(editingIdeaId, {
                                chat_state: { messages: _capPersistedMessages(latestMessagesRef.current), analysisState: data.analysisState }
                            }).catch(err => console.error('[chat_state] save failed', err))
                        }
                        setAnalysisState(data.analysisState ?? null)
                        const newAsset   = data.analysisState?.structured_state?.active_asset
                        const newCompany = data.analysisState?.structured_state?.active_company_name
                        if (newAsset) setChartSymbol(newAsset)
                        // Follow the established timeframe even if the LLM omitted <interval>
                        const newInterval = deriveIdeaInterval(data.analysisState?.structured_state?.pending_trade)
                        if (newInterval) setChartInterval(newInterval)
                        news.focusAsset(newAsset, newCompany)
                        if (data.ideaSaved) loadIdeas()
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
                readStoredModel('ideaModel'),
                readStoredReasoning('ideaReasoning'),
                readStoredRoutingMode('ideaRoutingMode'),
                chatPhase
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
            if (!deferLoading) setIsLoading(false)
            setStreamStatus('')
        }
    }

    // Stop a streaming idea-chat response: abort the request, freeze the partial
    // reply, free the input. postSSE swallows the abort so no error bubble shows.
    function handleStopIdea() {
        abortRef.current?.abort()
        stopDrain()
        setMessages(prev => {
            const msgs = [...prev]
            const last = msgs[msgs.length - 1]
            if (last?.streaming) msgs[msgs.length - 1] = { role: 'assistant', content: last.content || '_(stopped)_' }
            return msgs
        })
        setIsLoading(false)
        setStreamStatus('')
    }

    function handleCancelBuild() {
        setAnalysisState(null)
        setMessages([])
        setEditingIdeaId(null)
        setIsInvalidationReview(false)
        news.clearAsset()
        setChartSymbol(DEFAULT_CHART_SYMBOL)
        setChartInterval(DEFAULT_CHART_INTERVAL)
        setChatPhase(null)
        latestMessagesRef.current = []
    }

    function handleEditIdea(idea, { invalidationReview = false } = {}) {
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
                    invalidation:     idea.invalidation     ?? null,
                },
            },
        }
        const restoredMessages = cs?.messages ?? []
        setMessages(restoredMessages)
        latestMessagesRef.current = restoredMessages
        setAnalysisState(restoredState)
        setChartSymbol(restoredState.structured_state?.active_asset || idea.asset || 'SPY')
        const editInterval = deriveIdeaInterval(restoredState.structured_state?.pending_trade)
        if (editInterval) setChartInterval(editInterval)
        setEditingIdeaId(idea.id)
        setIsInvalidationReview(invalidationReview)
        setSelectedAccounts(Array.isArray(idea.accounts) ? idea.accounts : [])
        setMainAccountId(idea.mainAccountId ?? null)
    }

    // Keep a ref so the invalidation-alert handler always sees the latest ideas
    // list without needing to be recreated on every render.
    const ideasRef = useRef(ideas)
    ideasRef.current = ideas
    useEffect(() => {
        return eventBus.on(INVALIDATION_EDIT_IDEA, ({ ideaId }) => {
            const idea = ideasRef.current.find(i => i.id === ideaId)
            if (idea) handleEditIdea(idea, { invalidationReview: true })
        })
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        return eventBus.on(PORTFOLIO_REVIEW, ({ portfolioId }) => {
            handleEditPortfolio(portfolioId, { reviewMode: true })
        })
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    async function handleBuyMarket() {
        if (!buildingIdea) return
        const { id: _id, status: _status, ...ideaFields } = buildingIdea
        const chatState = { messages: _capPersistedMessages(latestMessagesRef.current), analysisState }
        try {
            const saved = await tradeIdeasService.createIdea({
                ...ideaFields,
                immediate:  true,
                chat_state: chatState,
                accounts:   selectedAccounts,
                mainAccountId,
            })
            setIdeas(prev => [...saved, ...prev])
            // Keep chat open so user can add stops/TPs; point edit session at the
            // primary idea (first returned, before any broker-fork children).
            if (saved[0]?.id) setEditingIdeaId(saved[0].id)
        } catch (err) {
            console.error('[tradeIdeas] buy market failed', err)
        }
    }

    async function handleGenerate() {
        if (!buildingIdea) {
            // Nothing to save — if we're editing, just leave edit mode so the
            // user is never stuck (the Update button doubles as "exit edit").
            if (editingIdeaId) handleCancelBuild()
            return
        }
        const { id: _id, status: _status, ...ideaFields } = buildingIdea
        const chatState = { messages: _capPersistedMessages(latestMessagesRef.current), analysisState }

        // Don't reset to 'waiting' when editing a live idea (hit/long/short) —
        // the user is just adding stops/TPs to an already-placed order.
        const editingIdea    = ideas.find(i => i.id === editingIdeaId)
        const isPostOrderEdit = !!editingIdea && ['hit', 'long', 'short'].includes(editingIdea.status)

        if (editingIdeaId) {
            try {
                const res = await tradeIdeasService.updateIdea(editingIdeaId, {
                    ...ideaFields,
                    ...(!isPostOrderEdit && { status: 'waiting' }),
                    chat_state: chatState,
                    accounts:      selectedAccounts,
                    mainAccountId: mainAccountId,
                    // Invalidation review: clear the alert + re-arm so the monitor re-evaluates from scratch
                    ...(isInvalidationReview && { invalidation_status: null, invalidation_reason: null, invalidation_edge: null, invalidation_armed: false }),
                })
                setIdeas(prev => prev.map(i => i.id === editingIdeaId ? res.idea : i))
                setEditingIdeaId(null)
                setIsInvalidationReview(false)
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

    // Invalidation review "Dismiss": idea is fine as-is, just clear the alert so
    // the monitor can re-evaluate. Does NOT change status or conditions.
    async function handleDismissInvalidation() {
        if (!editingIdeaId) return
        try {
            const res = await tradeIdeasService.updateIdea(editingIdeaId, {
                invalidation_status: null,
                invalidation_reason: null,
                invalidation_edge:   null,
                invalidation_armed:  false,
            })
            setIdeas(prev => prev.map(i => i.id === editingIdeaId ? res.idea : i))
        } catch (err) {
            console.error('[invalidation] dismiss failed', err)
        }
        handleCancelBuild()
    }

    // A 'hit' idea has fired and is awaiting order confirmation — deleting discards
    // that pending entry, so confirm intent in a dialog first. Everything else deletes
    // straight away (the bin is already disabled for live long/short positions).
    function handleDeleteIdea(id) {
        const idea = ideas.find(i => i.id === id)
        if (idea && isDeleteConfirmRequired(idea)) { setPendingDeleteIdea(idea); return }
        doDeleteIdea(id)
    }

    async function doDeleteIdea(id) {
        try {
            await tradeIdeasService.deleteIdea(id)
            setIdeas(prev => prev.filter(idea => idea.id !== id))
            if (id === editingIdeaId) handleCancelBuild()
        } catch (err) {
            console.error('[tradeIdeas] delete failed', err)
            showErrorMsg('Delete failed — the idea may now be live on the broker.')
        }
    }

    async function handleConfirmDeleteIdea() {
        if (!pendingDeleteIdea) return
        setDeletingIdea(true)
        await doDeleteIdea(pendingDeleteIdea.id)
        setDeletingIdea(false)
        setPendingDeleteIdea(null)
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

    async function handleGeneratePlan(plan, messages = [], mandate = null, thesis = null) {
        try {
            const ideaAccounts = availableAccounts.filter(a => selectedAccounts.includes(a.id))
            const accountIds   = ideaAccounts.map(a => a.id)
            const newIdeas     = await tradeIdeasService.createBatch(plan, accountIds, mainAccountId)
            setIdeas(prev => [...newIdeas, ...prev])
            if (newIdeas.length > 0) {
                const portfolioId = newIdeas[0].portfolioId
                const chatMessages = messages.filter(m => !m.streaming && m.role !== 'phase').map(m => ({ role: m.role, content: m.content }))
                portfolioService.saveChatState(portfolioId, chatMessages, mandate, thesis).catch(err =>
                    console.error('[portfolio] chat state save failed', err)
                )
            }
        } catch (err) {
            console.error('[portfolio] batch create failed', err)
        }
    }

    async function handleEditPortfolio(portfolioId, { reviewMode = false } = {}) {
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
                thesis:        chatState?.thesis ?? null,
                reviewMode,
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
            const existing   = ideas.filter(i => i.portfolioId === portfolioId)
            const liveLegs   = existing.filter(isDeleteLocked)

            if (plan?.ideas?.length && liveLegs.length) {
                // A re-plan replaces the portfolio's ideas in place, which means deleting
                // the current ones. A live leg (in position / hit) can't be deleted, so
                // block the whole replace and keep the portfolio as-is. The chat history
                // still saves below so the conversation isn't lost.
                showErrorMsg(`Can't update this plan while ${liveLegs.length} position${liveLegs.length > 1 ? 's are' : ' is'} live on the broker — close ${liveLegs.length > 1 ? 'them' : 'it'} first.`)
            } else if (plan?.ideas?.length) {
                await Promise.all(existing.map(i => tradeIdeasService.deleteIdea(i.id)))

                const newIdeas   = await tradeIdeasService.createBatch(plan, accountIds, mainAccountId, portfolioId)
                setIdeas(prev => [...newIdeas, ...prev.filter(i => i.portfolioId !== portfolioId)])
            } else {
                // No re-plan, but the account selection may have changed while editing.
                // Push the current accounts onto every idea so a marked account actually
                // reaches the portfolio's ideas (mirrors the single-idea attach flow).
                await Promise.all(existing.map(i => tradeIdeasService.updateIdea(i.id, { accounts: accountIds, mainAccountId })))
                setIdeas(prev => prev.map(i => i.portfolioId === portfolioId ? { ...i, accounts: accountIds, mainAccountId } : i))
            }

            const chatMessages = messages.filter(m => !m.streaming && m.role !== 'phase').map(m => ({ role: m.role, content: m.content }))
            await portfolioService.saveChatState(portfolioId, chatMessages).catch(err =>
                console.error('[portfolio] chat state save failed', err)
            )
        } catch (err) {
            console.error('[portfolio] update plan failed', err)
            loadIdeas()
        }
    }

    // In REVIEW mode a portfolio_update is a proposed rebalance — it can close/trim live
    // positions, so it must be confirmed and executed server-side (never auto-applied).
    // In construction/edit mode it keeps the existing immediate client-side apply.
    async function handlePortfolioUpdate(update, reviewMode = false, thesis = null) {
        if (!update?.changes?.length) return
        // Attach a same-turn thesis proposal so confirming the rebalance persists it
        // (backend reads update.thesis, reason 'accepted-rebalance'). No thesis → unchanged.
        if (reviewMode) { setPendingRebalance(thesis ? { ...update, thesis } : update); return }
        const ideaById = new Map(ideas.map(i => [i.id, i]))
        try {
            const promises   = []
            const skippedLive = []
            for (const change of update.changes) {
                if (change.action === 'update_idea' && change.ideaId && change.patch) {
                    promises.push(tradeIdeasService.updateIdea(change.ideaId, change.patch))
                } else if (change.action === 'remove_idea' && change.ideaId) {
                    // A live leg (in position / hit) can't be deleted — keep it and flag
                    // it rather than fail the whole batch. The rest of the changes apply.
                    const target = ideaById.get(change.ideaId)
                    if (target && isDeleteLocked(target)) { skippedLive.push(target); continue }
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
            if (skippedLive.length) {
                showErrorMsg(`Kept ${skippedLive.length} live position${skippedLive.length > 1 ? 's' : ''} the plan tried to remove — close ${skippedLive.length > 1 ? 'them' : 'it'} first.`)
            }
        } catch (err) {
            console.error('[portfolio] update failed', err)
        }
    }

    // Confirm a review rebalance: execute it on the live book server-side (which also
    // bumps the review clock + records conviction), then refresh ideas.
    async function confirmRebalance() {
        const update = pendingRebalance
        if (!update?.portfolioId) { setPendingRebalance(null); return }
        setApplyingRebalance(true)
        try {
            await portfolioService.applyRebalance(update.portfolioId, update)
            loadIdeas()
        } catch (err) {
            console.error('[portfolio] rebalance failed', err)
            showErrorMsg('Could not apply the rebalance — try again.')
        } finally {
            setApplyingRebalance(false)
            setPendingRebalance(null)
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

    // Scanner ticker chip click (inside the scanner chat): just preview on the chart.
    function handleScannerSymbol(ticker) {
        if (ticker) setChartSymbol(ticker)
    }

    // Phase 3 handoff: clicking a scan candidate opens the idea chat with the
    // scanner's summary shown as an assistant message (readable, no auto-reply),
    // and the same context seeded into analysisState so the agent already has it
    // when the user asks their first question.
    function handleBuildFromCandidate(candidate, scan) {
        if (!candidate?.ticker || isLoading) return
        const period = scan?.period
        const dir    = candidate.direction === 'short' ? 'short' : 'long'

        const seededMessages = [{ role: 'assistant', content: buildCandidateSummary(candidate, period) }]
        const seededState = {
            recent_messages:     [],   // keep empty — agent context rides in the summary below
            recent_chat_summary: buildCandidateContext(candidate, period),
            structured_state: {
                active_asset: candidate.ticker,
                pending_trade: {
                    direction: dir, type: null, asset_class: null, quantity: null,
                    entry_timeframe: null, stop_timeframe: null, tp_timeframe: null,
                    entry_logic: 'AND', entry_conditions: [],
                    stop_logic: 'OR', stop_conditions: [],
                    tp_logic: 'OR', tp_conditions: [],
                    additional_entries: [], notes: null,
                },
            },
        }

        setEditingIdeaId(null)
        setMessages(seededMessages)
        latestMessagesRef.current = seededMessages
        setAnalysisState(seededState)
        setActiveTab('idea')
        setChartSymbol(candidate.ticker)
    }

    // Generate (save) a scan list from the scanner panel, then surface it.
    async function handleGenerateList(scan) {
        const saved = await createScan(scan)
        if (saved) setNewsTab('scans')
    }

    // Edit a saved list (pencil) → reopen its conversation in the scanner, in edit
    // mode, primed with the list's current contents so the chat can refine it.
    function handleEditScan(scan) {
        setActiveTab('scanner')
        setScannerChatRestore({
            key:      Date.now(),
            messages: scan.chat ?? [],
            scanId:   scan.id,
            scan:     { period: scan.period, thesis: scan.thesis, direction: scan.direction, candidates: scan.candidates },
        })
    }

    // "Update list" from the scanner → persist the refined list to the same scan.
    async function handleUpdateList(scanId, scan) {
        const saved = await updateScan(scanId, scan)
        if (saved) setNewsTab('scans')
    }

    // Shared by the desktop workspace chat and the mobile chat sheet so the two
    // instances never drift. The mobile sheet overrides onGenerate to also close.
    const chatPanelProps = {
        messages,
        analysisState,
        onSend:              handleSend,
        onGenerate:          handleGenerate,
        onClear:             handleCancelBuild,
        onStop:              handleStopIdea,
        isLoading,
        streamStatus,
        isEditing:           !!editingIdeaId,
        isInvalidationReview,
        onDismissInvalidation: handleDismissInvalidation,
        onBuyMarket:         handleBuyMarket,
        isPostOrderEdit:     !!ideas.find(i => i.id === editingIdeaId && ['hit', 'long', 'short'].includes(i.status)),
        availableAccounts,
        selectedAccounts,
        onAccountsChange:    setSelectedAccounts,
        mainAccountId,
        onMainAccountChange: setMainAccountId,
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
                                onClick={() => { setActiveTab('idea'); setNewsTab('news') }}
                            >Idea</button>
                            <button
                                className={`chat-tabs__tab chat-tabs__tab--portfolio${activeTab === 'portfolio' ? ' chat-tabs__tab--active' : ''}`}
                                onClick={() => { setActiveTab('portfolio'); setNewsTab('news') }}
                            >Portfolio</button>
                            <button
                                className={`chat-tabs__tab chat-tabs__tab--scanner${activeTab === 'scanner' ? ' chat-tabs__tab--active' : ''}`}
                                onClick={() => { setActiveTab('scanner'); setNewsTab('scans') }}
                            >Scanner</button>
                        </div>
                        <div className="chat-tabs__panel" style={{ display: activeTab === 'idea' ? 'flex' : 'none' }}>
                            <ChatPanel {...chatPanelProps} />
                        </div>
                        <div className="chat-tabs__panel" style={{ display: activeTab === 'scanner' ? 'flex' : 'none' }}>
                            <ScannerPanel
                                onTickerSelect={handleScannerSymbol}
                                onGenerateList={handleGenerateList}
                                onUpdateList={handleUpdateList}
                                chatRestore={scannerChatRestore}
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
                        <Radar
                            articles={news.activeNewsSymbol ? news.assetArticles : news.newsArticles}
                            isLoading={news.activeNewsSymbol ? news.assetNewsLoading : news.newsLoading}
                            sentimentLoading={!!news.activeNewsSymbol && news.assetSentimentLoading}
                            tab={newsTab}
                            onTabChange={setNewsTab}
                            activeSymbol={news.activeNewsSymbol}
                            scans={scans}
                            scansLoading={scansLoading}
                            onCandidateSelect={handleBuildFromCandidate}
                            onDeleteScan={deleteScan}
                            onEditScan={handleEditScan}
                            earnings={earnings}
                            earningsDate={earningsDate}
                            earningsLoading={earningsLoading}
                            fda={fda}
                            fdaDate={fdaDate}
                            fdaLoading={fdaLoading}
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

            {pendingDeleteIdea && (
                <DeleteIdeaDialog
                    idea={pendingDeleteIdea}
                    deleting={deletingIdea}
                    onConfirm={handleConfirmDeleteIdea}
                    onCancel={() => { if (!deletingIdea) setPendingDeleteIdea(null) }}
                />
            )}

            {pendingRebalance && (
                <RebalanceConfirmDialog
                    update={pendingRebalance}
                    ideas={ideas}
                    applying={applyingRebalance}
                    onConfirm={confirmRebalance}
                    onCancel={() => { if (!applyingRebalance) setPendingRebalance(null) }}
                />
            )}
        </>
    )
}

// Confirmation gate for an accepted review rebalance. Nothing executes until the user
// confirms; on confirm the parent POSTs the update to the live-book rebalance endpoint.
function RebalanceConfirmDialog({ update, ideas, applying, onConfirm, onCancel }) {
    const ideaById = new Map((ideas ?? []).map(i => [i.id, i]))
    const assetOf  = (id) => ideaById.get(id)?.asset ?? id ?? '—'
    const pct      = (n) => `${Math.round((Number(n) || 0) * 100)}%`

    function describe(change) {
        switch (change.action) {
            case 'exit_idea':   return `Exit ${assetOf(change.ideaId)}${change.reason ? ` — ${change.reason}` : ''}`
            case 'trim_idea':   return `Trim ${assetOf(change.ideaId)} by ${pct(change.reduceFraction)}${change.targetAllocationRatio != null ? ` → target ${pct(change.targetAllocationRatio)}` : ''}`
            case 'add_idea':    return `Add ${change.idea?.asset ?? '?'} (${change.idea?.direction ?? 'long'}${change.idea?.allocationRatio != null ? `, target ${pct(change.idea.allocationRatio)}` : ''})`
            case 'update_idea': return `Update ${assetOf(change.ideaId)}: ${Object.keys(change.patch ?? {}).join(', ') || 'fields'}`
            case 'remove_idea': return `Remove ${assetOf(change.ideaId)} (pending)`
            default:            return change.action
        }
    }

    const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }
    const card    = { background: 'var(--surface, #1b1f27)', color: 'var(--text, #e8eaed)', border: '1px solid var(--border, #333)', borderRadius: 12, padding: 20, width: 'min(460px, 92vw)', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }
    const btn     = { padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border, #444)', cursor: 'pointer', fontSize: 14 }

    return (
        <div style={overlay} onClick={() => !applying && onCancel?.()}>
            <div style={card} onClick={e => e.stopPropagation()}>
                <h3 style={{ margin: '0 0 4px' }}>Confirm rebalance</h3>
                <p style={{ margin: '0 0 12px', opacity: 0.7, fontSize: 13 }}>
                    These actions will run on your live broker account{update.thesis ? ' and update the portfolio thesis' : ''}. Nothing executes until you confirm.
                </p>
                <ul style={{ margin: '0 0 16px', paddingLeft: 18, lineHeight: 1.7 }}>
                    {(update.changes ?? []).map((c, i) => <li key={i}>{describe(c)}</li>)}
                </ul>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button style={{ ...btn, background: 'transparent' }} onClick={onCancel} disabled={applying}>Cancel</button>
                    <button style={{ ...btn, background: 'var(--accent, #4f8cff)', color: '#fff', borderColor: 'transparent' }} onClick={onConfirm} disabled={applying}>
                        {applying ? 'Applying…' : 'Confirm & execute'}
                    </button>
                </div>
            </div>
        </div>
    )
}
