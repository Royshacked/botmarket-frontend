import { useState, useRef, useEffect, useCallback, useMemo } from 'react'

import { ChatPanel }         from '../cmps/ChatPanel/ChatPanel.jsx'
import { AxlHub }            from '../cmps/AxlHub/AxlHub.jsx'
import { AgentSummon, AxlBotGlyph } from '../cmps/AxlHub/AgentSummon.jsx'
import { RETURN_MS, DESKS } from '../cmps/AxlHub/agentMeta.jsx'
import { resolveStepIndex, previousStep } from '../cmps/AxlHub/pipelineNav.js'
import { scanOrigin, savesToScansList } from '../services/pipeline/scanOrigin.js'
import { KIND, STATUS, makeArtifact, firstItem } from '../services/pipeline/artifact.js'
import { planHop, planEntry, producesOne, hasDownstream, findReceiver } from '../services/pipeline/hop.js'
import { contractFor } from '../services/pipeline/contracts.js'
import { handoffDoors } from '../services/pipeline/doors.js'
import { AccountSelector }   from '../cmps/ChatPanel/AccountSelector.jsx'
import { readStoredModel }   from '../cmps/modelOptions.js'
import { PortfolioPanel }    from '../cmps/PortfolioPanel/PortfolioPanel.jsx'
import { reviewApplyMessage, queuedAnything } from '../cmps/PortfolioPanel/reviewApply.js'
import { QueuedActionDialog } from '../cmps/Floor/QueuedActionDialog.jsx'
import { executeRoute } from '../cmps/Floor/queuedAction.contract.js'
import { pendingActionService } from '../services/pendingAction/pendingAction.service.remote.js'
import { ScannerPanel, RESEARCH_TOP_N }      from '../cmps/ScannerPanel/ScannerPanel.jsx'
import { MentorPanel }       from '../cmps/MentorPanel/MentorPanel.jsx'
import { AnalystPanel }      from '../cmps/AnalystPanel/AnalystPanel.jsx'
import { StrategyPanel }     from '../cmps/StrategyPanel/StrategyPanel.jsx'
import { TradeIdeasList }    from '../cmps/TradeIdeas/TradeIdeasList.jsx'
import { FloorLeft }         from '../cmps/Floor/FloorLeft.jsx'
import { FloorLists }        from '../cmps/Floor/FloorLists.jsx'
import { analystService, COVERAGE_CHANGED } from '../services/analyst/analyst.service.remote.js'
import { OrderConfirmDialog } from '../cmps/TradeIdeas/OrderConfirmDialog.jsx'
import { PreEntryDialog }     from '../cmps/TradeIdeas/PreEntryDialog.jsx'
import { DeleteIdeaDialog }   from '../cmps/TradeIdeas/DeleteIdeaDialog.jsx'
import { activatePortfolio, isManualIdea, buildOrderPreview, orderTypeLabel, isDeleteLocked, isDeleteConfirmRequired, deriveIdeaInterval, isPostOrderStatus, brokerSymbolLabel, ideaWorkspace, inWorkspace, planAccountRebind, positionOpenTarget, openIdeaPopup, matchPositionsForIdea, isPortfolioReview } from '../cmps/TradeIdeas/tradeIdea.utils.js'
import { TradeTicket } from '../cmps/TradeTicket/TradeTicket.jsx'
import { apiError } from '../services/http.service.js'
import { userPromptService } from '../services/userPrompt/userPrompt.service.remote.js'
import { tradeIdeasService } from '../services/tradeIdeas/tradeIdeas.service.remote.js'
import { portfolioService }  from '../services/portfolio/portfolio.service.remote.js'
import { resolveEntity, resolveForEdit } from '../services/entityResolve.js'
import { useDeskHandoff } from '../customHooks/useDeskHandoff.js'
import { threadsService, newThreadId } from '../services/threads/threads.service.remote.js'
import { ThreadHistory }    from '../cmps/ThreadHistory/ThreadHistory.jsx'
import { showErrorMsg, showSuccessMsg, showUserMsg, eventBus, INVALIDATION_EDIT_IDEA, INVALIDATION_CLOSE_TRADE, PORTFOLIO_REVIEW, MANUAL_FILLED, MANUAL_PORTFOLIO_ACTIVATE, MANUAL_PORTFOLIO_EXIT, ENTRY_CONFIRM_OPEN, ENTRY_CONFIRM_EDIT, ENTRY_CONFIRM_DISMISS, SETUP_CONFIRM_OPEN, SETUP_INVALIDATION_EDIT, OPEN_COVERAGE, OPEN_SECTOR_VIEW, TILT_REVIEW_OPEN, MARKET_BRIEF_OPEN, OPEN_QUEUED_LIST } from '../services/event-bus.service'
import { manualService } from '../services/manual/manual.service.remote.js'
import { adoptService } from '../services/adopt/adopt.service.remote.js'
import { AdoptBookGrid } from '../cmps/AdoptBook/AdoptBookGrid.jsx'
import { mentorService } from '../services/mentor/mentor.service.remote.js'
import { isSetupAwaitingConfirm } from '../cmps/TradeIdeas/setupStatus.js'
import { pickConfirmIdea, pickConfirmSetup } from '../cmps/TradeIdeas/confirmTarget.js'
import { redrawAsk } from '../cmps/MentorPanel/redrawAsk.js'
import { listenForPopupEvents } from '../services/popupBridge.js'
import { useChatStream, toChatHistory } from '../customHooks/useChatStream.js'
import { useCalendarEvents } from '../customHooks/useCalendarEvents.js'
import { useScans }          from '../customHooks/useScans.js'
import { useBrokerAccounts } from '../customHooks/useBrokerAccounts.js'
import { useWorkspaceMode }  from '../customHooks/useWorkspaceMode.js'
import { usePositions }      from '../customHooks/usePositions.js'
import { useTradeIdeas }     from '../customHooks/useTradeIdeas.js'
import { useEntityList } from '../customHooks/useEntityList.js'
import { useDesign }         from '../customHooks/useDesign.js'
import { useSetups }         from '../customHooks/useSetups.js'
import { deriveIdeaOverlay, deriveSetupOverlay } from '../cmps/TradeIdeas/chartOverlay.js'
import { useAuth }           from '../context/AuthContext.jsx'

// Maps activeTab → the step name used in DESKS.steps[] for pipeline highlighting.
const TAB_TO_STEP = {
    scanner:    'Argus',
    kairos:     'Kairos',
    portfolio:  'Atlas',
    analyst:    'Prometheus',
    idea:       'Idea',
    mentor:     'Mentor',
    ticket:     'Order ticket',
}

// Agentbar breadcrumb: plain agent name when no pipeline is active, full
// pipeline path with the current step highlighted when one is set.
function PipelineCrumb({ pipeline, activeTab, step = 0 }) {
    const desk        = pipeline ? DESKS.find(d => d.key === pipeline) : null
    const currentStep = TAB_TO_STEP[activeTab]
    // `step` is the tracked position, not a tab match: an agent can appear twice in one pipeline
    // (Atlas: mandate, then allocate) and the tab alone can't say which visit this is. Confirm it
    // still agrees with the tab — standing somewhere outside the pipeline lights nothing, which is
    // truer than lighting the wrong step.
    const activeIdx   = desk?.steps[step]?.tab === activeTab ? step : -1
    if (!desk) return (
        <>
            <span className="chat-agentbar__crumb" aria-hidden="true">/</span>
            <span className="chat-agentbar__current">{currentStep ?? activeTab}</span>
        </>
    )
    return (
        <div className="chat-agentbar__pipeline">
            <span className="chat-agentbar__pipeline-label">{desk.label}</span>
            {desk.steps.map((step, i) => (
                <span key={step.label} className="chat-agentbar__pipeline-group">
                    {i > 0 && <span className="chat-agentbar__pipeline-line" aria-hidden="true" />}
                    <span className={`chat-agentbar__pipeline-step${i === activeIdx ? ' is-active' : ''}`}>
                        <span className="chat-agentbar__pipeline-text">{step.label}</span>
                    </span>
                </span>
            ))}
        </div>
    )
}

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

// (Scan candidates now seed the KAIROS chat via handleBuildFromCandidate — the idea-summary/context
// builders they used were removed with that reroute. See K3, KAIROS_MODES.md.)

// Finnhub session codes → readable when-phrasing for the earnings print.
const _EARN_WHEN_PHRASE = { bmo: 'before the open', amc: 'after the close', dmh: 'during market hours' }
function _earnWhenPhrase(code) {
    return _EARN_WHEN_PHRASE[(code || '').toLowerCase()] || ''
}

// ── Calendar row → Mentor ────────────────────────────────────────────────────
// Clicking an earnings or IPO row opens MENTOR with the catalyst already spoken, and it is spoken
// as the USER's turn rather than as a briefing bubble from the agent. That is Mentor's model: the
// setup comes out of the conversation, and its opening move is to ask what your lean is — an agent
// summary posted before it has asked anything answers questions that were never put.
//
// Both events are the same shape — a DATE with a ticker attached, and no direction — which is what
// the setup kind is built around (zones and a window, not a condition tree). The lean is left open
// on purpose; picking one for the user is the judgment that belongs to them and to Mentor.
function buildEarningSeed(e, date) {
    const when    = _earnWhenPhrase(e.time)
    const dateStr = _fmtEarnDate(date || e.date)
    const timing  = [dateStr && `on ${dateStr}`, when].filter(Boolean).join(' ')

    const est = []
    if (e.epsEstimated != null)     est.push(`EPS est. ${Number(e.epsEstimated).toFixed(2)}`)
    if (e.revenueEstimated != null) est.push(`Rev est. ${_moneyShort(e.revenueEstimated)}`)

    return [
        `I want to build a setup around ${e.symbol}${e.name ? ` (${e.name})` : ''} earnings`,
        timing ? ` — it reports ${timing}` : '',
        '.',
        est.length ? ` ${est.join(' · ')}.` : '',
        ` No direction picked yet — take me through playing the run-up into the print against the reaction after it.`,
    ].join('')
}

function buildIpoSeed(e) {
    const dateStr = _fmtEarnDate(e.date)

    const facts = []
    if (e.price)  facts.push(`priced around $${e.price}`)
    if (e.value)  facts.push(`deal ${_moneyShort(e.value)}`)
    if (e.status) facts.push(`status ${e.status}`)

    return [
        `I want to build a setup around the ${e.symbol}${e.name ? ` (${e.name})` : ''} IPO`,
        dateStr ? ` — expected ${dateStr}` : '',
        e.exchange ? ` on ${e.exchange}` : '',
        '.',
        facts.length ? ` (${facts.join(', ')}).` : '',
        ` It's a new listing with little or no history, so no direction yet — take me through playing the debut against waiting for it to trade.`,
    ].join('')
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

// THE DESK ROSTER. One list drives the resume refs and the busy state below; adding a desk is
// an entry here rather than a useRef, a useState, a branch in _resumeThreadOn and a prop.
//
// It exists because the absence of it cost a feature. `portfolioLoading` and `scannerLoading`
// were declared as `const [, setX]` — the VALUE discarded — so nothing could read them; the
// other three desks never reported at all. MainPage therefore had no idea any desk was busy,
// which let ThreadHistory offer a resume mid-turn that the running stream then silently
// overwrote, and left the agent-bar live dot unable to pulse for the very desks those two
// setters were added for.
const DESK_TABS = ['scanner', 'portfolio', 'mentor', 'analyst', 'strategy']

export function MainPage() {
    const chat = useChatStream()
    const { messages, setMessages, isLoading, streamStatus, reasoningPulse } = chat

    const [analysisState, setAnalysisState] = useState(null)
    const [, setChartSymbol]   = useState(DEFAULT_CHART_SYMBOL)
    const [, setChartInterval] = useState(DEFAULT_CHART_INTERVAL)
    const [editingIdeaId,     setEditingIdeaId]     = useState(null)
    const [isInvalidationReview, setIsInvalidationReview] = useState(false)
    const [activeTab, setActiveTab]             = useState('axl')
    // Bumped by the daily market-brief card — the hub writes the brief on every change, then clears
    // it. See the MARKET_BRIEF_OPEN listener for why it counts rather than latches.
    const [briefRequest, setBriefRequest]       = useState(0)
    // Bumped by Pythia's "review due" card — the strategy desk runs the review on every change, then
    // clears it. `{ n, reason }` rather than a bare counter because the trigger's own sentence rides
    // into the turn: a review that knows a stance matured reads that stance first.
    const [reviewRequest, setReviewRequest]     = useState({ n: 0, reason: null })
    const [activePipeline, setActivePipeline]   = useState(null)   // pipeline key from Axl reception
    const [pipelineStep,   setPipelineStep]     = useState(0)      // index into that desk's steps[] — what "back" walks from
    const [newsTab, setNewsTab]                 = useState('scans')

    // WHAT IS WAITING AT EACH DESK — a seed (an opening turn), an inbox (a delivered artifact) or a
    // chatRestore (a conversation being reopened), per desk. Was eleven useState declarations spread
    // through this component with 25 setter call sites between them; the slot names and the setter
    // names now come from one table, which is what doors.js reads its routing off.
    //
    // The names below are unchanged on purpose: every call site, prop and door still says
    // `mentorSeed` / `setScannerInbox`, so this move is inert by construction.
    // `clearAll` is deliberately not taken yet: clearing still goes through doors.clear(), which
    // calls these same setters. Swapping that over is a wiring change, and this step is meant to be
    // inert.
    const { desks: deskHandoff, setters: deskSetters, deskProps } = useDeskHandoff()
    // The slots reach their panels through `deskProps(desk)` at the JSX. Only one is read HERE:
    // Argus's inbox decides whether this is a single-pick hand-off run, which shapes the desk's
    // header and its hand-off button long before the panel sees it.
    const scannerInbox = deskHandoff.scanner.inbox
    const {
        setScannerSeed, setScannerInbox, setScannerChatRestore,
        setAnalystSeed, setAnalystInbox,
        setMentorSeed,  setMentorInbox,  setMentorChatRestore,
        setPortfolioSeed, setPortfolioChatRestore,
    } = deskSetters
    const [buildingPortfolio, setBuildingPortfolio] = useState(null)
    // Streaming state reported up from the portfolio/scanner panels (they own their
    // own chat stream) so the agent-bar "live" dot can pulse for Atlas/Argus too.
    // ── Pipeline inboxes ──────────────────────────────────────────────────────
    // What each desk has been HANDED, as a pipeline artifact (services/pipeline/artifact.js). One
    // shape per desk instead of a bespoke payload per hop: the conveyor puts an artifact in an
    // inbox and switches the tab, and the desk decides what to do with it.
    //
    // Argus's inbox also marks it as working on someone else's brief — a `scan_request` means
    // single-pick mode, and either way a list it produces here is not filed in the user's Scans tab
    // (see scanOrigin). `scannerSeed` is the delivery mechanism for a desk that opens on a
    // sentence: the conveyor writes the brief the receiving contract composed.
    // How the conveyor advances: 'manual' waits for the user to send the artifact on (they can read
    // and keep chatting first), 'auto' hands it straight to the next desk. A gate never
    // auto-advances in either mode — see planHop.
    const [pipelineMode,     setPipelineMode]     = useState('manual')
    // The staged book of an adoption in progress. Its presence puts Atlas in adopt mode and mounts the
    // confirm grid beside the chat — the conversation gathers the mandate and the reasons, the grid
    // holds the numbers. Null the rest of the time, which is what makes the mode invisible elsewhere.
    const [adoptDraft, setAdoptDraft] = useState(null)
    // A SLEEVE RUN: Atlas routed several sectors at once, Argus screens them back to back, and the
    // survivors pool until the last one lands. `queue` is what is still to screen; `survivors` is
    // what has cleared so far. Empty queue + empty survivors = no run in progress.
    // The sleeve run lives in a REF, not in state. It is accumulated from an async save handler, and
    // the render-time mirror this used to have (`ref.current = state`, re-run on EVERY render) could
    // overwrite what that handler had just added — which is how a run that screened three sectors
    // reached the Analyst carrying only the last one. State holds the one thing the UI needs.
    // `sectors` keeps each sleeve's names under its own label instead of one flat pile, so the
    // Analyst can say which sleeve a name is being researched FOR.
    const sleeveRunRef = useRef({ active: false, queue: [], sectors: [], total: 0, current: null })
    // What the UI shows about the run: which sleeve of how many, and its label. A run used to be
    // invisible — three sectors were queued and the only evidence was Argus starting to talk again.
    const [sleeveRun, setSleeveRun] = useState({ active: false, index: 0, total: 0, label: null })
    // What the run produced, kept from the Argus hand-off until Prometheus hands back: which sleeve
    // each queued name belongs to, which sleeves screened EMPTY, and the full queue (so the names
    // whose coverage the user declined are derivable). Read once by handleSleeveResearched, which
    // is the only place Atlas hears what did not come back.
    const sleeveOutcomeRef = useRef({ unfilled: [], bySector: [], queue: [] })
    const [analystEditCoverage, setAnalystEditCoverage] = useState(null)   // coverage pencil → re-open Prometheus on that name
    // Editing a saved setup in the Mentor chat — the setup twin of editingCallId + its restore.
    const [editingSetupId,   setEditingSetupId]   = useState(null)

    // Every door an artifact can be delivered through, and the one way to shut them all. Declared
    // here, beside the state it owns, because both users of it are far apart: the conveyor fills a
    // door (_applyHop), and leaving for the hub drops whatever is still in one (handleBackToAxl).
    // A delivered artifact that outlives its run REPLAYS on the next remount of the desk holding it
    // — see services/pipeline/doors.js for the run it did that on.
    const doors = handoffDoors({
        setScannerInbox, setAnalystInbox, setMentorInbox,
        setScannerSeed, setPortfolioSeed, setMentorSeed, setAnalystSeed,
    })

    // The Analyst's living coverage book (Radar Coverage tab). Reloads on initiate/retire
    // (COVERAGE_CHANGED); polled so the monitor's status/gap updates surface.
    const loadCoverageFn = useCallback(() => analystService.listCoverage(), [])
    const { items: coverage, loading: coverageLoading } = useEntityList({
        load: loadCoverageFn, changeEvent: COVERAGE_CHANGED, pollMs: 60_000, log: '[coverage]',
    })
    // Retire ARCHIVES (status → retired, revision trail kept); delete REMOVES the document for good.
    // Two operations, two endpoints — the confirm for delete lives in CoverageActions, next to the
    // button, where it can name what is being lost.
    async function handleRetireCoverage(cov) {
        if (!cov?.id) return
        try { await analystService.retireCoverage(cov.id) } catch (err) { console.error('[analyst] retire', err) }
    }
    async function handleDeleteCoverage(cov) {
        if (!cov?.id) return
        try { await analystService.deleteCoverage(cov.id) } catch (err) { console.error('[analyst] delete', err) }
    }

    // The coverage pencil routes back into Prometheus, the same move the call and setup pencils make
    // toward the agent that BUILT them. The panel opens in update mode, so the turn revises the
    // thesis instead of starting a fresh one.
    //
    // THE DOCUMENT TRAVELS, not just its name. Every caller here already holds a resolved doc — the
    // pencil passes its row, the Axl hand-off and the social-chat card both come through
    // resolveEntity — and narrowing that to a symbol made the panel re-resolve it against a POLLED
    // client list. That is the list lookup entityResolve exists to abolish, and it failed exactly as
    // that doctrine predicts: a coverage card clicked before the 60s poll had the name switched the
    // tab, missed the list, bailed silently, and left the user on a clean desk being asked to revise
    // a thesis that was nowhere in sight. The symbol stays as a fallback key for the panel; the doc
    // is what it should actually use.
    function handleEditCoverage(cov) {
        if (!cov?.symbol) return
        setActiveTab('analyst')
        setAnalystEditCoverage({ doc: cov, symbol: cov.symbol, key: `${cov.id}-${Date.now()}` })
    }

    // The Calls-tab pencil (handleEditCall) and its exit (handleCallEditDone) lived here. Kairos
    // was archived on 2026-08-18, so there is no chat to reopen a call into. handleEditSetup below
    // is the surviving shape of the same gesture.
    const [dismissedConfirmIds, setDismissedConfirmIds] = useState(() => new Set())
    const [setupConfirmId, setSetupConfirmId] = useState(null) // Mentor setup showing the OrderConfirmDialog
    const [placingOrders, setPlacingOrders] = useState(false)
    const [pendingDeleteIdea, setPendingDeleteIdea] = useState(null)
    const [pendingRebalance,  setPendingRebalance]  = useState(null)
    const [applyingRebalance, setApplyingRebalance] = useState(false)
    const [deletingIdea, setDeletingIdea] = useState(false)
    const [returningToAxl, setReturningToAxl] = useState(false)
    // Bumped each time we head home to axl so the Atlas/Argus panels remount fresh
    // — going back to axl and re-entering an agent always starts a new chat.
    const [chatResetKey, setChatResetKey] = useState(0)
    // Bumped to remount ARGUS ALONE. Every hand-off that seeds it (Kairos discovery, Atlas sourcing)
    // wants a clean panel — but the desk that SENT them there has to keep its conversation, or
    // stepping back lands on a blank chat. Folded into chatResetKey, routing a sleeve to Argus wiped
    // the Atlas mandate that authored the request.
    const [scannerResetKey, setScannerResetKey] = useState(0)
    const returnTimerRef = useRef(null)
    const latestMessagesRef = useRef([])
    const ideaThreadIdRef   = useRef(newThreadId())   // idea construction draft thread
    // Each desk panel publishes its "resume this thread" fn here. ONE map rather than one ref
    // per desk: the refs were identical in every respect except which desk they belonged to, and
    // every one of them also needed its own branch in _resumeThreadOn below. Adding a desk is now
    // a key, not a declaration plus a branch — and a desk whose key is missing degrades to the
    // idea-thread fallback instead of silently doing nothing.
    const resumeRefs = useRef(Object.fromEntries(DESK_TABS.map(t => [t, { current: null }])))

    // Which desks are mid-turn. STATE, not a ref: it drives what the UI lets you do. Memoised
    // setters so a panel's onLoadingChange prop keeps a stable identity across renders, and the
    // no-op guard stops a panel re-reporting the same value from re-rendering the page.
    const [deskBusy, setDeskBusy] = useState({})
    const deskLoadingSetters = useMemo(() => Object.fromEntries(DESK_TABS.map(tab => [tab,
        (is) => setDeskBusy(prev => (Boolean(prev[tab]) === Boolean(is) ? prev : { ...prev, [tab]: Boolean(is) })),
    ])), [])
    const { setups, setupsLoading, refreshSetups } = useSetups()
    const [setupBusyId, setSetupBusyId] = useState(null)

    // Arm / disarm / delete a setup from the Lists surface. Arming is the real gate — the server
    // re-runs the readiness check and refuses with `cannot_arm_<reason>`, so surface that rather
    // than swallowing it.
    async function _setupAction(setup, fn, verb) {
        setSetupBusyId(setup.id)
        try { await fn(setup.id) }
        catch (err) { showErrorMsg(`Couldn't ${verb} ${setup.asset}: ${err?.message ?? 'unknown error'}`) }
        finally { setSetupBusyId(null) }
    }
    const handleArmSetup     = (su) => _setupAction(su, mentorService.armSetup,    'arm')
    const handleDisarmSetup  = (su) => _setupAction(su, mentorService.disarmSetup, 'stop watching')
    const handleDeleteSetup  = (su) => _setupAction(su, mentorService.deleteSetup, 'delete')

    // Setup pencil → back into the Mentor chat that BUILT it, the same move handleEditCall makes
    // for a call. Mentor persists `chat_state` (messages + draft + coverage) on Generate and on
    // every edit turn, so the conversation reopens where it left off.
    //
    // The fallback draft matters more here than it does for a call: a setup saved before chat_state
    // was carried has no messages to restore, and without a worksheet the panel would open on an
    // empty chat that quietly loses the zones. Rebuilt from the doc, the user edits a real setup —
    // they just don't get the reasoning that produced it.
    // `ask`, when given, is the turn the desk opens ON — see MentorPanel's restore effect. The
    // pencil passes none (nothing has happened; the user is the one with something to say); the
    // re-draw card passes Talos's reason, which is the whole difference between the two doorways.
    function handleEditSetup(setup, { ask = null } = {}) {
        const draft = setup.chat_state?.draft ?? {
            asset:       setup.asset,
            asset_class: setup.asset_class ?? null,
            direction:   setup.direction   ?? null,
            type:        setup.type        ?? null,
            trade_mode:  setup.trade_mode  ?? null,
            timeframe:   setup.timeframe   ?? null,
            ladder:      setup.ladder      ?? [],
            thesis:      setup.thesis      ?? null,
            watch:       setup.watch       ?? [],
            entry_zones: setup.entry_zones ?? [],
            stop_zones:  setup.stop_zones  ?? [],
            tp_zones:    setup.tp_zones    ?? [],
            quantity:    setup.quantity    ?? null,
            rr:          setup.rr          ?? null,
            conviction:  setup.conviction  ?? null,
            active_from: setup.active_from ?? null,
            valid_until: setup.valid_until ?? null,
        }
        setMentorChatRestore({
            key:      `${setup.id}-${Date.now()}`,
            setup:    draft,
            messages: setup.chat_state?.messages ?? [],
            coverage: setup.chat_state?.coverage ?? [],
            ask,
        })
        setEditingSetupId(setup.id)
        // The venue is re-bound on Update from the MARKED accounts, so restore the ones this setup
        // was generated against — otherwise an edit could silently re-bind it to another broker.
        // Standing in the setup's own workspace first is what makes those accounts LISTABLE; without
        // it the selector holds ids it cannot show and the re-bind resolves to nothing.
        alignWorkspaceTo(setup)
        setSelectedAccounts(Array.isArray(setup.accounts) ? setup.accounts : [])
        setMainAccountId(setup.mainAccountId ?? null)
        setChartSymbol(setup.asset || 'SPY')
        setActiveTab('mentor')
    }
    function handleSetupEditDone() {
        setEditingSetupId(null)
        setMentorChatRestore(null)
        handleBackToAxl()   // setup updated / edit cancelled — return to the axl hub
    }
    // Ids of ideas BORN from a "Buy Market" click (created solely to carry the immediate
    // order). If their placement fails outright we roll them back out of existence rather
    // than strand a phantom 'hit' idea on "Update idea". Cleared once placed or rolled back.
    const buyMarketBornRef   = useRef(new Set())

    // Leaving an agent plays a short "heading back to axl" beat (mirrors the summon
    // on the way in) before the hub returns. The timer is cleared on unmount so it
    // can't fire into a gone component.
    useEffect(() => () => clearTimeout(returnTimerRef.current), [])
    function handleBackToAxl() {
        if (returningToAxl) return
        setReturningToAxl(true)
        returnTimerRef.current = setTimeout(() => {
            setActiveTab('axl')
            setActivePipeline(null)
            setPipelineStep(0)
            setNewsTab('scans')
            setReturningToAxl(false)
            // Fresh slate: clear the Idea chat, drop any pending edit-restore, and
            // remount Atlas/Argus so re-entering any agent from the hub starts a new
            // conversation.
            handleCancelBuild()
            setScannerChatRestore(null)
            setPortfolioChatRestore(null)
            // The SETUP twin, which was missing — and its absence was not cosmetic. `handleSetupEditDone`
            // clears these, but the agentbar's back arrow comes straight here, so leaving a setup edit
            // that way left `editingSetupId` set with nothing to unset it. Mentor then opened in a mode
            // the user could not see and could not leave: "Generate setup" is hidden while editing, so a
            // fresh build offered no button at all, and every turn wrote chat_state onto the stale setup.
            setEditingSetupId(null)
            setMentorChatRestore(null)
            // Drop every hand-off in flight — inboxes and seeds alike. A consumed one left lying
            // here re-fires on the next remount of the desk that holds it (doors.js).
            doors.clear()
            setChatResetKey(k => k + 1)
        }, RETURN_MS)
    }

    /**
     * The desk FINISHED — its artifact exists — as opposed to being walked away from.
     *
     * Both end at the hub, which is why this is not folded into handleBackToAxl: the arrow beside the
     * crumb means "I'll come back to this", and the drafts it leaves behind are the entire point of
     * resume. Finishing is the opposite claim, and the conversations that fed the run are spent.
     *
     * Only the SCAFFOLDING goes. The thread that authored the artifact was linked to it (Mentor's
     * setup, Atlas's book), and it is reached by editing that artifact — which is why the desk can be
     * cleared without losing the reasoning behind what it produced. Deleting drafts cannot touch it.
     *
     * Fire-and-forget: the walk home takes RETURN_MS, and the hub reads /unfinished when it mounts at
     * the end of it.
     */
    function finishPipeline() {
        if (activePipeline) threadsService.discardPipelineDrafts(activePipeline)
        handleBackToAxl()
    }

    const { earnings, earningsFrom, earningsTo, earningsLoading, fed, fedLoading, ipo, ipoLoading, tilt, tiltLoading } = useCalendarEvents()
    const { scans, loading: scansLoading, createScan, updateScan, deleteScan } = useScans()
    const { user } = useAuth()
    const { availableAccounts, selectedAccounts, setSelectedAccounts, mainAccountId, setMainAccountId } = useBrokerAccounts()
    const { workspace, setWorkspace } = useWorkspaceMode(user?._id)
    const { positions, loading: positionsLoading, refresh: refreshPositions, closePosition, closePositions } = usePositions()
    const { ideas, setIdeas, loadIdeas, loading: ideasLoading, handleStatusChange, preEntryPrompt, setPreEntryPrompt } = useTradeIdeas()
    // NOTE: the chart used to take over this page's lists panel (and the Floor's right column). It
    // now docks at the bottom of the chat that asked for it (cmps/ChatChartDock.jsx) — the same
    // shared store, rendered where the user was actually looking — so this page owns no chart state.
    // Floor design trial (Profile → Design → "Floor (3-col)"). Only this page reads it: the trial adds
    // two side columns and swaps the right one, so nothing below the workspace needs to know.
    const floorMode = useDesign() === 'floor'
    // The queued list: rows waiting on the user (off-hours decisions + entities the market-open
    // sweep unparked), which desk an outside ask wants opened, and the confirm in flight.
    const [queued,        setQueued]        = useState([])
    const [deskRequest,   setDeskRequest]   = useState(null)
    const [queuedConfirm, setQueuedConfirm] = useState(null)
    const [queuedBusyId,  setQueuedBusyId]  = useState(null)
    const [queuedError,   setQueuedError]   = useState(null)
    // Immediate-trade ticket. Whether the pad is SHOWING is just `activeTab === 'ticket'` — the hub
    // opens it the way it opens a desk, so there is one notion of "what is in the chat column".
    // Which entity it manages is state, but the entity ITSELF is read from `ideas`
    // (see handleTicketPlace) so a broker fill moves the ticket on without tracking the lifecycle twice.
    const [ticketIdeaId, setTicketIdeaId] = useState(null)
    const [ticketBusy, setTicketBusy]     = useState(false)
    const [ticketError, setTicketError]   = useState(null)
    const [preEntryBusy, setPreEntryBusy] = useState(false)

    // A position row in the Floor's book opens whatever OWNS it. Call-originated positions routed
    // to the Call pop-out until Kairos was archived (2026-08-18); an idea is the only owner left.
    // Same rule TradeIdeasList uses for its Positions tab — the routing is the entity's, not the
    // panel's, so both surfaces ask positionOpenTarget.
    function handleOpenPositionFromFloor(position) {
        const target = positionOpenTarget(position, ideas, [])
        if (target?.kind === 'idea') openIdeaPopup(target.idea)
    }

    const buildingIdea = deriveBuildingIdea(analysisState)
    // While editing, the live draft REPLACES the saved row in place (same id → the existing Axl-list
    // row turns to 'building') instead of adding a separate row. A brand-new build keeps its
    // synthetic __building__ id so it renders as a new top row.
    const buildingIdeaRow = buildingIdea && editingIdeaId ? { ...buildingIdea, id: editingIdeaId } : buildingIdea

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
    // WHICH entity the confirm dialog is showing. The selection rules — ownership, workspace,
    // manual-is-elsewhere, dismiss-sticks, first-RESOLVABLE-not-first-match — moved to
    // cmps/TradeIdeas/confirmTarget.js so they could be tested: this is the logic that decides
    // whose plan gets a Place Orders button, and it was unreachable from a test in here.
    const { idea: confirmIdea, orders: confirmOrders } = pickConfirmIdea({
        ideas, userId: user?._id ?? null, workspace, dismissedConfirmIds, ideaWorkspace, ordersForIdea,
    })
    // The plan's price levels, from the SAME extractor the chart uses. No positions passed: an idea
    // awaiting confirmation is by definition not in one yet, so the entry comes from its conditions
    // rather than a fill.
    const confirmLevels = confirmIdea ? deriveIdeaOverlay(confirmIdea, []).levels : []

    // A setup reads Talos's stamped `pendingOrder.plan` rather than rebuilding a preview. An idea
    // in flight wins — one dialog on screen, and it was there first.
    const { setup: confirmSetup, orders: confirmSetupOrders } = pickConfirmSetup({
        setups, setupConfirmId, blockedByIdea: Boolean(confirmIdea), isAwaitingConfirm: isSetupAwaitingConfirm,
    })
    // A setup's plan is authored as zones, so its levels come from its own extractor.
    const confirmSetupLevels = confirmSetup ? deriveSetupOverlay(confirmSetup).levels : []

    // ⚠ ARCHIVED 2026-07-29 — the Idea chat's send path. Its panel only shows while
    // activeTab === 'idea', which now only handleEditIdea can reach (legacy documents only).
    // userPromptService posts to the unmounted /api/idea; the catch below is what the user
    // would see. Kept with the panel rather than deleted — see handleEditIdea.
    async function handleSend(userPrompt, currentAnalysisState) {
        const ideaAccounts = availableAccounts.filter(a => selectedAccounts.includes(a.id))

        const { signal, handlers } = chat.begin(userPrompt, {
            onInterval: (interval) => { if (interval) setChartInterval(interval) },
            onAsset: (symbol) => { if (symbol) setChartSymbol(symbol) },

            // (a surfaced chart lands as its own row — useChatStream's shared onChart)

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
                const newAsset = data.analysisState?.structured_state?.active_asset
                if (newAsset) setChartSymbol(newAsset)
                // Follow the established timeframe even if the LLM omitted <interval>
                const newInterval = deriveIdeaInterval(data.analysisState?.structured_state?.pending_trade)
                if (newInterval) setChartInterval(newInterval)
                if (data.ideaSaved) loadIdeas()
            },
        })

        try {
            await userPromptService.sendPromptStream(
                userPrompt,
                currentAnalysisState,
                { signal, ...handlers },
                ideaAccounts,
                readStoredModel(),
                mainAccountId
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
        const base = chat.resumeBase()   // '' = stopped before any token → regenerate

        const ideaAccounts = availableAccounts.filter(a => selectedAccounts.includes(a.id))

        // Model-facing history: the text conversation (phase headings + chart image bubbles
        // excluded), ended with the partial as an assistant prefill when continuing, or at the
        // user turn when regenerating — the shared finalizeResumeHistory decides which.
        const history = chat.finalizeResumeHistory(
            messages
                .filter(m => (m.role === 'user' || m.role === 'assistant') && !m.streaming && m.type !== 'chart' && typeof m.content === 'string' && m.content.trim())
                .map(m => ({ role: m.role, content: m.content.trim() })),
            base,
        )

        const cont = chat.beginContinue({
            onInterval: (interval) => { if (interval) setChartInterval(interval) },
            onAsset: (symbol) => { if (symbol) setChartSymbol(symbol) },
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
                const newAsset = finalState?.structured_state?.active_asset
                if (newAsset) setChartSymbol(newAsset)
                const newInterval = deriveIdeaInterval(finalState?.structured_state?.pending_trade)
                if (newInterval) setChartInterval(newInterval)
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
                readStoredModel(),
                mainAccountId
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
        setChartSymbol(DEFAULT_CHART_SYMBOL)
        setChartInterval(DEFAULT_CHART_INTERVAL)
        chat.setPhase(null)
        latestMessagesRef.current = []
    }

    // ⚠ ARCHIVED 2026-07-29 — reachable only from a legacy `idea`-kind document, and nothing
    // builds those any more (Kairos builds calls, Mentor builds setups; the pencil on those
    // routes to their own chats). Left wired so an old idea still opens rather than breaking the
    // list, but the chat it opens can no longer send: /api/idea is unmounted.
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
        alignWorkspaceTo(idea)
        setSelectedAccounts(Array.isArray(idea.accounts) ? idea.accounts : [])
        setMainAccountId(idea.mainAccountId ?? null)
        // Editing an idea from a list (ideas list / mobile monitor / invalidation alert)
        // opens the Idea chat — otherwise the restored state stays hidden behind the Axl
        // hub or another agent's panel.
        setActiveTab('idea')
    }

    // The card listeners below register once, so they cannot close over state — these are what they
    // read instead. There used to be four more, mirroring the ideas / calls / setups / coverage
    // lists so a card could resolve its subject out of them; the cards now READ their subject by id
    // (resolveEntity), which is both fresher and the same authorization the server already applies.
    // What is left is state with no document behind it to fetch.
    const activeTabRef = useRef(activeTab)
    activeTabRef.current = activeTab
    const positionsRef = useRef(positions)
    positionsRef.current = positions
    const workspaceRef = useRef(workspace)   // for []-dep event handlers that must read the live workspace
    workspaceRef.current = workspace

    /**
     * Stand the user in the DOCUMENT'S OWN workspace before opening it.
     *
     * The workspace is the book you are standing in, and an entity that binds to an account
     * belongs to exactly one of them. Opening a live holding while standing in paper used to
     * import its broker accounts INTO paper instead: the account selector was handed a cTrader
     * id it had no row for, so its badge read "1" over a menu with nothing ticked — and, worse,
     * every save then resolved that selection through the paper account list and got nothing,
     * which is how "Update plan" could write `accounts: []` over a live holding's broker binding.
     *
     * Only switches when the document is genuinely CROSS-workspace: the switch flips the backend
     * paper flag, so re-flipping it for a document that already belongs here would churn
     * account-wide state (badge, positions, selectors) for nothing.
     */
    function alignWorkspaceTo(doc) {
        const ws = doc && ideaWorkspace(doc)
        if (ws && ws !== workspaceRef.current) setWorkspace(ws)
    }
    useEffect(() => {
        return eventBus.on(INVALIDATION_EDIT_IDEA, async ({ ideaId }) => {
            const idea = await resolveEntity('idea', ideaId)
            if (idea) handleEditIdea(idea, { invalidationReview: true })
        })
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // "Close trade" from an in-position invalidation alert. The alert payload only
    // carries the ideaId, so resolve the open position by the idea's symbol (matching
    // the broker-symbol alias too, e.g. NQ ↔ US100) and close it at market.
    useEffect(() => {
        return eventBus.on(INVALIDATION_CLOSE_TRADE, async ({ ideaId }) => {
            const idea = await resolveEntity('idea', ideaId)
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
        return eventBus.on(ENTRY_CONFIRM_OPEN, async ({ ideaId }) => {
            // Read by id, so the card can never arrive ahead of its own subject. This used to look
            // in the list first and re-poll only when the copy it found was missing or still read
            // 'awaiting_market' — a workaround for the same race the fetch simply doesn't have.
            const idea = await resolveEntity('idea', ideaId)
            if (!idea) return
            // AWAITED: the dialog is derived from the ideas list, not from the doc just read, so the
            // list has to hold this idea's current state before the state below flips — otherwise
            // the derivation runs against the stale copy and the dialog doesn't surface at all,
            // which is the exact failure the old awaiting_market re-poll existed to avoid.
            await loadIdeas()
            // Only switch workspace for a CROSS-workspace idea (that switch flips the backend paper
            // flag so the right accounts load — required to place the order). Never re-flip global
            // trading mode when the idea already belongs to the active workspace: confirming a
            // same-workspace card must not churn account-wide state (badge, positions, selectors).
            alignWorkspaceTo(idea)
            setDismissedConfirmIds(prev => {
                if (!prev.has(ideaId)) return prev
                const next = new Set(prev); next.delete(ideaId); return next
            })
        })
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Entry-confirm card "Edit": reopen the triggered idea in its chat to change it (→ building).
    useEffect(() => {
        return eventBus.on(ENTRY_CONFIRM_EDIT, async ({ ideaId }) => {
            const idea = await resolveEntity('idea', ideaId)
            if (idea) handleEditIdea(idea)
        })
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Entry-confirm card "Dismiss": park the triggered idea back to 'waiting' (re-armable),
    // same server transition as the workspace hit-card dismiss. Only when the idea is still
    // 'hit' — the card lingers in social chat, so a late dismiss (after the idea already
    // entered/closed) must NOT revert it. The backend also refuses closed→waiting; this just
    // avoids the doomed round-trip. See project_timestamp_ideas (Issue 2).
    useEffect(() => {
        return eventBus.on(ENTRY_CONFIRM_DISMISS, async ({ ideaId }) => {
            const idea = await resolveEntity('idea', ideaId)
            if (idea?.status === 'hit') handleDismissConfirm(idea)
        })
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Kairos call entry-confirm card ("Confirm order") → surface the SAME OrderConfirmDialog the idea
    // flow uses, driven by the call's Hermes-proposed entry. Switch to the call's workspace first so
    // The CALL_CONFIRM_OPEN doorway was here — it opened the shared OrderConfirmDialog on a call
    // awaiting confirm. Archived with Kairos on 2026-08-18; nothing reaches `hit` on a call now.

    // The CALL_EXPIRY_EDIT doorway was here. Kairos was archived on 2026-08-18, so an expiry card
    // has no desk to reopen into; historical cards still RENDER (their bubbles are pure), they
    // just no longer offer an edit that would land nowhere. See archive/README.md.

    // An entity POP-OUT asked for something only the app window can do (re-draw it in the desk's
    // chat). The bridge re-emits onto this same eventBus under the same event names the social-chat
    // cards use, so the doorways below serve both without knowing which one called.
    useEffect(() => listenForPopupEvents(), [])

    // Setup-invalidation card "Re-draw it" → reopen the setup in Mentor's chat AND open the turn.
    //
    // It shares the pencil's pipeline (chat_state + marked accounts restored, "Update setup" re-arms
    // Talos) but not its silence. The pencil lands on a restored conversation and waits, which is
    // right when the user chose to edit — and wrong here, where a monitor is the one who raised its
    // hand. It made the card's only button appear to do nothing: the desk opened with the old
    // conversation, no Update button (nothing had changed yet) and no mention of why the user had
    // been sent, so "Re-draw it" led to a desk with nothing to re-draw with. Prometheus and Pythia
    // already open on a turn from their cards; this is the same move.
    //
    // The reason comes off the RESOLVED DOC (redrawAsk), not the card payload — the doc is what
    // Talos keeps current, so a card opened tomorrow arrives at today's reason, and a setup already
    // re-drawn opens clean instead of on a complaint that no longer holds.
    //
    // Unresolvable ids fall back to the Mentor tab rather than a dead click — same rule as
    // SETUP_CONFIRM_OPEN. A setup deleted since the card was posted is the ordinary case.
    useEffect(() => {
        return eventBus.on(SETUP_INVALIDATION_EDIT, async ({ setupId }) => {
            const setup = await resolveEntity('setup', setupId)
            if (setup) handleEditSetup(setup, { ask: redrawAsk(setup) })
            else setActiveTab('mentor')
        })
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Market-brief card "Get the brief" → open Axl and have him write it there.
    //
    // Routing uses the normal leave-the-desk path (return overlay, pipeline cleared, panels reset)
    // so arriving from a card lands exactly where arriving by the back arrow does — but ONLY from
    // another tab: run on a user already talking to Axl it would remount the hub and wipe the
    // conversation they are in, to deliver a brief into the wreckage.
    //
    // The counter is what tells the hub to write. A counter and not a flag, because two briefs a
    // day (a second card after the first was dismissed) must both fire, and because switching to
    // the tab you are already on changes nothing on its own. The hub clears it once it starts, so
    // coming back to Axl later doesn't re-deliver a brief the user already read.
    useEffect(() => {
        return eventBus.on(MARKET_BRIEF_OPEN, () => {
            if (activeTabRef.current !== 'axl') handleBackToAxl()
            setBriefRequest(n => n + 1)
        })
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Coverage cards → the Analyst. WHICH Prometheus depends on what the card asked for, and the
    // payload has always carried enough to tell: this used to drop it on the floor and open a blank
    // chat, so a card saying "ZTS — target hit, revise the thesis" landed the user on an empty desk
    // with the name it named nowhere in sight.
    //
    //   • a monitor VERDICT (mode 'revise') → the pencil's own pipeline: update mode on that doc, a
    //     revise turn already in flight. The same move the Calls tab makes from its expiry card.
    //   • a REFRESHED thesis (mode 'open') → just show it. The research already ran; firing another
    //     multi-minute re-model to read the one that just landed is the opposite of the ask.
    useEffect(() => {
        return eventBus.on(OPEN_COVERAGE, async ({ coverageId, symbol, mode } = {}) => {
            // By id through the pipe. The symbol fallback stays — a card can name the ticker rather
            // than the doc — but it is now answered by the coverage book the SERVER holds, not by
            // whichever copy this client last rendered.
            const sym = String(symbol ?? '').toUpperCase()
            let cov = await resolveEntity('coverage', coverageId)
            if (!cov && sym) {
                const book = await analystService.listCoverage()
                cov = book.find(c => String(c.symbol ?? '').toUpperCase() === sym) ?? null
            }
            if (mode === 'revise' && cov) { handleEditCoverage(cov); return }
            // No doc resolved (a book this client hasn't reloaded yet) → still open the coverage
            // surface rather than a blank chat, so the name is one click away instead of nowhere.
            setActiveTab('analyst')
            setNewsTab('coverage')
        })
    }, [])

    // Sector-view card → the Radar's Forecasts tab. Unlike a coverage verdict there is nothing to
    // revise from here: the house view is a STATE, and the card's job is to put the board in front of
    // the reader. The Floor rail renders the same tab from its OWN calTab state, so it listens for
    // this event itself rather than having the tab lifted up here just to be pushed back down.
    useEffect(() => {
        return eventBus.on(OPEN_SECTOR_VIEW, () => setNewsTab('forecasts'))
    }, [])

    // Pythia's "review due" card → open the strategy desk and run the review there.
    //
    // Plain setActiveTab, not the leave-the-desk path Axl's brief uses: the desk panels are mounted
    // behind a display toggle rather than remounted per tab, so switching to Pythia keeps whatever
    // conversation is already in his thread instead of wiping it to deliver a review.
    //
    // A counter and not a flag, for the same reason the brief is one: a second card (after the first
    // was dismissed, or a month later) must fire again, and arriving at a tab you are already on
    // changes nothing on its own. The panel clears it once it starts.
    useEffect(() => {
        return eventBus.on(TILT_REVIEW_OPEN, ({ reason = null } = {}) => {
            setActiveTab('strategy')
            setReviewRequest(r => ({ n: r.n + 1, reason }))
        })
    }, [])

    // A Talos entry card routes here: social-chat card → Confirm → the order dialog. The setups
    // list is loaded in this component (useSetups), so the setup is resolved the same way an idea
    // is; if it can't be resolved (not yet reloaded, or already placed) fall back to Mentor rather
    // than leaving the click dead.
    useEffect(() => {
        return eventBus.on(SETUP_CONFIRM_OPEN, async ({ setupId }) => {
            // Confirm that the setup is real and the user's before opening a dialog keyed to it —
            // the same read every other card doorway makes now.
            const setup = setupId ? await resolveEntity('setup', setupId) : null
            if (!setup) { setActiveTab('mentor'); return }
            setSetupConfirmId(setupId)
            // The dialog derives from the setups list, so make sure it holds this setup's current
            // state — the market-open sweep can flip a parked setup while the list is 20s behind.
            refreshSetups?.()
        })
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Confirm a setup's entry. Execution is kind-blind (placeOrdersForIdea resolves the entity by
    // id, not by kind), so the setup's own plan places through the same endpoint an idea uses.
    async function handleConfirmSetupOrders(setup, orders) {
        setPlacingOrders(true)
        try {
            await tradeIdeasService.placeOrders(setup.id, orders)
            setSetupConfirmId(null)
            refreshSetups()
        } catch (err) {
            console.error('[setups] place orders failed', err)
            showErrorMsg(`Order placement failed: ${apiError(err)}`)
        } finally {
            setPlacingOrders(false)
        }
    }
    function handleDismissSetupConfirm() { setSetupConfirmId(null) }

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
            // Mark these as born-from-buy-market so a failed placement can roll them back
            // (the edit-branch above flips a PRE-EXISTING idea and must never be deleted).
            saved.forEach(s => { if (s?.id) buyMarketBornRef.current.add(s.id) })
            // Keep chat open so user can add stops/TPs; point edit session at the
            // primary idea (first returned, before any broker-fork children).
            if (saved[0]?.id) setEditingIdeaId(saved[0].id)
        } catch (err) {
            console.error('[tradeIdeas] buy market failed', err)
        }
    }

    // ── Immediate-trade ticket ────────────────────────────────────────────────
    // The discretionary order pad. It authors the SAME entity the chat's Buy Market does and
    // places it through the SAME endpoints — a ticket trade is an idea like any other, so it is
    // monitored, shows in the Floor, reaches the ledger and is visible to the agents. What is
    // dropped is the conversation, not the pipeline.
    //
    // The live ticket is read out of `ideas` rather than held in its own state: the entity is the
    // truth about whether it filled, and a fill that lands while this tab is in the background
    // then moves the ticket on by itself.
    const ticketIdea = ideas.find(i => i.id === ticketIdeaId) ?? null

    async function handleTicketPlace({ asset, direction, quantity, orderType, price, stop, tp }) {
        if (ticketBusy) return
        setTicketBusy(true)
        setTicketError(null)
        try {
            const resting   = orderType === 'limit' || orderType === 'stop'
            const protect   = [describeLeg('stop', stop), describeLeg('target', tp)].filter(Boolean)
            const saved = await tradeIdeasService.createIdea({
                asset,
                direction,
                quantity,
                accounts:      selectedAccounts,
                mainAccountId,
                // A market ticket is `immediate` — no entry conditions, so it goes straight to
                // 'hit' with a built order plan. A limit/stop ticket instead states its trigger
                // as a bare price and rests AT the broker, which is what the user asked for:
                // the level is left with the venue, not watched by us.
                ...(resting
                    ? { entry_order_type: orderType, entry_price: price }
                    : { immediate: true }),
                // Protective levels stated WITH the entry, as a ladder — one rung, or several
                // that each close a slice. The server expands every rung into the `touch` leg the
                // routing already speaks (applyPriceLevels) and rests ONE broker order per rung,
                // so both placement paths pick them up with no extra call and no window in which
                // the position is on and unprotected: the market path places them inline once the
                // entry fills (placeOrdersForIdea → placeExits), and the resting path stores them
                // on the entity and the reconciler places them the moment the working order opens
                // a position. Only a leg the user filled in is sent — an absent one leaves the
                // entity's leg untouched rather than clearing it.
                ...(stop != null && { stop_price: stop }),
                ...(tp   != null && { tp_price:   tp }),
                notes: `Ticket — ${direction} ${quantity} ${asset} (${orderType})${protect.length ? ` · ${protect.join(' · ')}` : ''}`,
            })
            if (!saved.length) throw new Error('the idea was not created')

            // A ticket spanning two brokers forks into a child per broker; every child has to be
            // sent, or the accounts the user picked would silently not trade.
            const results = await Promise.allSettled(saved.map(s => (
                resting
                    ? tradeIdeasService.updateIdea(s.id, { status: 'resting' })
                    : tradeIdeasService.placeOrders(s.id)
            )))
            const failed = results.filter(r => r.status === 'rejected')
            if (failed.length === saved.length) {
                // Nothing reached a broker, so the entity is a ghost: an idea sitting at 'hit'
                // holding no position, which would show in the book as a trade that never was.
                // Roll it back — the same guard handleBuyMarket keeps for its own born-here ideas.
                await Promise.allSettled(saved.map(s => tradeIdeasService.deleteIdea(s.id)))
                await loadIdeas()
                throw failed[0].reason ?? new Error('the broker rejected the order')
            }
            if (failed.length) showErrorMsg(`${failed.length} of ${saved.length} broker orders failed`)

            setTicketIdeaId(saved[0].id)
            const done = resting ? `${orderType} order resting at the broker` : `${direction === 'short' ? 'Sold' : 'Bought'} ${quantity} ${asset}`
            showSuccessMsg(protect.length ? `${done} — ${protect.join(', ')}` : done)
            await Promise.all([loadIdeas(), refreshPositions(true)])
        } catch (err) {
            console.error('[ticket] place failed', err)
            setTicketError(apiError(err, 'Could not place the order'))
        } finally {
            setTicketBusy(false)
        }
    }

    // How a leg reads in a sentence — one place, because the ticket says it in three (the order
    // note that reaches the ledger, the placed toast and the attached toast) and three copies of
    // "stop 185.5 / 182" is three chances for them to describe different things.
    function describeLeg(word, levels) {
        if (!levels?.length) return null
        const at = levels.map(l => (l.quantity != null ? `${l.price}×${l.quantity}` : String(l.price))).join(' / ')
        return `${levels.length > 1 ? `${word}s` : word} ${at}`
    }

    // Attach / move the protective levels on the live ticket position. Only the leg the user
    // touched is sent — the server merges it over the other one, so moving a stop can't drop a
    // target — and the leg travels WHOLE: arming replaces a leg's resting orders outright
    // (armExitsInPosition cancels the old set first), so a partial leg would silently retire the
    // rungs it left out.
    async function handleTicketAttachExits({ stop, tp }) {
        if (!ticketIdeaId || ticketBusy) return
        setTicketBusy(true)
        setTicketError(null)
        try {
            // `undefined` is the untouched leg; `null` is the leg the user CLEARED, and it has to
            // travel — null is how the server takes a stop off (applyPriceLevels → an empty leg →
            // armExitsInPosition cancels what was resting). Testing `!= null` here swallowed the
            // null and made "remove my stop" a no-op that reported success.
            await tradeIdeasService.updateIdea(ticketIdeaId, {
                ...(stop !== undefined && { stop_price: stop }),
                ...(tp   !== undefined && { tp_price:   tp }),
            })
            const [word, levels] = stop !== undefined ? ['Stop', stop] : ['Target', tp]
            showSuccessMsg(levels?.length ? `${describeLeg(word, levels)} is at the broker` : `${word} removed`)
            await loadIdeas()
        } catch (err) {
            console.error('[ticket] attach exits failed', err)
            setTicketError(apiError(err, 'Could not place the protective order'))
        } finally {
            setTicketBusy(false)
        }
    }

    // Pull a resting entry. Deleting the idea is what cancels it — the delete path already
    // cancels a resting entity's working orders, so this stays one call rather than a
    // cancel-then-tidy pair that could half-fail.
    async function handleTicketCancelResting() {
        if (!ticketIdeaId || ticketBusy) return
        setTicketBusy(true)
        setTicketError(null)
        try {
            await tradeIdeasService.deleteIdea(ticketIdeaId)
            setTicketIdeaId(null)
            showSuccessMsg('Resting order cancelled')
            await loadIdeas()
        } catch (err) {
            console.error('[ticket] cancel resting failed', err)
            setTicketError(apiError(err, 'Could not cancel the order'))
        } finally {
            setTicketBusy(false)
        }
    }

    async function handleTicketClose() {
        if (!ticketIdea || ticketBusy) return
        const open = matchPositionsForIdea(ticketIdea, positions)
        if (!open.length) { setTicketError('No open position found for this ticket'); return }
        setTicketBusy(true)
        setTicketError(null)
        try {
            for (const pos of open) await closePosition(pos.broker, pos.id, pos.accountId)
            showSuccessMsg('Position closed')
            await Promise.all([loadIdeas(), refreshPositions(true)])
        } catch (err) {
            console.error('[ticket] close failed', err)
            setTicketError(apiError(err, 'Could not close the position'))
        } finally {
            setTicketBusy(false)
        }
    }

    // "New ticket" only lets go of the entity — it never deletes it. The position (or the closed
    // trade) stays exactly where it belongs, in the book and the ledger.
    function handleTicketReset() {
        setTicketIdeaId(null)
        setTicketError(null)
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

    // Go live with a whole book, from the Floor's portfolio list. The ideas table and the cards each
    // hold their own copy of this trigger because the group row IS the control there; the Floor row
    // has no status cell to press, so the act is handed up here where the book's legs and the
    // status pipe both already live. The MEANING of activation (broker legs vs the manual fill
    // card) is shared — see activatePortfolio.
    function handleActivatePortfolio(portfolioId) {
        const book = ideas.filter(i => i.portfolioId === portfolioId)
        if (!book.length) return
        activatePortfolio(book, {
            isManual: book.some(isManualIdea),
            onStatusChange: handleStatusChange,
            onManualEntry: () => eventBus.emit(MANUAL_PORTFOLIO_ACTIVATE, { portfolioId }),
        })
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
            buyMarketBornRef.current.delete(idea.id)   // placed — no longer a phantom
        } catch (err) {
            console.error('[tradeIdeas] place orders failed', err)
            // Surface the broker's rejection reason (e.g. "symbol 'QQQ' not found on
            // account") instead of failing silently — apiError prefers the per-account
            // result over the summary line.
            showErrorMsg(`Order placement failed: ${apiError(err)}`)

            if (buyMarketBornRef.current.has(idea.id)) {
                // Buy-market idea whose order never placed: it exists only to carry this
                // order, so roll it back out of existence and return the chat to its
                // pre-buy state instead of leaving a phantom 'hit' idea stuck on
                // "Update idea". ('hit' is not delete-locked — only long/short are.)
                buyMarketBornRef.current.delete(idea.id)
                setEditingIdeaId(prev => (prev === idea.id ? null : prev))
                setIdeas(prev => prev.filter(i => i.id !== idea.id))
                tradeIdeasService.deleteIdea(idea.id)
                    .catch(e => console.error('[tradeIdeas] rollback delete failed', e))
            } else {
                // Conditional idea (reached 'hit' via the monitor) or a pre-existing idea
                // flipped to immediate: keep it in 'hit' so the user can retry.
                setDismissedConfirmIds(prev => new Set(prev).add(idea.id))
            }
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
                const chatMessages = toChatHistory(messages)
                // threadId links the construction draft thread to the new portfolio (clears its TTL).
                // AWAITED: finishPipeline below deletes this desk's remaining drafts, and this thread
                // is one of them until the link lands. Losing that race would take the mandate
                // conversation with it — the very thing "edit the book" is supposed to reopen.
                await portfolioService.saveChatState(portfolioId, chatMessages, mandate, thesis, threadId, portfolioName).catch(err =>
                    console.error('[portfolio] chat state save failed', err)
                )
            }
            // The book exists → the run is over, not paused, so the desk's drafts go with it. An empty
            // batch created nothing, and its conversation is then the only copy of the work: that goes
            // home the ordinary way, still resumable.
            if (newIdeas.length > 0) finishPipeline()
            else handleBackToAxl()
        } catch (err) {
            console.error('[portfolio] batch create failed', err)
        }
    }

    // Which act this is belongs to the BOOK, not to the surface the click came from. Four paths reach
    // here — three pencils and the Axl hand-off — and they disagreed: the two lists forced a review
    // only when one was DUE, the Floor pencil never did, so the same live book was reviewed from one
    // surface and RE-PLANNED from another, standing its open positions down to rewrite a plan the
    // market had already acted on. Deciding it here is what makes the four agree.
    //
    // A caller may still FORCE a review (a due-review pencil, the review card, the pre-activation
    // prompt) — that is a schedule or a request, and it is legitimate on a book with nothing live.
    // None of them can force a plain edit on a book that holds a position. See isPortfolioReview.
    async function handleEditPortfolio(portfolioId, { reviewMode: forceReview = false } = {}) {
        // The book is READ, not filtered out of whatever this client happens to be holding. It used
        // to be `ideas.filter(...)`, which made opening a book depend on a list having loaded — and
        // from a social-chat card it hadn't, so Atlas was handed a portfolio with no item ids,
        // invented them, and every accepted change came back not_found.
        const portfolioIdeas = await resolveEntity('portfolio', portfolioId)
        if (!portfolioIdeas) { showErrorMsg('Could not open the portfolio — try again'); return }
        if (!portfolioIdeas.length) { showErrorMsg('This portfolio has no holdings'); return }
        const reviewMode = forceReview || isPortfolioReview(portfolioIdeas)

        // Seed the account selector from the portfolio's own ideas so it reflects
        // what's actually attached (not stale global selection) — and so saving the
        // edit doesn't wipe accounts the user never meant to change.
        const seedAccounts = [...new Set(portfolioIdeas.flatMap(i => Array.isArray(i.accounts) ? i.accounts : []))]
        // A book's holdings all bind to the same workspace, so the first one names it for the book.
        alignWorkspaceTo(portfolioIdeas[0])
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
                // No re-plan, but the account selection may have changed while editing — so push it
                // onto the ideas that can still take it. What may be pushed, and onto which legs, is
                // planAccountRebind's call: this writes the field the order and exit paths route by,
                // and it used to write `accounts: []` over a live holding's broker id whenever the
                // book was opened from another workspace. null = nothing legitimate to push.
                const rebind = planAccountRebind(existing, accountIds, mainAccountId)
                if (rebind) {
                    await Promise.all(rebind.targets.map(i =>
                        tradeIdeasService.updateIdea(i.id, { accounts: rebind.accounts, mainAccountId: rebind.mainAccountId })))
                    const touched = new Set(rebind.targets.map(i => i.id))
                    setIdeas(prev => prev.map(i =>
                        touched.has(i.id) ? { ...i, accounts: rebind.accounts, mainAccountId: rebind.mainAccountId } : i))
                }
            }

            const chatMessages = toChatHistory(messages)
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
                // `_item` vocab — a holding is a portfolio_item. The `_idea` spelling was accepted
                // here through the rename and was dropped 2026-08-19 on both sides, after a raw scan
                // of every stored document found none: nothing produces it and nothing holds one.
                const id   = change.itemId
                const spec = change.item
                if (change.action === 'update_item' && id && change.patch) {
                    promises.push(tradeIdeasService.updateIdea(id, change.patch))
                } else if (change.action === 'remove_item' && id) {
                    // A live leg (in position / hit) can't be deleted — keep it and flag
                    // it rather than fail the whole batch. The rest of the changes apply.
                    const target = ideaById.get(id)
                    if (target && isDeleteLocked(target)) { skippedLive.push(target); continue }
                    promises.push(tradeIdeasService.deleteIdea(id))
                } else if (change.action === 'add_item' && spec) {
                    const existing = ideas.filter(i => i.portfolioId === update.portfolioId)
                    promises.push(tradeIdeasService.createIdea({
                        ...spec,
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
            const result = await portfolioService.applyRebalance(update.portfolioId, update)
            loadIdeas()
            // Shut venue: the changes were queued, not executed. The list is fetched, never pushed
            // to, so re-read it here or they stay invisible until the next page load.
            if (queuedAnything(result)) loadQueued()
        } catch (err) {
            console.error('[portfolio] rebalance failed', err)
            showErrorMsg('Could not apply the rebalance — try again.')
        } finally {
            setApplyingRebalance(false)
            setPendingRebalance(null)
        }
    }

    // ── The queued list ───────────────────────────────────────────────────────
    // Work confirmed while a venue was shut, plus anything the market-open sweep has unparked.
    // See docs/architecture/off-hours-queue.md.

    const loadQueued = useCallback(async () => {
        setQueued(await pendingActionService.list())
    }, [])

    useEffect(() => { loadQueued() }, [loadQueued])

    // Axl's market-open card → open the Floor on the queued desk. A fresh object every time so a
    // second press re-opens the desk the user closed in between.
    // `floorMode` is a DESIGN variant, not state — this can ask for the desk but cannot switch the
    // user into the design that renders it. Rather than route into a surface that isn't there, say
    // where the list lives. (Only reachable on a non-Floor design; the Floor is the default.)
    useEffect(() => {
        const off = eventBus.on(OPEN_QUEUED_LIST, () => {
            if (!floorMode) {
                showUserMsg('Your queued list is on the Floor — switch the design to Floor to open it.')
                return
            }
            setDeskRequest({ key: 'queued' })
            loadQueued()
        })
        return off
    }, [loadQueued, floorMode])

    /**
     * Execute a queued row. Routing is the contract's judgment, not this component's: an ENTRY has
     * a confirm surface already (levels, size, risk) and is handed to it; a queued trim/exit/add
     * was decided in full and only needs a yes, so it opens the queue's own confirm.
     */
    function handleExecuteQueued(row) {
        const route = executeRoute(row)
        if (route.kind === 'event') {
            eventBus.emit(route.event, route.payload)
            return
        }
        if (route.kind === 'confirm') { setQueuedConfirm(row); setQueuedError(null); return }
        showErrorMsg('This item came from a desk that can no longer run it.')
    }

    async function handleConfirmQueued() {
        const row = queuedConfirm
        if (!row) return
        setQueuedBusyId(row.id)
        setQueuedError(null)
        const res = await pendingActionService.execute(row.id)
        setQueuedBusyId(null)
        if (res?.ok === false) {
            // Stays open with the reason: "it rounds down to zero shares" is something to act on,
            // and a dialog that vanishes on failure leaves the user guessing what happened.
            setQueuedError(res.error ?? 'failed')
            await loadQueued()
            return
        }
        setQueuedConfirm(null)
        await Promise.all([loadQueued(), loadIdeas()])
        showSuccessMsg('Done — the order is with your broker.')
    }

    async function handleCancelQueued(row) {
        setQueuedBusyId(row.id)
        const res = await pendingActionService.cancel(row.id)
        setQueuedBusyId(null)
        await loadQueued()
        if (res?.ok === false) { showErrorMsg('Could not cancel it — try again.'); return }
        // `noted` is whether the desk that decided it was told. It matters: an un-noted cancel
        // means the next review can propose the same thing again, unaware it was turned down.
        showSuccessMsg(res?.noted ? 'Cancelled — the desk has been told.' : 'Cancelled.')
    }

    // Accept an Atlas review proposal from the inline review bar. Executes server-side
    // (routed by mode/position: paper/live close, manual posts a Fill card, pending books
    // apply idea edits), then refreshes ideas. Returns false on failure so the panel keeps
    // the proposal for a retry. A pending (not-yet-activated) book gets an activate nudge.
    async function handleAcceptReview(portfolioId, update, { pending } = {}) {
        let result
        try {
            result = await portfolioService.applyRebalance(portfolioId, update)
        } catch (err) {
            console.error('[portfolio] accept review failed', err)
            // Say WHICH refusal it was. The server answers on the shared reason vocabulary and sends
            // the per-change failures back in `failed`, so "nothing was executed" no longer has to
            // stand in for a book that couldn't be reached, holdings already closed, and ids that
            // matched nothing alike. Returning false keeps the proposal on screen for a retry.
            const failed  = err?.response?.data?.failed
            const reasons = Array.isArray(failed) ? [...new Set(failed.map(f => f?.reason).filter(Boolean))] : []
            const detail  = reasons.length ? ` (${reasons.join(', ')})` : ''
            showErrorMsg(`${apiError(err, 'Could not apply the changes')}${detail} — nothing was executed.`)
            return false
        }
        // `loadQueued` only when something was actually deferred — the message and the refresh read
        // the SAME bucket, so the list can never be stale behind a toast that says "waiting in your
        // queued list". (See queuedAnything.)
        await Promise.all([loadIdeas(), ...(queuedAnything(result) ? [loadQueued()] : [])])
        showSuccessMsg(reviewApplyMessage(result, { pending }))
        return true
    }

    // Scanner ticker chip click (inside the scanner chat): just preview on the chart.
    function handleScannerSymbol(ticker) {
        if (ticker) setChartSymbol(ticker)
    }

    // Shared calendar → Mentor handoff: open the setup desk with the catalyst already said, and put
    // the ticker on the chart so the conversation and the chart open on the same name. The message
    // rides in keyed (see MentorPanel's `seed`) so one click sends one turn.
    function seedMentorChat(symbol, message) {
        if (!symbol) return
        setMentorSeed({ key: Date.now(), message })
        setActiveTab('mentor')
        setChartSymbol(symbol)
    }

    // ── Axl reception → the order ticket ──────────────────────────────────────
    // Trade by hand, picked in the hub beside the desks. No pipeline and no summon: the pad is one
    // screen, and the agentbar's "← axl" is the way back, exactly as it is from a desk.
    function handleOpenTicket() {
        setActiveTab('ticket')
        setActivePipeline(null)
    }

    // ── Axl reception → a desk ────────────────────────────────────────────────
    // The hub summoned a desk (AxlHub's `onPick`), and it carries the hand-off in two parts.
    //
    // `opts.opening` is the whole point of routing: what the user said they came for, in their own
    // words, sent at the desk as THEIR first message. EVERY desk takes one, because it is not a
    // parameter anyone has to interpret — it is the sentence the user would have typed on arrival,
    // and each entry agent already knows what to do with a sentence. (This is why the desks that
    // used to be excluded no longer are: a bare TICKER seed at Argus or Atlas jumped the frame they
    // have to establish first — Argus opens on a screen, Atlas on the mandate — but "I want 5%
    // profit" IS Atlas's Phase 1 material, and "I think NVDA breaks out" is Argus's.)
    //
    // `opts.symbol` is the name Axl resolved from the conversation, so the entry agent opens ON it
    // and the user doesn't say "NVDA" twice. It still words its own sentence for the two single-name
    // desks — but only when no opening came, since the user's own words always say it better.
    //
    // Both go through the same keyed one-shot seed every hand-off in the app uses (useSeedTurn).
    // ── Axl hand-off → an item's own EDIT mode ────────────────────────────────
    // A route opens a desk for new work; this reopens something the user already has. Axl names the
    // kind and the handle (both come straight off `get_watched_items`, whose rows lead with
    // `[kind:id]`), and the doc is handed to the SAME function the list-surface pencil calls — so an
    // edit reached from a sentence and an edit reached from a click are the one edit, with the same
    // conversation restored. Nothing new is built here; that is the whole point of the feature.
    //
    // The ref is READ by id, through the same pipe the cards and the pencils use — the server's
    // owner-scoped get is also the authorization, so a hallucinated or borrowed id answers 404
    // rather than relying on being absent from a list this client happened to load.
    //
    // Falls back to the symbol for the kinds that have one (Axl may have had no id to quote), and
    // resolves false when nothing matches so the caller can open the desk the ordinary way rather
    // than leaving the hand-off dead — the same choice the OPEN_COVERAGE card makes.
    /**
     * Open something the user already has, at the desk that owns it.
     *
     * FINDING it is not this component's job — resolveForEdit answers an id or a name, and answers
     * null rather than guessing when a name is ambiguous. What stays here is the OPENING, because
     * each desk's opener is a closure over this component's state and cannot leave it.
     */
    async function openForEdit({ kind, ref } = {}) {
        const doc = await resolveForEdit(kind, ref)
        if (!doc) return false
        switch (kind) {
            case 'setup':    handleEditSetup(doc);   return true
            case 'scan':     handleEditScan(doc);    return true
            // The coverage tab is brought forward: the pencil is normally pressed from it, so
            // arriving from a sentence should land on the same surface a click would have.
            case 'coverage': setNewsTab('coverage'); handleEditCoverage(doc); return true
            // Keyed, not handed — the one kind whose editor takes an id. handleEditPortfolio does
            // its own read and decides review-vs-replan from the book's state; passing that from
            // here would be a second copy of the judgment.
            case 'portfolio': handleEditPortfolio(doc.portfolioId); return true
            default:          return false
        }
    }

    async function handleAxlPick(tab, opts = {}) {
        // An edit hand-off names an ITEM, not a desk, and the item picks the tab: a call edits in
        // Kairos even though the trading desk enters at Argus. So the tab argument is skipped and the
        // opener sets its own — but the pipeline is still stamped, so the crumb and the back button
        // read exactly as they do on any other arrival.
        if (opts.edit) {
            setActivePipeline(opts.pipeline ?? null)
            setPipelineStep(0)
            if (await openForEdit(opts.edit)) return
            // Nothing resolved (a list this client hasn't loaded, a ref that never existed) — fall
            // through and open the desk normally. Worse than the edit, far better than nothing.
        }
        setActiveTab(tab)
        setActivePipeline(opts.pipeline ?? null)
        setPipelineStep(0)                                    // a desk always opens at its first step
        setNewsTab('scans')

        // ADOPT MODE. The user already owns the book, so Atlas must not open on a blank construction.
        // A draft is staged EMPTY and immediately: the desk needs a draftId to attach the conversation
        // to, every turn parses into it, and the grid renders it. Staged here rather than on the first
        // paste because the draftId is what makes the whole session one book — a draft minted later,
        // per paste, would adopt two half-books.
        if (opts.adopt) {
            adoptService.stage({ name: 'My bank book' })
                .then(draft => setAdoptDraft(draft))
                .catch(() => showErrorMsg('Could not open the adoption'))
        } else if (adoptDraft) {
            // Leaving the desk by any other door ends the adoption session. The draft itself survives
            // on the server (listStaged resumes it) — this only stops it bleeding into the next book.
            setAdoptDraft(null)
        }

        // Walked back into something left unfinished → pick it up, rather than opening a blank desk and
        // making the user find it in a drawer. Returns before the seed branch below: a resumed
        // conversation already has its own history and must not be opened on a fresh opening turn too.
        if (opts.resumeThreadId) {
            _resumeThreadOn(tab, opts.resumeThreadId)
            return
        }

        const opening = typeof opts.opening === 'string' ? opts.opening.trim() : ''
        const key = Date.now()
        if (opening) {
            switch (tab) {
                case 'analyst':   return setAnalystSeed({ key, message: opening })
                case 'mentor':    return setMentorSeed({ key, message: opening })
                case 'portfolio': return setPortfolioSeed({ key, message: opening })
                // Argus is the entry for BOTH the trade desk and the scan desk, and both are the
                // trading profile — named rather than left to the panel, which may still be on the
                // investing profile from a portfolio sleeve run.
                case 'scanner':   return setScannerSeed({ key, message: opening, profile: 'trading' })
                default: break
            }
        }
        if (!opts.symbol) return
        if (tab === 'analyst') setAnalystSeed({ key, message: `Research ${opts.symbol} for coverage.` })
        if (tab === 'mentor')  setMentorSeed({ key, message: `I want to work on my own ${opts.symbol} trade.` })
    }

    // ── Walking the pipeline ──────────────────────────────────────────────────
    // Follow the user along the desk's chain. Derived from the tab so every hand-off — the ones
    // above, the ones below, and any added later — keeps the crumb and the back button honest
    // without having to remember to stamp a step number. See pipelineNav.js for the ambiguity it
    // resolves (Atlas stands at two different steps).
    useEffect(() => {
        if (!activePipeline) return
        const steps = DESKS.find(d => d.key === activePipeline)?.steps ?? []
        setPipelineStep(prev => resolveStepIndex(steps, activeTab, prev))
    }, [activeTab, activePipeline])

    // One step back up the chain. Distinct from the axl button beside it, which leaves the pipeline
    // altogether: this keeps the desk and the work, so the user can re-read the mandate that framed
    // a screen, or re-open the list a call came from, and carry on forward again.
    //
    // A plain tab switch, deliberately: every panel stays mounted (hidden, not unmounted), so going
    // back finds the conversation as it was left. It must NOT bump a reset key.
    const activeDesk   = activePipeline ? DESKS.find(d => d.key === activePipeline) : null
    const backStep     = previousStep(activeDesk?.steps, pipelineStep)
    function handleStepBack() {
        if (!backStep) return
        setPipelineStep(pipelineStep - 1)
        setActiveTab(backStep.tab)
    }

    // ── The conveyor ──────────────────────────────────────────────────────────
    // One hand-off mechanism for every desk that has declared a contract. A desk emits an artifact;
    // planHop decides who takes it, how they take delivery, and whether their panel starts clean;
    // this applies the plan. Nothing here knows which two desks are talking — that is the point.
    //
    // The four moves each hop used to hand-roll (compose a seed, remount the right panel, clear the
    // other hops' state, switch the tab) live here once, so a hop added later cannot get one of
    // them subtly wrong. See docs/pipeline-service-design.md.
    // Where the conveyor puts what it delivers, per desk (services/pipeline/doors.js): an INBOX for
    // a desk that takes the envelope whole, a SEED for one that opens on a sentence it wrote itself.
    // A desk declares which in its contract (`deliver`); the doors say where it lands. Mentor and
    // Prometheus keep seed doors that are NOT here — a calendar card, an Axl routing — reachable
    // only from outside a chain, and closed by `doors.clear()` all the same.
    const PIPELINE_INBOX = doors.inbox
    const PIPELINE_SEED  = doors.pipelineSeed
    // Only inside a pipeline: off a desk there is no chain, so there is nothing to advance along
    // and a panel must keep offering its hand-off by hand.
    const autoHandoff = pipelineMode === 'auto' && !!activePipeline
    const stepsOf = (key) => (key ? (DESKS.find(d => d.key === key)?.steps ?? []) : [])

    // Argus in single-pick mode: it answers with ONE name for a build desk instead of a watchlist.
    // Two ways in, and they are the same question asked from either side — a desk handed it a
    // scan_request, or the desk it is standing on exists to build one trade (`produces: 'one'`).
    // Only the first existed before, which is why entering the trade desk AT Argus dead-ended in a
    // saved list with no way forward.
    const scannerSingle = scannerInbox?.kind === KIND.SCAN_REQUEST
        || producesOne(stepsOf(activePipeline), 'scanner')

    // …and WHICH desk that is. Asked of findReceiver rather than assumed, because this answer is
    // shown to the user — in Argus's empty state, in its hand-off button, and in the prompt Argus
    // writes from — and emitArtifact routes the pick with the very same call. Derived, so the label
    // cannot drift from the destination: for two months every one of those surfaces said "Kairos"
    // while the trade desk had already moved its build step to Mentor.
    //
    // The chain it walks mirrors emitArtifact exactly, borrowed-chain fallback included: inside a
    // pipeline its own steps, outside one the steps of the desk Argus belongs to.
    const scannerHandoffTo = (() => {
        const steps = activePipeline
            ? stepsOf(activePipeline)
            : (DESKS.find(d => d.steps.some(s => s.tab === 'scanner'))?.steps ?? [])
        const from = steps.length ? resolveStepIndex(steps, 'scanner', pipelineStep) : 0
        return findReceiver(steps, from, KIND.CANDIDATE_LIST)?.step?.tab ?? null
    })()

    function _applyHop(plan, artifact) {
        // Only one desk holds an inbox at a time: an artifact still sitting somewhere upstream is a
        // stale hand-off waiting to re-fire on the next remount. Clearing every inbox and then
        // filling the target's is what the per-hop handlers each used to do by hand.
        Object.values(PIPELINE_INBOX).forEach(set => set(null))
        PIPELINE_INBOX[plan.agent]?.(artifact)

        if (plan.delivery.type === 'seed') {
            const { type: _t, message, ...opts } = plan.delivery
            // An edit-restore must not fight a brief. Scanner-only because it is the only desk whose
            // hand-off can collide with a list reopened from its pencil.
            if (plan.agent === 'scanner') setScannerChatRestore(null)
            PIPELINE_SEED[plan.agent]?.({ key: artifact.key, message, ...opts })
        }
        // A remount is per-desk on purpose: the desk that SENT the artifact has to keep its
        // conversation, or stepping back lands on a blank chat.
        if (plan.remount && plan.agent === 'scanner') setScannerResetKey(k => k + 1)
        if (plan.targetIndex != null) setPipelineStep(plan.targetIndex)
        setActiveTab(plan.targetTab)
    }

    /**
     * A desk produced something. Routes it, or answers false when this pipeline has nowhere to put
     * it — an unroutable artifact is the caller's to report, never silently dropped here.
     *
     * `viaUser` is the difference between the user pressing "send it on" and the conveyor moving by
     * itself. A user press always travels; an automatic advance has to be allowed by the plan, which
     * is where auto mode and the gates are decided (planHop). That is what keeps a gated step —
     * arming, order confirmation — human even with the toggle on.
     */
    function emitArtifact(artifact, { fromTab = activeTab, viaUser = true } = {}) {
        // Outside a pipeline — a call reopened for editing, say — there is still a hand-off to make.
        // BORROW the chain this desk belongs to rather than routing on capability alone: three desks
        // now take a candidate_list, so "the only agent that qualifies" stopped being an answer the
        // moment Mentor and Prometheus declared themselves. A desk's own pipeline knows which of
        // them comes next; nothing else does.
        const inPipeline = !!activePipeline
        const steps = inPipeline
            ? stepsOf(activePipeline)
            : (DESKS.find(d => d.steps.some(s => s.tab === fromTab))?.steps ?? [])
        const plan  = planHop({
            steps,
            fromIndex: steps.length ? resolveStepIndex(steps, fromTab, pipelineStep) : 0,
            artifact,
            mode: pipelineMode,
        })
        if (!plan) return false
        if (!viaUser && !plan.auto) return false
        // A borrowed chain routes but does not place the user IN it: stamping a step for a pipeline
        // they never entered would light a crumb that isn't on screen.
        _applyHop(inPipeline ? plan : { ...plan, targetIndex: null }, artifact)
        return true
    }

    /**
     * ENTER a pipeline at one of its steps, artifact in hand — the move that "send this list to
     * research" actually is. Not a hop from where the user is standing: they may be standing on the
     * trade desk, or on the Lists surface, standing nowhere at all. What they pressed says which
     * desk's work this is, and the artifact says what it starts with.
     *
     * The step is named by AGENT, so reordering that pipeline moves the entry point with it.
     *
     * Answers false when that desk cannot take this kind, so the caller can fall back rather than
     * leave the user on a panel holding something it does not read.
     */
    function enterPipelineAt(pipelineKey, agent, artifact) {
        const steps = stepsOf(pipelineKey)
        const plan  = planEntry({ steps, agent, artifact, mode: pipelineMode })
        if (!plan) return false
        setActivePipeline(pipelineKey)   // they are IN it now — the crumb and the back button follow
        _applyHop(plan, artifact)
        return true
    }

    // Route OUT: Atlas emitted a <screen_request> (a sleeve mandate) → open Argus in the INVESTING
    // profile, seeded with the mandate. Not a single-pick hand-off — a fundamental candidate list that
    // routes on to the Analyst.
    function handleSourceInArgus(requests) {
        const sleeves = (Array.isArray(requests) ? requests : [requests]).filter(r => r && (r.sector || r.style))
        if (!sleeves.length) return
        sleeveRunRef.current = { active: true, queue: sleeves.slice(1), sectors: [], total: sleeves.length, current: null }
        _screenSleeve(sleeves[0], { fresh: true })
    }

    // What to call a sleeve in the UI and in the record handed back to Atlas. The industry is the
    // binding pond when Atlas named one, so it leads.
    const sleeveLabel = (sr) => sr?.industry || sr?.sector || sr?.style || 'sleeve'

    /**
     * Move the run on: the next sleeve, or the hand-off to Prometheus once they are all screened.
     * ONE mover for both paths — a sector that produced a list (handleGenerateList) and one that
     * produced nothing and was skipped — so the two can never advance the queue differently.
     */
    function _advanceSleeveRun() {
        const run  = sleeveRunRef.current
        const next = run.queue[0]
        run.queue  = run.queue.slice(1)
        if (next) { _screenSleeve(next); return }
        run.active  = false
        run.current = null
        setSleeveRun({ active: false, index: 0, total: 0, label: null })
        _researchSurvivors(run.sectors)
    }

    /**
     * This sleeve produced no list — Argus said nothing cleared the bar, asked a question nobody is
     * here to answer, or its block never closed. Record it as SCREENED-EMPTY and move on.
     *
     * The run used to have only a happy path: the advance lived inside "a list came back", so a
     * listless turn stalled it silently and every remaining sleeve was lost. An empty sleeve is a
     * RESULT — Atlas hears about it at the end (see _researchSurvivors) and can widen or drop it.
     */
    function handleSkipSleeve() {
        const run = sleeveRunRef.current
        if (!run.active) return
        run.sectors.push({ sector: sleeveLabel(run.current), names: [], empty: true })
        _advanceSleeveRun()
    }

    // Seed Argus for ONE sleeve. Remounts it fresh so each sector is its own scan — a sleeve's list
    // is its own artifact, and its ranking only means anything within its own pond.
    function _screenSleeve(sr, { fresh = false } = {}) {
        const run = sleeveRunRef.current
        run.current = sr
        // index counts sleeves ENTERED, not finished: `total` minus what is still queued.
        setSleeveRun({ active: true, index: run.total - run.queue.length, total: run.total, label: sleeveLabel(sr) })
        // The sleeve travels as a MANDATE artifact and Argus's own contract composes the brief —
        // this desk states what it wants screened, not how Argus should open on it. (The run still
        // applies the hop itself: its remount discipline is per-sleeve, not per-hop. Phase 4.)
        const mandate = makeArtifact({
            kind: KIND.MANDATE, items: [sr], from: { agent: 'portfolio', label: 'Mandate' },
        })
        const brief = contractFor('scanner').brief(mandate)
        setScannerInbox(mandate)
        setScannerChatRestore(null)
        setScannerSeed({ key: mandate.key, message: brief.message, profile: brief.profile })
        // Remount only when ENTERING the run — a fresh Argus for a fresh book. Between sectors the
        // conversation continues: remounting there wiped the transcript the user had just watched
        // build, and tore the panel down in the middle of the turn that triggered it.
        if (fresh) setScannerResetKey(k => k + 1)
        setActiveTab('scanner')
        setNewsTab('scans')
    }

    // Route ON: Argus emitted a <kairos_pick> and the user tapped the hand-off button → give the
    // ticker (+ its read) to the build desk as a one-item candidate list. Where it lands is
    // emitArtifact's call, not ours (scannerHandoffTo shows the user the same answer up front).
    //
    // When a desk SENT the request it still holds the bias and horizon in its (never-unmounted)
    // conversation, so the horizon rides in `context` off that request: the sender's own answer,
    // not Argus's guess at it.
    function handleSendPick(pick, opts = {}) {
        if (!pick?.ticker) return
        const request = firstItem(scannerInbox)                      // the scan_request Argus is holding
        const sent = emitArtifact(makeArtifact({
            kind:  KIND.CANDIDATE_LIST,
            items: [{
                ticker:    pick.ticker,
                direction: pick.direction === 'short' ? 'short' : 'long',
                thesis:    pick.thesis ?? null,
                analysis:  pick.analysis ?? pick.thesis ?? null,
                recommended_mode: pick.recommended_mode ?? null,   // Argus's lens suggestion → pre-fills the chip
            }],
            context: { style: request?.style ?? null },            // the sender's own horizon (authoritative)
            from:    { agent: 'scanner', label: 'Scan' },
        }), { fromTab: 'scanner', ...opts })
        if (!sent) return
        // Retiring the SENDER, which is not part of the hop: Argus is done, and leaving it mounted
        // means coming back later to a stale pick and its chat. The receiver's mount policy is the
        // conveyor's business; this is ours.
        setScannerSeed(null)
        setScannerResetKey(k => k + 1)
    }
    // Dismiss the hand-off → back to Axl. Shut the doors NOW rather than leaving it to the walk
    // home: the departure beat is RETURN_MS long, and the artifact is refused as of this click.
    function handleCancelHandoff() {
        doors.clear()
        handleBackToAxl()
    }

    // Scan candidate → idea: carries the scanner's intended direction.
    // K3: a scan-list candidate is a Kairos SEED — same path as the Argus hand-off (point 6). Routes to
    // the Kairos chat with the candidate's ticker + read (+ Argus's recommended lens if the scan carried one).
    // Argus INVESTING candidate → the Analyst for research (a coverage thesis), not a Kairos trade.
    // ONE name off a list → the RESEARCH desk, which is exactly its job: a coverage thesis on a
    // company. Distinct from sending a whole sleeve, which is portfolio work — the user who clicked
    // a single ticker asked about that company, not to start building a book around it.
    function handleResearchCandidate(candidate, scan) {
        if (!candidate?.ticker) return
        const artifact = makeArtifact({
            kind:  KIND.CANDIDATE_LIST,
            items: [{
                ticker:   candidate.ticker,
                thesis:   candidate.thesis ?? null,
                analysis: candidate.analysis ?? candidate.thesis ?? null,
            }],
            // Not `queued`: one name the user picked is not a run, and telling Prometheus otherwise
            // puts it in run mode with a queue of one.
            context: { sector: scan?.thesis ?? null },   // the sleeve/mandate label frames the read
            ref:     scan?.id ? { entityKind: 'scan', id: scan.id } : null,
            from:    { agent: 'scanner', label: 'Screen' },
        })
        if (!enterPipelineAt('research', 'analyst', artifact)) {
            setAnalystInbox(artifact)          // the desk changed shape — still open it, unframed
            setActiveTab('analyst')
        }
    }

    /**
     * Argus investing list → Prometheus, as a SLEEVE rather than a name. The top slice is queued;
     * the rest ride along so "also do KLAC" works without walking back to the saved card.
     *
     * A `candidate_list` leaving
     * Argus means Kairos on the trade desk and Prometheus on the portfolio desk — the artifact cannot
     * say which, because the difference is not in the names but in what they are FOR. Routing it
     * would misroute an investing candidate clicked while the trade desk happens to be open, and
     * "the desk I am standing on" is the wrong answer when the user came from a saved list.
     *
     * So it ENTERS the portfolio pipeline at its Research step instead — the intent is in the button
     * they pressed, and entering is what expresses it. Skipping Mandate and Screen is the point: the
     * names already exist. Atlas is not cut out — the user can walk BACK to the mandate, and
     * Prometheus hands the coverage forward to it at the end either way (handleSleeveResearched).
     */
    function handleResearchList(scan) {
        const names = (scan?.candidates ?? []).map(c => c?.ticker).filter(Boolean)
        if (!names.length) return
        const queue = names.slice(0, RESEARCH_TOP_N)
        // A single list is a one-sleeve run as far as the hand-off back is concerned: no unfilled
        // sleeves, but the queue still has to be recorded or a declined draft goes unmentioned.
        sleeveOutcomeRef.current = { unfilled: [], bySector: [{ sector: scan?.thesis ?? null, names: queue }], queue }
        const artifact = makeArtifact({
            kind:  KIND.CANDIDATE_LIST,
            // The QUEUE is the payload — what Prometheus is being asked to research. Everything else
            // Argus surfaced rides in `pool`, which is what "also do KLAC" reads from.
            items: queue.map(ticker => ({ ticker })),
            context: {
                queued: true,                        // a run: Prometheus paces itself through it
                pool:   names,
                sector: scan?.thesis ?? null,        // the sleeve label, as context for the research
            },
            ref:  scan?.id ? { entityKind: 'scan', id: scan.id } : null,
            from: { agent: 'scanner', label: 'Screen' },
        })
        if (!enterPipelineAt('portfolio', 'analyst', artifact)) {
            setAnalystInbox(artifact)          // the desk changed shape — still open it, unframed
            setActiveTab('analyst')
        }
    }

    /**
     * Prometheus → Atlas, once the run has coverage. Atlas reads coverage itself (get_coverage), so
     * the names here are a nudge, not the payload — what this restores is the user, who otherwise
     * had no way back and had to re-enter through Axl, which resets the mandate conversation.
     *
     * It also carries what did NOT come back. A sleeve that screened empty was filtered out of
     * `bySector`, and a name whose draft the user declined was simply absent from `done` — so Atlas
     * saw a shorter coverage list and no reason for it, and built a book quietly missing a sleeve its
     * own architecture had called for. An unfilled sleeve is a decision (widen it, drop it,
     * reallocate its weight), and a decision it cannot make without being told.
     */
    function handleSleeveResearched(names = []) {
        const covered  = names.filter(Boolean)
        const outcome  = sleeveOutcomeRef.current
        const inSleeve = (t) => outcome.bySector.find(s => s.names.includes(t))?.sector ?? null
        // Each name paired with the sleeve it was researched FOR, so Atlas can place it without
        // inferring the mapping from the ticker. The WORDS are Atlas's own business now
        // (portfolio.contract.js) — this says what came back, not how to say it.
        const withSleeve = (list) => list.map(ticker => ({ ticker, sector: inSleeve(ticker) }))
        const declined   = outcome.queue.filter(t => !covered.includes(t))

        const artifact = makeArtifact({
            kind:  KIND.COVERAGE_SET,
            items: withSleeve(covered),
            // A run that came back short is PARTIAL, not filled — the shortfall is the decision
            // Atlas has to make (widen, drop, reallocate), and it cannot make it unasked.
            status: (outcome.unfilled.length || declined.length)
                ? (covered.length ? STATUS.PARTIAL : STATUS.EMPTY)
                : STATUS.FILLED,
            context: { unfilled: outcome.unfilled, declined: withSleeve(declined) },
            note:    outcome.unfilled.length ? `unfilled sleeves: ${outcome.unfilled.join(', ')}` : null,
            from:    { agent: 'analyst', label: 'Research' },
        })

        sleeveOutcomeRef.current = { unfilled: [], bySector: [], queue: [] }
        // Enters at ALLOCATE — the step that awaits a coverage set. Atlas also stands at Mandate,
        // and landing a finished run there would hand a book to the desk meant to frame it.
        if (!enterPipelineAt('portfolio', 'portfolio', artifact)) {
            setPortfolioSeed({ key: artifact.key, message: contractFor('portfolio').brief(artifact).message })
            setActiveTab('portfolio')
        }
    }

    function handleBuildFromCandidate(candidate, scan) {
        if (!candidate?.ticker) return
        // Investing lists produce RESEARCH candidates → route to the Analyst; trading → Mentor.
        if (scan?.profile === 'investing' || scan?.destination === 'analyst') return handleResearchCandidate(candidate, scan)
        // A forward-dated list is period-scoped (main category = period). Carry that period as the
        // setup's scheduled window so Talos gates monitoring to it (no watching before it opens).
        const p = scan?.period
        const window = (p && (p.start || p.end)) ? { from: p.start ?? null, to: p.end ?? null } : null
        // The same artifact Argus hands back mid-pipeline, from a saved list instead of a live pick —
        // so the trading desk has one inbox, not one per place a name can come from. Delivered
        // straight rather than routed: the Lists surface stands outside every pipeline, so there is
        // no chain to walk. Went to Kairos until it was archived (2026-08-18); Mentor reads the same
        // artifact, because the live Argus → Mentor hand-off already hands it this shape.
        setMentorInbox(makeArtifact({
            kind:  KIND.CANDIDATE_LIST,
            items: [{
                ticker:    candidate.ticker,
                direction: candidate.direction === 'short' ? 'short' : 'long',
                thesis:    candidate.thesis ?? null,
                analysis:  candidate.analysis ?? candidate.thesis ?? null,
                recommended_mode: candidate.recommended_mode ?? null,
            }],
            // A forward-dated list is period-scoped; the window gates the setup's monitoring.
            context: { style: scan?.style ?? null, window },
            ref:     scan?.id ? { entityKind: 'scan', id: scan.id } : null,
            from:    { agent: 'scanner', label: 'Scan' },
        }))
        setActiveTab('mentor')
    }

    // Earnings ticker → MENTOR: a scheduled print is a date with a ticker attached and no bias,
    // which is a setup (zones + a window), not an idea's condition tree. Each row carries its own
    // report date (the list spans the trading week).
    function handleBuildFromEarning(earning) {
        if (!earning?.symbol) return
        seedMentorChat(earning.symbol, buildEarningSeed(earning, earning.date))
    }

    // IPO ticker → MENTOR: same shape — the listing is the date, direction stays open.
    function handleBuildFromIpo(ipoItem) {
        if (!ipoItem?.symbol) return
        seedMentorChat(ipoItem.symbol, buildIpoSeed(ipoItem))
    }

    // A finished list from the scanner panel. It is SAVED to the Scans tab only when the user asked
    // for it themselves: a scan Argus ran on another desk's brief — an Atlas sleeve mandate, a
    // Kairos discovery request — is mid-pipeline traffic, not a record anyone keeps. Screening three
    // sleeves for one book used to leave three sector lists among the user's saved lists.
    //
    // Only the saved card stops. The names travel exactly as before: the sleeve run below reads the
    // emitted `scan`, never the stored doc.
    async function handleGenerateList(scan, threadId = null) {
        const keeps = savesToScansList(scanOrigin({
            sleeveRunActive: sleeveRunRef.current.active,
            handoffActive:   scannerInbox?.kind === KIND.SCAN_REQUEST,
        }))
        const saved = keeps ? await createScan(scan) : null
        // createScan swallows its error and answers null — for a list the user means to keep, that
        // is the difference between filed and vanished, so say it rather than move on quietly.
        if (keeps && !saved) console.error('[scans] list did not save', scan?.thesis ?? scan?.sector ?? '(unnamed)')
        if (saved) {
            setNewsTab('scans')
            // Link the construction draft thread to the created scan (clears its TTL). A
            // mid-pipeline screening has no scan to link to, so its draft TTL-expires unpinned —
            // the deliberate default until a run carries its threads to the artifact it produces
            // (docs/pipeline-service-design.md §8).
            // AWAITED, not fired and forgotten: finishPipeline below deletes this desk's remaining
            // DRAFTS, and until this link lands, this thread is still one of them. Losing that race
            // would delete the conversation that built the list, and the link would then update a
            // document that no longer exists — silently, since a no-match is not an error.
            if (threadId && saved.id) {
                await threadsService.linkThread(threadId, { subjectType: 'scan', subjectId: saved.id, artifactName: scan?.thesis ?? null })
            }
        }

        // Mid-SLEEVE-RUN: this sector is done. Take its top names, then either screen the next sector
        // or — once the last one lands — send everything to Prometheus as ONE queue. The user is not
        // asked anything between sectors; being asked N times is the friction this replaced.
        const run = sleeveRunRef.current
        if (scan?.profile === 'investing' && run.active) {
            const names = (scan.candidates ?? []).map(c => c?.ticker).filter(Boolean)
            run.sectors.push({ sector: scan.thesis || scan.sector || sleeveLabel(run.current), names })
            _advanceSleeveRun()
            return
        }

        // Is this list the end of the road, or is a desk still waiting for it? A finished artifact
        // belongs back at the hub; a mid-pipeline one must not be walked away from — that threw the
        // user out one beat before the hand-off could be offered, which is the whole reason the list
        // exists. Asked of the PIPELINE rather than the profile: "investing" happened to mean
        // mid-pipeline only because Atlas was the only desk with a further step, and the trade desk
        // (a trading list, with Kairos still waiting) proved that wrong.
        const steps = stepsOf(activePipeline)
        if (!hasDownstream(steps, resolveStepIndex(steps, 'scanner', pipelineStep))) {
            // FINISHED only if something was actually produced. createScan swallows its error and
            // answers null, and a run that saved nothing has its conversation as the only copy of the
            // work — ending the desk there would delete it. That is walking away, not finishing.
            if (saved) finishPipeline()
            else handleBackToAxl()
        }
    }

    // Every sector screened -> the top of EACH sleeve pools into one Prometheus queue. Built from the
    // per-sector record, so a three-sector run hands over three sectors' names and the Analyst knows
    // which sleeve each name is for.
    function _researchSurvivors(sectors = []) {
        // Dedupe ACROSS sleeves before the top-N cut: overlapping ponds (a semis sleeve and a broad
        // technology one) can surface the same name twice, and researching it twice costs the user
        // a full coverage cycle to land on a 409. First sleeve to claim a name keeps it — and the
        // cut runs after, so the second sleeve still gets its own four.
        const claimed = new Set()
        const bySector = sectors
            .map(sec => {
                const fresh = sec.names.filter(t => !claimed.has(t))
                fresh.forEach(t => claimed.add(t))
                return { sector: sec.sector, names: fresh.slice(0, RESEARCH_TOP_N) }
            })
            .filter(sec => sec.names.length)
        const queue = bySector.flatMap(sec => sec.names)
        const pool  = sectors.flatMap(sec => sec.names)
        // Sleeves that screened to nothing — skipped mid-run, or a list whose candidates carried no
        // ticker. Held for the hand-off back so Atlas is told a bucket is empty rather than left to
        // notice (it doesn't) that a sector it planned for has no names under it.
        const unfilled = sectors.filter(sec => !sec.names.length).map(sec => sec.sector)
        sleeveOutcomeRef.current = { unfilled, bySector, queue }

        // A run that screened every sleeve and produced nobody is a RESULT, not a non-event. Falling
        // through to the hub looked identical to the pipeline breaking, which is how it read.
        //
        // It goes back as the SAME artifact a successful run does, empty: from Atlas's side the
        // question is "what came back with a thesis", and "nothing, and here is which sleeves" is an
        // answer to it. One inbox, one brief, one voice — rather than a second hand-written message
        // for the unhappy path, which is exactly where wording drifts.
        if (!queue.length) {
            sleeveOutcomeRef.current = { unfilled: [], bySector: [], queue: [] }
            const nothing = makeArtifact({
                kind:    KIND.COVERAGE_SET,
                items:   [],
                status:  STATUS.EMPTY,
                context: { unfilled, declined: [] },
                note:    'every sleeve screened empty',
                from:    { agent: 'scanner', label: 'Screen' },
            })
            if (!enterPipelineAt('portfolio', 'portfolio', nothing)) {
                setPortfolioSeed({ key: nothing.key, message: contractFor('portfolio').brief(nothing).message })
                setActiveTab('portfolio')
            }
            return
        }
        // Set directly rather than routed: this is the tail of the sleeve RUN, whose fan-out and
        // join the conveyor does not own yet (phase 4). Same artifact shape as the routed hops, so
        // Prometheus has one inbox however the names reached it.
        setAnalystInbox(makeArtifact({
            kind:  KIND.CANDIDATE_LIST,
            items: queue.map(ticker => ({ ticker })),
            context: {
                queued: true,
                pool,                    // everything screened — "also do KLAC" reads from this
                bySector,                // which sleeve each name is being researched FOR
                sector: bySector.length === 1 ? bySector[0].sector : null,
            },
            from: { agent: 'scanner', label: 'Screen' },
        }))
        setActiveTab('analyst')
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
        // Same rule as handleGenerateList: a list with a desk still waiting on it is mid-pipeline
        // whether it was just built or just refined, so leaving for the hub pre-empts the hand-off.
        // And likewise, an update that did not save is not a finished run — it goes home unspent.
        const steps = stepsOf(activePipeline)
        if (!hasDownstream(steps, resolveStepIndex(steps, 'scanner', pipelineStep))) {
            if (saved) finishPipeline()
            else handleBackToAxl()
        }
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
    /**
     * Resume a thread on a NAMED tab.
     *
     * Named rather than read from `activeTab`, because arriving at a desk and resuming its conversation
     * happen in the same tick: the closure still holds the tab the user was on, so dispatching by state
     * would resume on the desk they just left.
     */
    function _resumeThreadOn(tab, threadId) {
        if (!threadId) return undefined
        const desk = resumeRefs.current[tab]
        if (desk) return desk.current?.(threadId)
        return handleResumeIdeaThread(threadId)
    }

    function handleResumeActiveThread(threadId) {
        return _resumeThreadOn(activeTab, threadId)
    }

    // Shared by the desktop workspace chat and the mobile chat sheet so the two
    // instances never drift. The mobile sheet overrides onGenerate to also close.
    const chatPanelProps = {
        messages,
        analysisState,
        onSend:              handleSend,
        onGenerate:          handleGenerate,
        onClear:             handleCancelBuild,
        onStop:              chat.handleStop,
        canResume:           chat.canResume,
        onResume:            _continueIdea,
        isLoading,
        streamStatus,
        reasoningPulse,
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

    // The pad is built here, beside the agent panels, and shown by the same display switch they
    // use. Always MOUNTED: a half-typed ticket (or a resting order it is tracking) survives a trip
    // back to the hub, the way every desk's thread does.
    const ticketPad = (
        <TradeTicket
            accounts={availableAccounts}
            selectedAccounts={selectedAccounts}
            onSelectAccounts={setSelectedAccounts}
            mainAccountId={mainAccountId}
            onMainChange={setMainAccountId}
            ticket={ticketIdea}
            positions={positions}
            busy={ticketBusy}
            error={ticketError}
            onPlace={handleTicketPlace}
            onAttachExits={handleTicketAttachExits}
            onCancelResting={handleTicketCancelResting}
            onClosePosition={handleTicketClose}
            onReset={handleTicketReset}
        />
    )

    return (
        <>
            <main>
                {/* ── Desktop / tablet workspace ── */}
                <div className="workspace">
                    {/* Floor trial (Ctrl+Shift+D): the book + calendar take a left column. The chat
                        and the right column are unchanged below — only the side columns are added,
                        so the trial can't regress the live layout by rearranging it. */}
                    {floorMode && (
                        <div className="workspace__left">
                            {/* The book's own close handlers — the SAME two the Positions tab uses,
                                so a close fired from the Floor is the close fired from anywhere.
                                They were deliberately withheld once, on the grounds that closing
                                lived in the Positions tab; the Floor replaced that tab, which left
                                the ✕ reachable only through a pop-out window. */}
                            <FloorLeft
                                positions={positions}
                                ideas={ideas}
                                positionsLoading={positionsLoading}
                                onOpenPosition={handleOpenPositionFromFloor}
                                onClosePosition={closePosition}
                                onClosePositions={closePositions}
                                earnings={earnings}
                                fed={fed}
                                ipo={ipo}
                                tilt={tilt}
                                calendarLoading={earningsLoading || fedLoading || ipoLoading}
                                onEarningSelect={handleBuildFromEarning}
                                onIpoSelect={handleBuildFromIpo}
                            />
                        </div>
                    )}
                    <div className="workspace__chat">
                        {activeTab === 'axl' ? (
                            <AxlHub
                                user={user}
                                onPick={handleAxlPick}
                                onOpenTicket={handleOpenTicket}
                                briefRequest={briefRequest}
                                onBriefStart={() => setBriefRequest(0)}
                            />
                        ) : (
                            <div className="chat-agentbar">
                                {/* Inside a pipeline the arrow goes bare: the desk path beside it is
                                    already carrying the words, and "axl" next to it read as a step. */}
                                <button
                                    className={`chat-agentbar__back${activePipeline ? ' chat-agentbar__back--bare' : ''}`}
                                    onClick={handleBackToAxl}
                                    aria-label="Back to axl"
                                    title="Back to axl"
                                >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="M20 12H6" /><path d="M12 5l-7 7 7 7" />
                                    </svg>
                                    {!activePipeline && 'axl'}
                                </button>
                                {backStep && (
                                    <button
                                        className="chat-agentbar__back chat-agentbar__back--step"
                                        onClick={handleStepBack}
                                        aria-label={`Back to ${backStep.label}`}
                                        title={`Back to ${backStep.label}`}
                                    >
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <path d="M15 18l-6-6 6-6" />
                                        </svg>
                                        {backStep.label}
                                    </button>
                                )}
                                <PipelineCrumb pipeline={activePipeline} activeTab={activeTab} step={pipelineStep} />

                                <div className="chat-agentbar__right">
                                    {/* How the desk hands its work on. Manual stops at each step so the
                                        user can read it and keep chatting before sending it forward;
                                        auto walks the chain on its own. Shown only inside a pipeline —
                                        off a desk there is no chain to advance. Arming and order
                                        confirmation are gated steps and stay manual in both modes.
                                        Sits with the account / history controls rather than beside the
                                        stepper: it is a setting, and next to the path it read as a step. */}
                                    {activePipeline && (
                                        <button
                                            type="button"
                                            className={`chat-agentbar__mode${pipelineMode === 'auto' ? ' is-auto' : ''}`}
                                            onClick={() => setPipelineMode(m => (m === 'auto' ? 'manual' : 'auto'))}
                                            aria-pressed={pipelineMode === 'auto'}
                                            title={pipelineMode === 'auto'
                                                ? 'Auto: each desk hands its work straight to the next'
                                                : 'Manual: you send the work on when you are ready'}
                                        >
                                            {pipelineMode === 'auto' ? 'auto' : 'manual'}
                                        </button>
                                    )}
                                    {/* (Trading by hand is picked in the hub, beside the desks — the pad
                                        is its own tab, so no strip toggle is needed here. The account
                                        selector below stays off it: the pad carries its own.) */}
                                    {(activeTab === 'idea' || activeTab === 'portfolio' || activeTab === 'kairos' || activeTab === 'mentor') && (
                                        <AccountSelector
                                            accounts={availableAccounts}
                                            selectedIds={selectedAccounts}
                                            onChange={setSelectedAccounts}
                                            mainAccountId={mainAccountId}
                                            onMainChange={setMainAccountId}
                                        />
                                    )}
                                    <ThreadHistory agent={activeTab} onResume={handleResumeActiveThread} busy={Boolean(deskBusy[activeTab])} />
                                </div>
                            </div>
                        )}
                        <div className="chat-tabs__panel" style={{ display: activeTab === 'idea' ? 'flex' : 'none' }}>
                            <ChatPanel {...chatPanelProps} />
                        </div>
                        <div className="chat-tabs__panel" style={{ display: activeTab === 'scanner' ? 'flex' : 'none' }}>
                            <ScannerPanel
                                key={`scanner-${chatResetKey}-${scannerResetKey}`}
                                resumeRef={resumeRefs.current.scanner}
                                pipeline={activePipeline}
                                onTickerSelect={handleScannerSymbol}
                                onGenerateList={handleGenerateList}
                                onUpdateList={handleUpdateList}
                                onResearchList={handleResearchList}
                                onResearchLater={handleBackToAxl}
                                // Mid sleeve-run Argus saves each sector itself — nobody is waiting
                                // to press between sectors. The panel also shows where the run is
                                // and offers the skip when a sector comes back with no list.
                                sleeveRun={sleeveRun}
                                onSkipSleeve={handleSkipSleeve}
                                onLoadingChange={deskLoadingSetters.scanner}
                                {...deskProps('scanner')}
                                handoff={scannerSingle}
                                handoffTo={scannerHandoffTo}
                                autoHandoff={autoHandoff}
                                onSendPick={handleSendPick}
                                onDismissHandoff={handleCancelHandoff}
                            />
                        </div>
                        <div className="chat-tabs__panel" style={{ display: activeTab === 'portfolio' ? 'flex' : 'none' }}>
                            <PortfolioPanel
                                key={`portfolio-${chatResetKey}`}
                                resumeRef={resumeRefs.current.portfolio}
                                onGeneratePlan={handleGeneratePlan}
                                onUpdatePlan={handleUpdatePlan}
                                onPortfolioUpdate={handlePortfolioUpdate}
                                onBuildingPlanChange={setBuildingPortfolio}
                                onLoadingChange={deskLoadingSetters.portfolio}
                                onReviewResolved={handleBackToAxl}
                                onAcceptReview={handleAcceptReview}
                                onSourceInArgus={handleSourceInArgus}
                                {...deskProps('portfolio')}
                                availableAccounts={availableAccounts}
                                selectedAccounts={selectedAccounts}
                                onAccountsChange={setSelectedAccounts}
                                mainAccountId={mainAccountId}
                                onMainAccountChange={setMainAccountId}
                                adoptDraft={adoptDraft}
                            />
                            {adoptDraft && (
                                <AdoptBookGrid
                                    draft={adoptDraft}
                                    onDraftChange={setAdoptDraft}
                                    onAdopted={({ portfolioId, legs }) => {
                                        setAdoptDraft(null)
                                        showSuccessMsg(`Adopted ${legs} holding${legs === 1 ? '' : 's'}`)
                                        // Straight into the book that now exists, rather than back to a
                                        // blank desk: the next thing to do is look at what was adopted.
                                        loadIdeas().then(() => handleEditPortfolio(portfolioId)).catch(() => {})
                                    }}
                                    onCancel={() => setAdoptDraft(null)}
                                />
                            )}
                        </div>

                        {/* Trade by hand — a panel of its own, not a mode of a desk's chat: it is
                            reached from the hub, and it belongs to no pipeline. */}
                        <div className="chat-tabs__panel" style={{ display: activeTab === 'ticket' ? 'flex' : 'none' }}>
                            <div className="portfolio-panel">{ticketPad}</div>
                        </div>

                        <div className="chat-tabs__panel" style={{ display: activeTab === 'mentor' ? 'flex' : 'none' }}>
                            <MentorPanel
                                onLoadingChange={deskLoadingSetters.mentor}
                                pipeline={activePipeline}
                                onGenerated={finishPipeline}
                                {...deskProps('mentor')}
                                resumeRef={resumeRefs.current.mentor}
                                editingSetupId={editingSetupId}
                                onEditDone={handleSetupEditDone}
                                availableAccounts={availableAccounts}
                                selectedAccounts={selectedAccounts}
                                mainAccountId={mainAccountId}
                            />
                        </div>

                        <div className="chat-tabs__panel" style={{ display: activeTab === 'analyst' ? 'flex' : 'none' }}>
                            <AnalystPanel
                                onLoadingChange={deskLoadingSetters.analyst}
                                {...deskProps('analyst')}
                                editCoverage={analystEditCoverage}
                                coverage={coverage}
                                pipeline={activePipeline}
                                resumeRef={resumeRefs.current.analyst}
                                onSleeveResearched={handleSleeveResearched}
                                // Leaving for Axl after a save is right for a ONE-name research run.
                                // During a SLEEVE it would throw the user out between names, and on
                                // the last one it would pre-empt the hand-back to Atlas entirely.
                                onInitiated={(_saved, { sleeve } = {}) => {
                                    setNewsTab('coverage')
                                    if (!sleeve) handleBackToAxl()
                                }}
                            />
                        </div>

                        <div className="chat-tabs__panel" style={{ display: activeTab === 'strategy' ? 'flex' : 'none' }}>
                            <StrategyPanel
                                onLoadingChange={deskLoadingSetters.strategy}
                                currentTilt={tilt}
                                pipeline={activePipeline}
                                resumeRef={resumeRefs.current.strategy}
                                reviewRequest={reviewRequest}
                                onReviewStart={() => setReviewRequest(r => ({ n: 0, reason: r.reason }))}
                                // Publishing supersedes the standing view, so send the user to the
                                // board that now shows it — the same beat as a coverage initiate.
                                onPublished={() => { setNewsTab('forecasts'); handleBackToAxl() }}
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
                    {floorMode ? (
                        <div className="workspace__right">
                            {/* The Floor's row actions run the SAME handlers as the ideas table —
                                it's a second surface onto the same entities, not a second set of
                                rules about them, so delete confirms, live-position locks and the
                                chat restores all come along — the setup pencil included (onEditSetup
                                below, the same handler the Lists tab's SetupCard runs). */}
                            {(
                                <FloorLists
                                    setups={inWorkspace(setups, workspace)}
                                    ideas={inWorkspace(ideas, workspace).filter(i => i.status !== 'closed')}
                                    positions={positions}
                                    scans={scans}
                                    coverage={coverage}
                                    queued={queued}
                                    onExecuteQueued={handleExecuteQueued}
                                    onCancelQueued={handleCancelQueued}
                                    queuedBusyId={queuedBusyId}
                                    deskRequest={deskRequest}
                                    onCandidateSelect={handleBuildFromCandidate}
                                    onEditSetup={handleEditSetup}
                                    onDeleteSetup={handleDeleteSetup}
                                    onEditPortfolio={handleEditPortfolio}
                                    onDeletePortfolio={handleDeletePortfolio}
                                    onActivatePortfolio={handleActivatePortfolio}
                                    onDeleteIdea={handleDeleteIdea}
                                    onEditScan={handleEditScan}
                                    onDeleteScan={deleteScan}
                                    onEditCoverage={handleEditCoverage}
                                    onRetireCoverage={handleRetireCoverage}
                                    onDeleteCoverage={handleDeleteCoverage}
                                />
                            )}
                        </div>
                    ) : (
                    <div className="workspace__ideas">
                        <TradeIdeasList
                            ideas={inWorkspace(ideas, workspace).filter(i => i.status !== 'closed')}
                            chatTab={activeTab}
                            buildingIdea={buildingIdeaRow}
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
                            onClosePositions={closePositions}
                            setups={inWorkspace(setups, workspace)}
                            setupsLoading={setupsLoading}
                            onArmSetup={handleArmSetup}
                            onDisarmSetup={handleDisarmSetup}
                            onDeleteSetup={handleDeleteSetup}
                            onEditSetup={handleEditSetup}
                            setupBusyId={setupBusyId}
                            radar={{
                                tab:               newsTab,
                                onTabChange:       setNewsTab,
                                scans,
                                scansLoading,
                                onCandidateSelect: handleBuildFromCandidate,
                                onDeleteScan:      deleteScan,
                                onEditScan:        handleEditScan,
                                coverage,
                                coverageLoading,
                                tilt,
                                tiltLoading,
                                onEditCoverage:    handleEditCoverage,
                                onRetireCoverage:  handleRetireCoverage,
                                onDeleteCoverage:  handleDeleteCoverage,
                                earnings,
                                earningsFrom,
                                earningsTo,
                                earningsLoading,
                                onEarningSelect:   handleBuildFromEarning,
                                fed,
                                fedLoading,
                                ipo,
                                ipoLoading,
                                onIpoSelect:       handleBuildFromIpo,
                            }}
                        />
                    </div>
                    )}
                </div>

                {/* ── Mobile ──
                    No separate mobile surface: the workspace above collapses to its chat column
                    (RootCmp.scss, < 768px), so a phone gets the header and the live desks. The
                    monitor dashboard + chat FAB/sheet that used to stand in here are gone — the
                    sheet opened the archived idea chat, which can no longer send. */}
            </main>

            {confirmIdea && confirmOrders.length > 0 && (
                <OrderConfirmDialog
                    idea={confirmIdea}
                    orders={confirmOrders}
                    levels={confirmLevels}
                    placing={placingOrders}
                    onConfirm={handleConfirmOrders}
                    onDismiss={handleDismissConfirm}
                    onReset={handleResetWindow}
                />
            )}

            {/* Same dialog, driven by a Talos-triggered setup's stamped order plan. */}
            {confirmSetup && confirmSetupOrders.length > 0 && (
                <OrderConfirmDialog
                    idea={confirmSetup}
                    orders={confirmSetupOrders}
                    levels={confirmSetupLevels}
                    placing={placingOrders}
                    onConfirm={handleConfirmSetupOrders}
                    onDismiss={handleDismissSetupConfirm}
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

            {/* A queued trim/exit/scale-in. An ENTRY never gets here — it routes to the
                OrderConfirmDialog above, which is where an entry has always been confirmed. */}
            {queuedConfirm && (
                <QueuedActionDialog
                    row={queuedConfirm}
                    running={queuedBusyId === queuedConfirm.id}
                    error={queuedError}
                    onConfirm={handleConfirmQueued}
                    onCancel={() => { if (!queuedBusyId) { setQueuedConfirm(null); setQueuedError(null) } }}
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

    // A holding is a portfolio_item, so the vocabulary is `_item`. The `_idea` spelling was carried
    // as an alias through the rename and dropped 2026-08-19 — see the note in the apply path above.
    function describe(change) {
        const id   = change.itemId
        const spec = change.item
        switch (change.action) {
            case 'exit_item':   return `Exit ${assetOf(id)}${change.reason ? ` — ${change.reason}` : ''}`
            case 'trim_item':   return `Trim ${assetOf(id)} by ${pct(change.reduceFraction)}${change.targetAllocationRatio != null ? ` → target ${pct(change.targetAllocationRatio)}` : ''}`
            case 'add_to_item': return `Add to ${assetOf(id)}: +${pct(change.addFraction)}${change.targetAllocationRatio != null ? ` → target ${pct(change.targetAllocationRatio)}` : ''}`
            case 'add_item':    return `Add ${spec?.asset ?? '?'} (${spec?.direction ?? 'long'}${spec?.allocationRatio != null ? `, target ${pct(spec.allocationRatio)}` : ''})`
            case 'update_item': return `Update ${assetOf(id)}: ${Object.keys(change.patch ?? {}).join(', ') || 'fields'}`
            case 'remove_item': return `Remove ${assetOf(id)} (pending)`
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
