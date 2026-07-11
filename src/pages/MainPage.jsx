import { useState, useRef, useEffect, useCallback } from 'react'

import { ChatPanel }         from '../cmps/ChatPanel/ChatPanel.jsx'
import { AxlHub }            from '../cmps/AxlHub/AxlHub.jsx'
import { AgentSummon, AxlBotGlyph } from '../cmps/AxlHub/AgentSummon.jsx'
import { RETURN_MS }        from '../cmps/AxlHub/agentMeta.jsx'
import { AccountSelector }   from '../cmps/ChatPanel/AccountSelector.jsx'
import { readStoredModel }   from '../cmps/modelOptions.js'
import { readStoredReasoning } from '../cmps/reasoningOptions.js'
import { readStoredRoutingMode } from '../cmps/routingModeOptions.js'
import { PortfolioPanel }    from '../cmps/PortfolioPanel/PortfolioPanel.jsx'
import { ScannerPanel }      from '../cmps/ScannerPanel/ScannerPanel.jsx'
import { KairosPanel }       from '../cmps/KairosPanel/KairosPanel.jsx'
import { Radar }             from '../cmps/Radar/Radar.jsx'
import { TradingViewChart }  from '../cmps/TradingViewChart/TradingViewChart.jsx'
import { TradeIdeasList }    from '../cmps/TradeIdeas/TradeIdeasList.jsx'
import { kairosService, CALLS_CHANGED } from '../services/kairos/kairos.service.remote.js'
import { OrderConfirmDialog } from '../cmps/TradeIdeas/OrderConfirmDialog.jsx'
import { PreEntryDialog }     from '../cmps/TradeIdeas/PreEntryDialog.jsx'
import { DeleteIdeaDialog }   from '../cmps/TradeIdeas/DeleteIdeaDialog.jsx'
import { buildOrderPreview, orderTypeLabel, isDeleteLocked, isDeleteConfirmRequired, deriveIdeaInterval, isPostOrderStatus, brokerSymbolLabel, ideaWorkspace } from '../cmps/TradeIdeas/tradeIdea.utils.js'
import { MonitorDashboard }  from '../cmps/MonitorDashboard/MonitorDashboard.jsx'
import { userPromptService } from '../services/userPrompt/userPrompt.service.remote.js'
import { tradeIdeasService } from '../services/tradeIdeas/tradeIdeas.service.remote.js'
import { portfolioService }  from '../services/portfolio/portfolio.service.remote.js'
import { threadsService, newThreadId } from '../services/threads/threads.service.remote.js'
import { ThreadHistory }    from '../cmps/ThreadHistory/ThreadHistory.jsx'
import { showErrorMsg, showSuccessMsg, eventBus, INVALIDATION_EDIT_IDEA, INVALIDATION_CLOSE_TRADE, PORTFOLIO_REVIEW, MANUAL_FILLED, MANUAL_PORTFOLIO_ACTIVATE, MANUAL_PORTFOLIO_EXIT, ENTRY_CONFIRM_OPEN } from '../services/event-bus.service'
import { manualService } from '../services/manual/manual.service.remote.js'
import { useChatStream }     from '../customHooks/useChatStream.js'
import { useNewsFeed }       from '../customHooks/useNewsFeed.js'
import { useCalendarEvents } from '../customHooks/useCalendarEvents.js'
import { useScans }          from '../customHooks/useScans.js'
import { useBrokerAccounts } from '../customHooks/useBrokerAccounts.js'
import { useWorkspaceMode }  from '../customHooks/useWorkspaceMode.js'
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

// Finnhub session codes → readable when-phrasing for the earnings print.
const _EARN_WHEN_PHRASE = { bmo: 'before the open', amc: 'after the close', dmh: 'during market hours' }
function _earnWhenPhrase(code) {
    return _EARN_WHEN_PHRASE[(code || '').toLowerCase()] || ''
}

// Readable summary of an earnings event, shown as an assistant bubble when the
// user opens a ticker from the Radar earnings tab. Markdown so it renders nicely.
function buildEarningSummary(e, date) {
    const lines = [`**Earnings play — ${e.symbol}${e.name ? ` · ${e.name}` : ''}**`]

    const when = _earnWhenPhrase(e.time)
    const dateStr = _fmtEarnDate(date || e.date)
    const timing = [dateStr && `Reports ${dateStr}`, when].filter(Boolean).join(' ')
    if (timing) lines.push(`*${timing}.*`)

    const est = []
    if (e.epsEstimated != null)     est.push(`EPS est. ${Number(e.epsEstimated).toFixed(2)}`)
    if (e.revenueEstimated != null) est.push(`Rev est. ${_moneyShort(e.revenueEstimated)}`)
    if (est.length) lines.push(`\n**Estimates:** ${est.join(' · ')}`)

    lines.push(`\n_This is an earnings-driven setup. Tell me your lean — play the run-up into the print, or the reaction after it — and I'll build the entry, stop, and take-profit around the event._`)
    return lines.join('\n')
}

// Same earnings context, phrased for the idea agent's system prompt so it can
// answer the user's first question already knowing the catalyst and timing.
function buildEarningContext(e, date) {
    const when = _earnWhenPhrase(e.time)
    const dateStr = _fmtEarnDate(date || e.date)
    return [
        `The user opened this trade idea from the Radar earnings calendar and is reading the earnings summary.`,
        `Ticker: ${e.symbol}${e.name ? ` (${e.name})` : ''}.`,
        `Catalyst: scheduled earnings${dateStr ? ` on ${dateStr}` : ''}${when ? `, reporting ${when}` : ''} — treat this earnings event as the idea's driving catalyst and time anchor.`,
        e.epsEstimated != null     ? `EPS estimate: ${Number(e.epsEstimated).toFixed(2)}.` : '',
        e.revenueEstimated != null ? `Revenue estimate: ${_moneyShort(e.revenueEstimated)}.` : '',
        `Direction is not yet chosen. Do not respond yet; when the user asks, help shape the trade (direction, entry, stop, take-profit) around the earnings event and set the time condition from the report date.`,
    ].filter(Boolean).join(' ')
}

// Readable summary of an upcoming IPO, shown as an assistant bubble when the user
// opens a ticker from the Radar IPO tab.
function buildIpoSummary(e) {
    const lines = [`**IPO — ${e.symbol}${e.name ? ` · ${e.name}` : ''}**`]

    const dateStr = _fmtEarnDate(e.date)
    const timing = [dateStr && `Expected ${dateStr}`, e.exchange && `on ${e.exchange}`].filter(Boolean).join(' ')
    if (timing) lines.push(`*${timing}.*`)

    const facts = []
    if (e.price)  facts.push(`Price $${e.price}`)
    if (e.value)  facts.push(`Deal ${_moneyShort(e.value)}`)
    if (e.status) facts.push(`Status ${e.status}`)
    if (facts.length) lines.push(`\n**Details:** ${facts.join(' · ')}`)

    lines.push(`\n_New listings can be volatile with little trading history. Tell me how you want to play it — the debut itself, or a setup once it's trading — and I'll build the entry, stop, and take-profit around the listing._`)
    return lines.join('\n')
}

// Same IPO context, phrased for the idea agent's system prompt.
function buildIpoContext(e) {
    const dateStr = _fmtEarnDate(e.date)
    return [
        `The user opened this trade idea from the Radar IPO calendar and is reading the IPO summary.`,
        `Ticker: ${e.symbol}${e.name ? ` (${e.name})` : ''}${e.exchange ? `, listing on ${e.exchange}` : ''}.`,
        `Catalyst: upcoming IPO${dateStr ? ` expected ${dateStr}` : ''}${e.status ? ` (status: ${e.status})` : ''} — treat the listing as the idea's driving catalyst and time anchor. A new listing usually has no price history yet, so lean on debut/aftermarket dynamics rather than historical levels.`,
        e.price ? `Indicated price: $${e.price}.` : '',
        e.value ? `Deal size: ${_moneyShort(e.value)}.` : '',
        `Direction is not yet chosen. Do not respond yet; when the user asks, help shape the trade (direction, entry, stop, take-profit) around the listing and set the time condition from the expected date.`,
    ].filter(Boolean).join(' ')
}

function _fmtEarnDate(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return ''
    const [y, m, d] = iso.split('-').map(Number)
    const wd = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
    const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]
    return `${wd}, ${mo} ${d}`
}

function _moneyShort(v) {
    const n = Number(v)
    if (!Number.isFinite(n)) return ''
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
    return `$${n.toFixed(0)}`
}

export function MainPage() {
    const chat = useChatStream()
    const { messages, setMessages, isLoading, streamStatus } = chat

    const [analysisState, setAnalysisState] = useState(null)
    const [chartSymbol, setChartSymbol]   = useState(DEFAULT_CHART_SYMBOL)
    const [chartInterval, setChartInterval] = useState(DEFAULT_CHART_INTERVAL)
    const [editingIdeaId,     setEditingIdeaId]     = useState(null)
    const [isInvalidationReview, setIsInvalidationReview] = useState(false)
    const [activeTab, setActiveTab]             = useState('axl')
    const [newsTab, setNewsTab]                 = useState('news')
    const [scannerChatRestore, setScannerChatRestore] = useState(null)
    const [portfolioChatRestore, setPortfolioChatRestore] = useState(null)
    const [buildingPortfolio, setBuildingPortfolio] = useState(null)
    // Streaming state reported up from the portfolio/scanner panels (they own their
    // own chat stream) so the agent-bar "live" dot can pulse for Atlas/Argus too.
    const [portfolioLoading, setPortfolioLoading] = useState(false)
    const [scannerLoading,   setScannerLoading]   = useState(false)
    const [kairosLoading,    setKairosLoading]    = useState(false)
    const [calls,            setCalls]            = useState([])
    const [callBusyId,       setCallBusyId]       = useState(null)

    // Kairos calls for the Axl Lists Calls tab. Holds all the user's calls (workspace-filtered in
    // the list); reloads on the shared 'kairos-calls-changed' event (generate / act / delete).
    const loadCalls = useCallback(async () => { setCalls(await kairosService.listCalls()) }, [])
    useEffect(() => {
        loadCalls()
        window.addEventListener(CALLS_CHANGED, loadCalls)
        // The monitor changes a call's status server-side (waiting↔watching → ready/expiring) without
        // firing CALLS_CHANGED, so poll to keep the list in step with the popup (which polls getCall).
        const t = setInterval(loadCalls, 20_000)
        return () => { window.removeEventListener(CALLS_CHANGED, loadCalls); clearInterval(t) }
    }, [loadCalls])

    async function handleActCall(id, action) {
        setCallBusyId(id)
        try { await kairosService.actOnCall(id, action) }   // service broadcasts → loadCalls
        catch (err) { console.error('[kairos] act', err) }
        finally { setCallBusyId(null) }
    }
    async function handleDeleteCall(id) {
        try { await kairosService.deleteCall(id) }
        catch (err) { console.error('[kairos] delete', err) }
    }
    const [dismissedConfirmIds, setDismissedConfirmIds] = useState(() => new Set())
    const [placingOrders, setPlacingOrders] = useState(false)
    const [pendingDeleteIdea, setPendingDeleteIdea] = useState(null)
    const [pendingRebalance,  setPendingRebalance]  = useState(null)
    const [applyingRebalance, setApplyingRebalance] = useState(false)
    const [deletingIdea, setDeletingIdea] = useState(false)
    const [mobileChatOpen, setMobileChatOpen] = useState(false)
    const [returningToAxl, setReturningToAxl] = useState(false)
    // Bumped each time we head home to axl so the Atlas/Argus panels remount fresh
    // — going back to axl and re-entering an agent always starts a new chat.
    const [chatResetKey, setChatResetKey] = useState(0)
    const returnTimerRef = useRef(null)
    const latestMessagesRef = useRef([])
    const ideaThreadIdRef   = useRef(newThreadId())   // idea construction draft thread
    const portfolioResumeRef = useRef(null)           // PortfolioPanel exposes its resume fn here
    const scannerResumeRef   = useRef(null)           // ScannerPanel exposes its resume fn here

    // Leaving an agent plays a short "heading back to axl" beat (mirrors the summon
    // on the way in) before the hub returns. The timer is cleared on unmount so it
    // can't fire into a gone component.
    useEffect(() => () => clearTimeout(returnTimerRef.current), [])
    function handleBackToAxl() {
        if (returningToAxl) return
        setReturningToAxl(true)
        returnTimerRef.current = setTimeout(() => {
            setActiveTab('axl')
            setNewsTab('news')
            setReturningToAxl(false)
            // Fresh slate: clear the Idea chat, drop any pending edit-restore, and
            // remount Atlas/Argus so re-entering any agent from the hub starts a new
            // conversation.
            handleCancelBuild()
            setScannerChatRestore(null)
            setPortfolioChatRestore(null)
            setChatResetKey(k => k + 1)
        }, RETURN_MS)
    }

    const news = useNewsFeed()
    const { earnings, earningsFrom, earningsTo, earningsLoading, fed, fedLoading, ipo, ipoLoading } = useCalendarEvents()
    const { scans, loading: scansLoading, createScan, updateScan, deleteScan } = useScans()
    const { user } = useAuth()
    const { availableAccounts, selectedAccounts, setSelectedAccounts, mainAccountId, setMainAccountId } = useBrokerAccounts()
    const { workspace, setWorkspace } = useWorkspaceMode(user?._id)
    const { positions, loading: positionsLoading, refresh: refreshPositions, closePosition } = usePositions()
    const { ideas, setIdeas, loadIdeas, loading: ideasLoading, handleStatusChange, preEntryPrompt, setPreEntryPrompt } = useTradeIdeas()
    const [preEntryBusy, setPreEntryBusy] = useState(false)

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
        if (ideaWorkspace(i) !== workspace) continue   // only confirm ideas of the active workspace (live/paper/manual)
        if (ideaWorkspace(i) === 'manual') continue    // manual fills are confirmed via the social-chat FillCard, not this dialog
        if (i.status !== 'hit' || i.ordersPlacedAt || dismissedConfirmIds.has(i.id)) continue
        if (!Array.isArray(i.accounts) || i.accounts.length === 0) continue
        if (i.orderState !== 'awaiting_confirm' && i.orderState != null) continue
        const orders = ordersForIdea(i)
        if (orders.length > 0) { confirmIdea = i; confirmOrders = orders; break }
    }

    async function handleSend(userPrompt, currentAnalysisState) {
        const ideaAccounts = availableAccounts.filter(a => selectedAccounts.includes(a.id))

        const { signal, handlers } = chat.begin(userPrompt, {
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
                const reasoning = chat.reasoningRef.current
                const finalMsg = { role: 'assistant', content: data.reply, analysisState: data.analysisState ?? null, ...(reasoning ? { reasoning } : {}) }
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
                    // Construction only: persist the building conversation as a draft thread
                    // HERE, using the authoritative final list. Reading latestMessagesRef right
                    // after setMessages lags one turn (the updater runs async), which made the
                    // draft miss the latest phase on resume. Backend enforces the phase floor + TTL.
                    if (!editingIdeaId && data.analysisState) {
                        threadsService.saveDraft({
                            threadId:    ideaThreadIdRef.current,
                            agent:       'idea',
                            messages:    _capPersistedMessages(latestMessagesRef.current),
                            phase:       data.phase ?? null,
                            subjectType: 'idea',
                            state:       { analysisState: data.analysisState },
                        })
                    }
                    return prev
                })
                // Visually finish typing the backlog, then swap in finalMsg —
                // no end-of-stream dump. Keep Stop live until the drain ends.
                chat.finishStreaming(finalMsg)
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
        })

        try {
            await userPromptService.sendPromptStream(
                userPrompt,
                currentAnalysisState,
                { signal, ...handlers },
                ideaAccounts,
                readStoredModel('ideaModel'),
                readStoredReasoning('ideaReasoning'),
                readStoredRoutingMode('ideaRoutingMode'),
                chat.phase
            )
        } catch (err) {
            console.error(err)
            chat.freezeError('Error communicating with the server. Please try again.')
        } finally {
            chat.endStream()
        }
    }

    // Resume a stopped idea reply in place. Sends the conversation as a `messages`
    // array ending with the partial assistant turn (no userPrompt) so the model
    // continues that same bubble (Anthropic prefill). recent_messages is rebuilt
    // client-side from the sent history + the completed bubble, so the model-facing
    // history doesn't fragment (the backend only sees the continuation as the reply).
    async function _continueIdea() {
        if (isLoading) return
        const last = messages[messages.length - 1]
        if (!last || last.role !== 'assistant' || !last.stopped) return
        const base = (last.content || '').replace(/\s+$/, '')
        if (!base) return

        const ideaAccounts = availableAccounts.filter(a => selectedAccounts.includes(a.id))

        // Model-facing history: the text conversation ending with the partial assistant
        // turn (phase headings + chart image bubbles excluded).
        const history = messages
            .filter(m => (m.role === 'user' || m.role === 'assistant') && !m.streaming && m.type !== 'chart' && typeof m.content === 'string' && m.content.trim())
            .map(m => ({ role: m.role, content: m.content.trim() }))
        if (history.length && history[history.length - 1].role === 'assistant') {
            history[history.length - 1] = { role: 'assistant', content: base }
        }

        const cont = chat.beginContinue({
            onInterval: (interval) => { if (interval) setChartInterval(interval) },
            onAsset: (symbol) => { if (symbol) { setChartSymbol(symbol); news.previewAsset(symbol) } },
            onChart: (data) => {
                if (!data?.imageBase64) return
                setMessages(prev => {
                    const msgs = [...prev]
                    const chartMsg = { role: 'assistant', type: 'chart', symbol: data.symbol, timeframe: data.timeframe, imageBase64: data.imageBase64 }
                    const lastIdx = msgs.length - 1
                    if (msgs[lastIdx]?.streaming) msgs.splice(lastIdx, 0, chartMsg)
                    else msgs.push(chartMsg)
                    return msgs
                })
            },
            onError: () => chat.restoreStopped(base),
            onDone: (data) => {
                const reasoning = chat.reasoningRef.current
                const content = base + data.reply
                // The continued bubble is ONE assistant turn (base + continuation); rebuild
                // recent_messages from the sent history with that turn completed.
                const correctedRecent = [...history.slice(0, -1), { role: 'assistant', content }].slice(-6)
                const finalState = data.analysisState ? { ...data.analysisState, recent_messages: correctedRecent } : null
                const finalMsg = { role: 'assistant', content, analysisState: finalState, ...(reasoning ? { reasoning } : {}) }
                setMessages(prev => {
                    const finalMsgs = prev.map((m, i) => (i === prev.length - 1 && m.streaming ? finalMsg : m))
                    latestMessagesRef.current = _capPersistedCharts(finalMsgs)
                    if (!editingIdeaId && finalState) {
                        threadsService.saveDraft({
                            threadId:    ideaThreadIdRef.current,
                            agent:       'idea',
                            messages:    _capPersistedMessages(latestMessagesRef.current),
                            phase:       data.phase ?? null,
                            subjectType: 'idea',
                            state:       { analysisState: finalState },
                        })
                    }
                    return prev
                })
                chat.finishStreaming(finalMsg)
                if (editingIdeaId && finalState) {
                    tradeIdeasService.updateIdea(editingIdeaId, {
                        chat_state: { messages: _capPersistedMessages(latestMessagesRef.current), analysisState: finalState }
                    }).catch(err => console.error('[chat_state] save failed', err))
                }
                setAnalysisState(finalState)
                const newAsset   = finalState?.structured_state?.active_asset
                const newCompany = finalState?.structured_state?.active_company_name
                if (newAsset) setChartSymbol(newAsset)
                const newInterval = deriveIdeaInterval(finalState?.structured_state?.pending_trade)
                if (newInterval) setChartInterval(newInterval)
                news.focusAsset(newAsset, newCompany)
                if (data.ideaSaved) loadIdeas()
            },
        })
        if (!cont) return   // nothing continuable

        try {
            await userPromptService.continuePromptStream(
                history,
                analysisState,
                { signal: cont.signal, ...cont.handlers },
                ideaAccounts,
                readStoredModel('ideaModel'),
                readStoredReasoning('ideaReasoning'),
                readStoredRoutingMode('ideaRoutingMode'),
                chat.phase
            )
        } catch (err) {
            console.error(err)
            chat.restoreStopped(base)
        } finally {
            chat.endStream()
        }
    }

    function handleCancelBuild() {
        setAnalysisState(null)
        setMessages([])
        ideaThreadIdRef.current = newThreadId()   // fresh construction thread; abandoned draft TTL-expires
        setEditingIdeaId(null)
        setIsInvalidationReview(false)
        news.clearAsset()
        setChartSymbol(DEFAULT_CHART_SYMBOL)
        setChartInterval(DEFAULT_CHART_INTERVAL)
        chat.setPhase(null)
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
        // Editing an idea from a list (ideas list / mobile monitor / invalidation alert)
        // opens the Idea chat — otherwise the restored state stays hidden behind the Axl
        // hub or another agent's panel.
        setActiveTab('idea')
    }

    // Keep refs so the invalidation-alert handlers always see the latest ideas /
    // positions without being recreated on every render.
    const ideasRef = useRef(ideas)
    ideasRef.current = ideas
    const positionsRef = useRef(positions)
    positionsRef.current = positions
    const workspaceRef = useRef(workspace)   // for []-dep event handlers that must read the live workspace
    workspaceRef.current = workspace
    useEffect(() => {
        return eventBus.on(INVALIDATION_EDIT_IDEA, ({ ideaId }) => {
            const idea = ideasRef.current.find(i => i.id === ideaId)
            if (idea) handleEditIdea(idea, { invalidationReview: true })
        })
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // "Close trade" from an in-position invalidation alert. The alert payload only
    // carries the ideaId, so resolve the open position by the idea's symbol (matching
    // the broker-symbol alias too, e.g. NQ ↔ US100) and close it at market.
    useEffect(() => {
        return eventBus.on(INVALIDATION_CLOSE_TRADE, async ({ ideaId }) => {
            const idea = ideasRef.current.find(i => i.id === ideaId)
            if (!idea) return
            const ideaSymbols = [idea.asset, brokerSymbolLabel(idea)].filter(Boolean).map(s => String(s).toUpperCase())
            const pos = positionsRef.current.find(p => p.symbol && ideaSymbols.includes(String(p.symbol).toUpperCase()))
            if (!pos) { showErrorMsg('No open position found for this idea'); return }
            try {
                await closePosition(pos.broker, pos.id, pos.accountId)
                showSuccessMsg('Position closed')
            } catch (err) {
                console.error('[invalidation] close trade failed', err)
                showErrorMsg('Could not close the position — try again')
            }
        })
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        return eventBus.on(PORTFOLIO_REVIEW, ({ portfolioId }) => {
            handleEditPortfolio(portfolioId, { reviewMode: true })
        })
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // A manual (broker-less) fill was confirmed from a social-chat FillCard: patch the
    // updated idea into the list and refresh positions so the new/closed manual position
    // shows in the workspace immediately.
    useEffect(() => {
        return eventBus.on(MANUAL_FILLED, ({ idea }) => {
            if (idea) setIdeas(prev => prev.map(i => (i.id === idea.id ? idea : i)))
            refreshPositions(true)
        })
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Entry-confirm card ("Confirm order") from social chat: switch to the idea's workspace and
    // clear any prior dismiss so the OrderConfirmDialog surfaces for it. If the idea has already
    // placed/closed, the dialog derivation simply won't resolve — harmless.
    useEffect(() => {
        return eventBus.on(ENTRY_CONFIRM_OPEN, ({ ideaId }) => {
            const idea = ideasRef.current.find(i => i.id === ideaId)
            if (!idea) return
            // Only switch workspace for a CROSS-workspace idea (that switch flips the backend paper
            // flag so the right accounts load — required to place the order). Never re-flip global
            // trading mode when the idea already belongs to the active workspace: confirming a
            // same-workspace card must not churn account-wide state (badge, positions, selectors).
            if (ideaWorkspace(idea) !== workspaceRef.current) setWorkspace(ideaWorkspace(idea))
            setDismissedConfirmIds(prev => {
                if (!prev.has(ideaId)) return prev
                const next = new Set(prev); next.delete(ideaId); return next
            })
        })
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Manual portfolio activate → mark every pending leg awaiting-fill + post the N-leg
    // entry FillCard; reload so the legs reflect the new state (the card arrives via WS).
    useEffect(() => {
        return eventBus.on(MANUAL_PORTFOLIO_ACTIVATE, async ({ portfolioId }) => {
            try {
                const res = await manualService.activatePortfolio(portfolioId)
                loadIdeas()
                showSuccessMsg(res?.legs ? 'Enter each leg at your broker — check social chat' : 'Nothing to activate')
            } catch { showErrorMsg('Could not activate the portfolio') }
        })
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Manual portfolio exit (user-initiated) → post the N-leg exit FillCard over the
    // still-open legs; the user confirms each exit price there.
    useEffect(() => {
        return eventBus.on(MANUAL_PORTFOLIO_EXIT, async ({ portfolioId }) => {
            try {
                const res = await manualService.requestPortfolioExit(portfolioId)
                showSuccessMsg(res?.legs ? 'Confirm your exit prices in social chat' : 'No open legs to exit')
            } catch { showErrorMsg('Could not request the portfolio exit') }
        })
    }, [])

    async function handleBuyMarket() {
        if (!buildingIdea) return
        const { id: _id, status: _status, ...ideaFields } = buildingIdea
        const chatState = { messages: _capPersistedMessages(latestMessagesRef.current), analysisState }
        try {
            // Editing a still-pending idea and going in at market now: persist the
            // edits + flip to immediate on the existing idea rather than creating a
            // duplicate. The backend attaches the order plan and surfaces the
            // OrderConfirm dialog (orderState 'awaiting_confirm'). Keep the chat open
            // on the same idea so the user can still add stops/TPs.
            if (editingIdeaId) {
                const res = await tradeIdeasService.updateIdea(editingIdeaId, {
                    ...ideaFields,
                    immediate:     true,
                    chat_state:    chatState,
                    accounts:      selectedAccounts,
                    mainAccountId,
                })
                if (res?.idea) setIdeas(prev => prev.map(i => i.id === editingIdeaId ? res.idea : i))
                return
            }
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
            // Nothing to save — if we're editing, leave edit mode and head home to axl
            // so the user is never stuck (the Update button doubles as "exit edit").
            if (editingIdeaId) handleBackToAxl()
            return
        }
        // Strip `immediate` here: "Update idea"/"Generate idea" builds a *monitored*
        // idea. Only handleBuyMarket sends immediate:true (the one path that places a
        // market order), so the backend never confuses an update for a live entry.
        const { id: _id, status: _status, immediate: _immediate, ...ideaFields } = buildingIdea
        const chatState = { messages: _capPersistedMessages(latestMessagesRef.current), analysisState }

        // Don't reset to 'waiting' when editing a live idea (hit/long/short) —
        // the user is just adding stops/TPs to an already-placed order.
        const editingIdea    = ideas.find(i => i.id === editingIdeaId)
        const isPostOrderEdit = !!editingIdea && isPostOrderStatus(editingIdea.status)

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
                handleBackToAxl()   // idea saved — return to the axl hub
            } catch (err) {
                console.error('[tradeIdeas] edit update failed', err)
            }
        } else {
            try {
                const saved = await tradeIdeasService.createIdea({ ...ideaFields, chat_state: chatState, accounts: selectedAccounts, mainAccountId })
                // createIdea returns an array — one idea, or N when a multi-broker
                // idea was forked into single-broker children.
                setIdeas(prev => [...saved, ...prev])
                // Link the construction draft thread to the created idea (first of the fork
                // group); clears its TTL so the conversation lives with the idea.
                if (saved[0]?.id) {
                    threadsService.linkThread(ideaThreadIdRef.current, {
                        subjectType: 'idea', subjectId: saved[0].id, artifactName: ideaFields?.asset ?? null,
                    })
                }
                ideaThreadIdRef.current = newThreadId()   // next build gets a fresh draft thread
                setAnalysisState(null)
                setMessages([])
                news.clearAsset()
                setChartSymbol(DEFAULT_CHART_SYMBOL)
                setChartInterval(DEFAULT_CHART_INTERVAL)
                latestMessagesRef.current = []
                handleBackToAxl()   // idea generated — return to the axl hub
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

    // ── Arm-time pre-flight prompt actions (Buy now / Edit / Reset) ────────────
    // Buy now: force-trigger the entry (→ hit + built plan). The confirmIdea
    // derivation then surfaces the normal OrderConfirmDialog for account selection.
    async function handlePreEntryBuyNow(idea) {
        setPreEntryBusy(true)
        try {
            const updated = await tradeIdeasService.triggerEntry(idea.id)
            if (updated) {
                setIdeas(prev => prev.map(i => i.id === idea.id ? updated : i))
                setDismissedConfirmIds(prev => { const n = new Set(prev); n.delete(idea.id); return n })
            }
            setPreEntryPrompt(null)
        } catch (err) {
            console.error('[preflight] buy-now failed', err)
            showErrorMsg('Could not trigger entry — try again')
        } finally {
            setPreEntryBusy(false)
        }
    }

    // Edit: reopen the idea in chat to change the level.
    function handlePreEntryEdit(idea) {
        setPreEntryPrompt(null)
        handleEditIdea(idea)
    }

    // Reset: keep watching, but re-arm the entry floor to now so only a fresh
    // cross from here fires (server-side resetPreEntry flag).
    async function handlePreEntryReset(idea) {
        setPreEntryBusy(true)
        try {
            const res = await tradeIdeasService.updateIdea(idea.id, { resetPreEntry: true })
            if (res?.idea) setIdeas(prev => prev.map(i => i.id === idea.id ? res.idea : i))
            setPreEntryPrompt(null)
        } catch (err) {
            console.error('[preflight] reset failed', err)
        } finally {
            setPreEntryBusy(false)
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

    async function handleGeneratePlan(plan, messages = [], mandate = null, thesis = null, threadId = null) {
        try {
            const ideaAccounts = availableAccounts.filter(a => selectedAccounts.includes(a.id))
            const accountIds   = ideaAccounts.map(a => a.id)
            const newIdeas     = await tradeIdeasService.createBatch(plan, accountIds, mainAccountId)
            setIdeas(prev => [...newIdeas, ...prev])
            if (newIdeas.length > 0) {
                const portfolioId = newIdeas[0].portfolioId
                const portfolioName = plan?.name ?? newIdeas[0]?.portfolioName ?? null
                const chatMessages = messages.filter(m => !m.streaming && m.role !== 'phase').map(m => ({ role: m.role, content: m.content }))
                // threadId links the construction draft thread to the new portfolio (clears its TTL).
                portfolioService.saveChatState(portfolioId, chatMessages, mandate, thesis, threadId, portfolioName).catch(err =>
                    console.error('[portfolio] chat state save failed', err)
                )
            }
            handleBackToAxl()   // plan generated — return to the axl hub
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

        // Editing the plan de-activates it: move every idea back to 'waiting' until the
        // user re-activates. A scheduled REVIEW must NOT do this — a live book stays live
        // and monitored while reviewed; only accepted changes touch positions. (Pre-
        // activation books are already 'waiting', so review is a no-op here either way.)
        const toReset = reviewMode ? [] : portfolioIdeas.filter(i => i.status !== 'waiting')
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
                // Review keeps real statuses (so accept can tell in-position from pending);
                // construction edit resets to 'waiting'.
                portfolioIdeas: portfolioIdeas.map(i => reviewMode ? i : ({ ...i, status: 'waiting' })),
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
            handleBackToAxl()   // plan updated — return to the axl hub
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

    // Accept an Atlas review proposal from the inline review bar. Executes server-side
    // (routed by mode/position: paper/live close, manual posts a Fill card, pending books
    // apply idea edits), then refreshes ideas. Returns false on failure so the panel keeps
    // the proposal for a retry. A pending (not-yet-activated) book gets an activate nudge.
    async function handleAcceptReview(portfolioId, update, { pending } = {}) {
        try {
            await portfolioService.applyRebalance(portfolioId, update)
        } catch (err) {
            console.error('[portfolio] accept review failed', err)
            showErrorMsg('Could not apply the changes — try again.')
            return false
        }
        await loadIdeas()
        showSuccessMsg(pending
            ? 'Changes applied — activate the book from your portfolio list when ready.'
            : 'Changes applied.')
        return true
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

    // Shared Radar → idea handoff: open the idea chat at the formation phase with a
    // readable summary shown as an assistant bubble (no auto-reply) and the same
    // context seeded into analysisState so the agent already has it when the user
    // asks their first question. `direction` is null when the source carries no
    // bias (earnings/IPO) and set when it does (a scan pick).
    function seedIdeaChat({ symbol, summary, context, direction = null }) {
        if (!symbol || isLoading) return

        const seededMessages = [{ role: 'assistant', content: summary }]
        const seededState = {
            recent_messages:     [],   // keep empty — agent context rides in the summary + context
            recent_chat_summary: context,
            structured_state: {
                active_asset: symbol,
                pending_trade: {
                    direction, type: null, asset_class: null, quantity: null,
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
        setChartSymbol(symbol)
    }

    // Scan candidate → idea: carries the scanner's intended direction.
    function handleBuildFromCandidate(candidate, scan) {
        if (!candidate?.ticker) return
        const period = scan?.period
        seedIdeaChat({
            symbol:    candidate.ticker,
            summary:   buildCandidateSummary(candidate, period),
            context:   buildCandidateContext(candidate, period),
            direction: candidate.direction === 'short' ? 'short' : 'long',
        })
    }

    // Earnings ticker → idea: earnings has no built-in bias, so direction stays open.
    // Each row carries its own report date (the list spans the trading week).
    function handleBuildFromEarning(earning) {
        if (!earning?.symbol) return
        seedIdeaChat({
            symbol:  earning.symbol,
            summary: buildEarningSummary(earning, earning.date),
            context: buildEarningContext(earning, earning.date),
        })
    }

    // IPO ticker → idea: the listing is the catalyst; direction stays open.
    function handleBuildFromIpo(ipoItem) {
        if (!ipoItem?.symbol) return
        seedIdeaChat({
            symbol:  ipoItem.symbol,
            summary: buildIpoSummary(ipoItem),
            context: buildIpoContext(ipoItem),
        })
    }

    // Generate (save) a scan list from the scanner panel, then surface it.
    async function handleGenerateList(scan, threadId = null) {
        const saved = await createScan(scan)
        if (saved) {
            setNewsTab('scans')
            // Link the construction draft thread to the created scan (clears its TTL).
            if (threadId && saved.id) {
                threadsService.linkThread(threadId, { subjectType: 'scan', subjectId: saved.id, artifactName: scan?.thesis ?? null })
            }
        }
        handleBackToAxl()   // list generated — return to the axl hub
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
        handleBackToAxl()   // list updated — return to the axl hub
    }

    // Resume an unfinished idea-building draft: restore the conversation + analysisState
    // and keep writing to the SAME thread. Generated ideas use the edit/update flow instead.
    async function handleResumeIdeaThread(threadId) {
        const t = await threadsService.getThread(threadId)
        if (!t) return
        setEditingIdeaId(null)
        setIsInvalidationReview(false)
        setMessages(t.messages ?? [])
        latestMessagesRef.current = t.messages ?? []
        setAnalysisState(t.state?.analysisState ?? null)
        ideaThreadIdRef.current = t.threadId
    }

    // Resume dispatcher for the shared agent-bar hamburger — routes to the active agent.
    // Idea resumes here (MainPage owns its state); portfolio/scanner expose their own
    // resume fn via a ref since they own their conversation state.
    function handleResumeActiveThread(threadId) {
        if (activeTab === 'portfolio') return portfolioResumeRef.current?.(threadId)
        if (activeTab === 'scanner')   return scannerResumeRef.current?.(threadId)
        return handleResumeIdeaThread(threadId)
    }

    // A stopped idea reply with real text can be resumed in place.
    const lastIdeaMsg = messages[messages.length - 1]
    const canContinueIdea = !isLoading && lastIdeaMsg?.role === 'assistant' && !!lastIdeaMsg?.stopped && !!(lastIdeaMsg.content && lastIdeaMsg.content.trim())

    // Shared by the desktop workspace chat and the mobile chat sheet so the two
    // instances never drift. The mobile sheet overrides onGenerate to also close.
    const chatPanelProps = {
        messages,
        analysisState,
        onSend:              handleSend,
        onGenerate:          handleGenerate,
        onClear:             handleCancelBuild,
        onStop:              chat.handleStop,
        canResume:           canContinueIdea,
        onResume:            _continueIdea,
        isLoading,
        streamStatus,
        isEditing:           !!editingIdeaId,
        isInvalidationReview,
        onDismissInvalidation: handleDismissInvalidation,
        onBuyMarket:         handleBuyMarket,
        isPostOrderEdit:     !!ideas.find(i => i.id === editingIdeaId && isPostOrderStatus(i.status)),
        // The chat is header-less everywhere now — account selection lives in the
        // agent strip (desktop) / the mobile sheet bar; availableAccounts +
        // selectedAccounts are still read for the build summary + generate gating.
        availableAccounts,
        selectedAccounts,
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
                        {activeTab === 'axl' ? (
                            <AxlHub
                                user={user}
                                onPick={(tab) => { setActiveTab(tab); setNewsTab(tab === 'scanner' ? 'scans' : 'news') }}
                            />
                        ) : (
                            <div className="chat-agentbar">
                                <button
                                    className="chat-agentbar__back"
                                    onClick={handleBackToAxl}
                                    aria-label="Back to axl"
                                >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="M20 12H6" /><path d="M12 5l-7 7 7 7" />
                                    </svg>
                                    axl
                                </button>
                                <span className="chat-agentbar__crumb" aria-hidden="true">/</span>
                                <span className="chat-agentbar__current">
                                    {activeTab === 'portfolio' ? 'Atlas' : activeTab === 'scanner' ? 'Argus' : activeTab === 'kairos' ? 'Kairos' : 'Idea'}
                                </span>
                                <ThreadHistory agent={activeTab} onResume={handleResumeActiveThread} />

                                <div className="chat-agentbar__right">
                                    {(activeTab === 'idea' || activeTab === 'portfolio' || activeTab === 'kairos') && (
                                        <AccountSelector
                                            accounts={availableAccounts}
                                            selectedIds={selectedAccounts}
                                            onChange={setSelectedAccounts}
                                            mainAccountId={mainAccountId}
                                            onMainChange={setMainAccountId}
                                        />
                                    )}
                                    <span className="chat-agentbar__live">
                                        <span className={`chat-agentbar__dot ${
                                            activeTab === 'idea'
                                                ? (isLoading ? 'loading' : analysisState?.structured_state?.active_asset ? 'building' : 'idle')
                                                : activeTab === 'portfolio'
                                                    ? (portfolioLoading ? 'loading' : buildingPortfolio ? 'building' : 'idle')
                                                    : activeTab === 'scanner'
                                                        ? (scannerLoading ? 'loading' : 'idle')
                                                        : (kairosLoading ? 'loading' : 'idle')
                                        }`} />
                                        live
                                    </span>
                                </div>
                            </div>
                        )}
                        <div className="chat-tabs__panel" style={{ display: activeTab === 'idea' ? 'flex' : 'none' }}>
                            <ChatPanel {...chatPanelProps} />
                        </div>
                        <div className="chat-tabs__panel" style={{ display: activeTab === 'scanner' ? 'flex' : 'none' }}>
                            <ScannerPanel
                                key={`scanner-${chatResetKey}`}
                                resumeRef={scannerResumeRef}
                                onTickerSelect={handleScannerSymbol}
                                onGenerateList={handleGenerateList}
                                onUpdateList={handleUpdateList}
                                onLoadingChange={setScannerLoading}
                                chatRestore={scannerChatRestore}
                            />
                        </div>
                        <div className="chat-tabs__panel" style={{ display: activeTab === 'portfolio' ? 'flex' : 'none' }}>
                            <PortfolioPanel
                                key={`portfolio-${chatResetKey}`}
                                resumeRef={portfolioResumeRef}
                                onTickerSelect={handleTickerSelect}
                                onGeneratePlan={handleGeneratePlan}
                                onUpdatePlan={handleUpdatePlan}
                                onPortfolioUpdate={handlePortfolioUpdate}
                                onBuildingPlanChange={setBuildingPortfolio}
                                onLoadingChange={setPortfolioLoading}
                                onReviewResolved={handleBackToAxl}
                                onAcceptReview={handleAcceptReview}
                                chatRestore={portfolioChatRestore}
                                availableAccounts={availableAccounts}
                                selectedAccounts={selectedAccounts}
                                onAccountsChange={setSelectedAccounts}
                                mainAccountId={mainAccountId}
                                onMainAccountChange={setMainAccountId}
                            />
                        </div>
                        <div className="chat-tabs__panel" style={{ display: activeTab === 'kairos' ? 'flex' : 'none' }}>
                            <KairosPanel
                                onLoadingChange={setKairosLoading}
                                onGenerated={handleBackToAxl}
                                availableAccounts={availableAccounts}
                                selectedAccounts={selectedAccounts}
                                mainAccountId={mainAccountId}
                                workspace={workspace}
                            />
                        </div>

                        {/* Departure beat — covers the agent chat while heading home to axl. */}
                        {returningToAxl && (
                            <div className="chat-return-overlay" role="status" aria-live="polite">
                                <AgentSummon
                                    hue="axl"
                                    label={<>Heading back to <span className="axl-summon__brand axl-hub__wordmark"><b>A</b>XL</span></>}
                                    sub="one moment…"
                                >
                                    <AxlBotGlyph />
                                </AgentSummon>
                            </div>
                        )}
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
                            earningsFrom={earningsFrom}
                            earningsTo={earningsTo}
                            earningsLoading={earningsLoading}
                            onEarningSelect={handleBuildFromEarning}
                            fed={fed}
                            fedLoading={fedLoading}
                            ipo={ipo}
                            ipoLoading={ipoLoading}
                            onIpoSelect={handleBuildFromIpo}
                        />
                    </div>
                    <div className="workspace__ideas">
                        <TradeIdeasList
                            ideas={ideas
                                .filter(i => ideaWorkspace(i) === workspace)   // scope to the active workspace (live/paper/manual)
                                .filter(i => i.status !== 'closed')
                                .filter(i => i.id !== editingIdeaId)}
                            chatTab={activeTab}
                            buildingIdea={buildingIdea}
                            buildingPortfolio={buildingPortfolio}
                            loading={ideasLoading}
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
                            calls={calls.filter(c => (c.broker === 'ctrader' ? 'live' : c.broker === 'manual' ? 'manual' : 'paper') === workspace)}
                            onActCall={handleActCall}
                            onDeleteCall={handleDeleteCall}
                            callBusyId={callBusyId}
                        />
                    </div>
                </div>

                {/* ── Mobile monitor dashboard ── */}
                <MonitorDashboard
                    ideas={ideas.filter(i => ideaWorkspace(i) === workspace).filter(i => i.status !== 'closed')}
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
                        <div className="mobile-chat-sheet__bar-right">
                            <AccountSelector
                                accounts={availableAccounts}
                                selectedIds={selectedAccounts}
                                onChange={setSelectedAccounts}
                                mainAccountId={mainAccountId}
                                onMainChange={setMainAccountId}
                            />
                            <button
                                className="mobile-chat-sheet__close"
                                onClick={() => setMobileChatOpen(false)}
                                aria-label="Close"
                            >✕</button>
                        </div>
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

            {preEntryPrompt && (
                <PreEntryDialog
                    prompt={preEntryPrompt}
                    busy={preEntryBusy}
                    onBuyNow={handlePreEntryBuyNow}
                    onEdit={handlePreEntryEdit}
                    onReset={handlePreEntryReset}
                    onClose={() => { if (!preEntryBusy) setPreEntryPrompt(null) }}
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
