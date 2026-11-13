import { useState, useRef, useEffect, useCallback, useMemo } from 'react'

import { ChatTimeline }      from '../cmps/ChatTimeline/ChatTimeline.jsx'
import { openChart, closeChart, currentChart } from '../services/chartSurface.service.js'
import { DESKS } from '../cmps/AxlHub/agentMeta.jsx'
import { queuedAnything } from '../cmps/PortfolioPanel/reviewApply.js'
import { QueuedActionDialog } from '../cmps/Floor/QueuedActionDialog.jsx'
import { executeRoute } from '../cmps/Floor/queuedAction.contract.js'
import { pendingActionService } from '../services/pendingAction/pendingAction.service.remote.js'
import { MentorSurface }     from '../cmps/MentorSurface/MentorSurface.jsx'
import { PortfolioSurface }  from '../cmps/PortfolioSurface/PortfolioSurface.jsx'
import { ScannerSurface }    from '../cmps/ScannerSurface/ScannerSurface.jsx'
import { AnalystSurface }    from '../cmps/AnalystSurface/AnalystSurface.jsx'
import { handoffTurn, mentorHolding } from '../cmps/MentorSurface/mentorSurface.utils.js'
import { hotlistHandoff } from '../cmps/Floor/hotlist.utils.js'
import { SidePane }          from '../cmps/SidePane/SidePane.jsx'
import { openSurface, resetSidePane } from '../cmps/SidePane/sidePane.store.js'
import { SessionContext }    from '../context/SessionContext.jsx'
import { useSession }        from '../customHooks/useSession.js'
import { agentMeta }         from '../cmps/ChatTimeline/timelineRows.js'
import { StrategyPanel }     from '../cmps/StrategyPanel/StrategyPanel.jsx'
import { AetherPanel }       from '../cmps/AetherPanel/AetherPanel.jsx'
import { TradeIdeasList }    from '../cmps/TradeIdeas/TradeIdeasList.jsx'
import { FloorInfo }         from '../cmps/Floor/FloorInfo.jsx'
import { FloorLists }        from '../cmps/Floor/FloorLists.jsx'
import { analystService, COVERAGE_CHANGED } from '../services/analyst/analyst.service.remote.js'
import { OrderConfirmDialog } from '../cmps/TradeIdeas/OrderConfirmDialog.jsx'
import { PreEntryDialog }     from '../cmps/TradeIdeas/PreEntryDialog.jsx'
import { DeleteIdeaDialog }   from '../cmps/TradeIdeas/DeleteIdeaDialog.jsx'
import { activatePortfolio, isManualIdea, buildOrderPreview, orderTypeLabel, isDeleteConfirmRequired, ideaWorkspace, inWorkspace, positionOpenTarget, openIdeaPopup, openSetupPopup, matchPositionsForIdea, isPortfolioReview } from '../cmps/TradeIdeas/tradeIdea.utils.js'
import { TradeTicket } from '../cmps/TradeTicket/TradeTicket.jsx'
import { apiError } from '../services/http.service.js'
import { tradeIdeasService } from '../services/tradeIdeas/tradeIdeas.service.remote.js'
import { portfolioService }  from '../services/portfolio/portfolio.service.remote.js'
import { resolveEntity, resolveForEdit } from '../services/entityResolve.js'
import { showErrorMsg, showSuccessMsg, showUserMsg, eventBus, PORTFOLIO_REVIEW, MANUAL_FILLED, MANUAL_PORTFOLIO_ACTIVATE, MANUAL_PORTFOLIO_EXIT, ENTRY_CONFIRM_OPEN, ENTRY_CONFIRM_DISMISS, SETUP_CONFIRM_OPEN, SETUP_INVALIDATION_EDIT, OPEN_COVERAGE, OPEN_SECTOR_VIEW, MARKET_BRIEF_OPEN, OPEN_QUEUED_LIST, RESUME_BUILD, SETUP_SHARED_OPEN, ENTITY_DETAIL_OPEN } from '../services/event-bus.service'
import { manualService } from '../services/manual/manual.service.remote.js'
import { mentorService } from '../services/mentor/mentor.service.remote.js'
import { isSetupAwaitingConfirm } from '../cmps/TradeIdeas/setupStatus.js'
import { pickConfirmIdea, pickConfirmSetup } from '../cmps/TradeIdeas/confirmTarget.js'
import { redrawAsk } from '../cmps/MentorPanel/redrawAsk.js'
import { sharedAsk } from '../cmps/MentorPanel/sharedAsk.js'
import { listenForPopupEvents } from '../services/popupBridge.js'
import { useCalendarEvents } from '../customHooks/useCalendarEvents.js'
import { useBrokerAccounts } from '../customHooks/useBrokerAccounts.js'
import { useWorkspaceMode }  from '../customHooks/useWorkspaceMode.js'
import { usePositions }      from '../customHooks/usePositions.js'
import { useTradeIdeas }     from '../customHooks/useTradeIdeas.js'
import { useEntityList } from '../customHooks/useEntityList.js'
import { useDesign }         from '../customHooks/useDesign.js'
import { useSetups }         from '../customHooks/useSetups.js'
import { useAetherCandidates } from '../customHooks/useAetherCandidates.js'
import { deriveIdeaOverlay, deriveSetupOverlay } from '../cmps/TradeIdeas/chartOverlay.js'
import { useAuth }           from '../context/AuthContext.jsx'
import { coverageRoute }     from './coverageRoute.js'
import { isHandheld }        from '../cmps/EntityCard/entityPopup.js'
import { DetailPanelSlot }   from '../cmps/DetailPanel/DetailPanel.jsx'
import { closePanel }        from '../cmps/DetailPanel/detailPanel.store.js'
import { OwnedSymbolsProvider } from '../cmps/OwnedBadge/OwnedBadge.jsx'
import { ownedSymbols }      from '../services/ownedSymbols.js'

// Axl's `<show>` kinds for the Floor's lists (the user's word) → FloorLists's desk keys (handleOpenView).
// `watchlists` left on 2026-11-09 with the scan list (archive/README.md).
const VIEW_DESKS = Object.freeze({
    calendar: 'calendar', orders: 'queued', trades: 'trade', portfolios: 'portfolio', hotlist: 'hotlist',
    positions: 'positions', board: 'board',
})

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

// ── The side pane's tabs (phase 8e, K6) ──
// Pythia and Aether still run their own chats (they are not on the session yet — D1), and the order ticket is a pad of
// its own: each is a pane tab that stays MOUNTED while hidden (`keepMounted`, SidePane), so a conversation or a half-typed
// order survives the pane closing. Admin-only for the two desks — their props are given to admins only.
function PythiaSurface({ deskProps }) { return deskProps.pythia ? <StrategyPanel {...deskProps.pythia} /> : null }
PythiaSurface.keepMounted = true
function AetherSurface({ deskProps }) { return deskProps.aether ? <AetherPanel {...deskProps.aether} /> : null }
AetherSurface.keepMounted = true
function TicketSurface({ deskProps }) { return <div className="portfolio-panel">{deskProps.ticketPad}</div> }
TicketSurface.keepMounted = true
TicketSurface.paneLabel = 'Order ticket'


// The desks whose work is drawn in the side pane, by agent (8b Mentor, 8c Atlas, 8d Argus and Prometheus, 8e the rest).
const SURFACES = Object.freeze({
    mentor: MentorSurface, portfolio: PortfolioSurface, scanner: ScannerSurface, analyst: AnalystSurface,
    strategy: PythiaSurface, aether: AetherSurface, ticket: TicketSurface,
})

export function MainPage() {
    const { user, isAdmin } = useAuth()

    // Bumped by the daily market-brief card — the chat timeline writes the brief on every change, then clears it. See
    // the MARKET_BRIEF_OPEN listener for why it counts rather than latches.
    const [briefRequest, setBriefRequest]       = useState(0)
    // A route Pythia's or Aether's panel offered (its RouteOffer) INTO the other — the panels still open on a seed.
    const [pythiaSeed, setPythiaSeed] = useState(null)
    const [aetherSeed, setAetherSeed] = useState(null)
    const [newsTab, setNewsTab]                 = useState('earnings')

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
    //
    // Since phase 8d the thesis reopens IN THE SESSION (POST /sessions/:id/edit — admin-only, the coverage routes' own
    // gate): Prometheus's state is the doc, its surface comes up, and it opens on the revise turn.
    function handleEditCoverage(cov) {
        if (!cov?.id) return
        editEntity('coverage', cov.id, {
            name: cov.symbol ?? null,
            ask:  `Revise our coverage on ${cov.symbol}. What has changed since the last view, and does the thesis still hold?`,
        })
    }

    const [dismissedConfirmIds, setDismissedConfirmIds] = useState(() => new Set())
    const [setupConfirmId, setSetupConfirmId] = useState(null) // Mentor setup showing the OrderConfirmDialog
    const [setupDrift, setSetupDrift]         = useState(null) // the server's 409 `price_moved` numbers, once refused
    const [placingOrders, setPlacingOrders] = useState(false)
    const [pendingDeleteIdea, setPendingDeleteIdea] = useState(null)
    const [deletingIdea, setDeletingIdea] = useState(false)
    const { setups, setupsLoading, refreshSetups } = useSetups()
    const [setupBusyId, setSetupBusyId] = useState(null)

    const { runs: aetherRuns, loading: aetherLoading, error: aetherError, onRead: onAetherRead } = useAetherCandidates()

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

    // Setup pencil → back into the Mentor chat that BUILT it. Mentor persists `chat_state` (messages + draft + coverage) on Generate and on
    // every edit turn, so the conversation reopens where it left off.
    //
    // A setup saved before chat_state was carried has no conversation to restore: the server rebuilds
    // Mentor's draft from the document (mentorStateFromEntity), so the user still edits a real setup.
    // `ask`, when given, is the turn the desk opens ON. The
    // pencil passes none (nothing has happened; the user is the one with something to say); the
    // re-draw card passes Talos's reason, which is the whole difference between the two doorways.
    //
    // Since phase 8b the setup reopens IN THE SESSION: the server puts Mentor's state back from the document and its
    // sealed conversation (seal.openForEdit), Mentor takes the floor, and its surface comes up in the side pane.
    async function handleEditSetup(setup, { ask = null } = {}) {
        const accountIds = Array.isArray(setup.accounts) ? setup.accounts : []
        await editEntity('setup', setup.id, {
            // The card's ask is the only one here, and only the card reopens a flagged setup (Roy, 2026-11-05): the pencil opens it as it is.
            name: setup.asset ? `${setup.asset} setup` : null, ask, redraw: Boolean(ask),
            // The ask goes out with the accounts restored below — that state is not readable yet.
            accounts: availableAccounts.filter(a => accountIds.includes(a.id)), mainAccountId: setup.mainAccountId ?? null,
            // ONLY ONCE IT REOPENED (phase 8b CR): a "no" to the busy question keeps the user's own build, and it must
            // keep its workspace and accounts with it. The venue is re-bound on Update from the MARKED accounts, so
            // restore the ones this setup was generated against — otherwise an edit could silently re-bind it to
            // another broker. Standing in the setup's own workspace first is what makes those accounts LISTABLE;
            // without it the selector holds ids it cannot show and the re-bind resolves to nothing.
            onOpened: () => {
                alignWorkspaceTo(setup)
                setSelectedAccounts(accountIds)
                setMainAccountId(setup.mainAccountId ?? null)
                // Another plan's levels must not stay docked over this one (code review); a chart of the user's own stays.
                if (['mentor', 'mentor-trade'].includes(currentChart()?.source)) closeChart()
            },
        })
    }
    const { earnings, earningsFrom, earningsTo, earningsLoading, fed, fedLoading, ipo, ipoLoading, industries, industriesLoading, industriesError, week, assessments, themes } = useCalendarEvents()
    const { availableAccounts, selectedAccounts, setSelectedAccounts, mainAccountId, setMainAccountId } = useBrokerAccounts()
    // The marked accounts as a ref, for the one-shot doorways below that must not re-register on
    // every selection change (SETUP_SHARED_OPEN reads it to ask readiness the right question).
    const timelineAccounts = useMemo(
        () => availableAccounts.filter(a => selectedAccounts.includes(a.id)),
        [availableAccounts, selectedAccounts],
    )
    const selectedAccountsRef = useRef(selectedAccounts)
    useEffect(() => { selectedAccountsRef.current = selectedAccounts }, [selectedAccounts])

    // ── The live session, shared (phase 8b) ──
    // ONE useSession for the main chat: the timeline draws it, the side pane's surfaces press it, and the doorways
    // below speak through it. Refs for the doorways registered once (the event-bus listeners).
    const mainSession = useSession('main')
    // The pane's tabs are a module store: a parked Pythia tab must not survive into the next user's session (8e CR).
    useEffect(() => { resetSidePane() }, [user?._id])
    const mainSessionRef = useRef(mainSession)
    mainSessionRef.current = mainSession
    // A Mentor turn closed a setup: the list says so now, not at its next poll.
    const closedSetupId = mainSession.lastTurn?.payload?.closedSetup?.id ?? null
    useEffect(() => { if (closedSetupId) refreshSetups() }, [closedSetupId]) // eslint-disable-line react-hooks/exhaustive-deps
    const deskAccountsRef = useRef({ accounts: timelineAccounts, mainAccountId })
    deskAccountsRef.current = { accounts: timelineAccounts, mainAccountId }
    // What a surface needs to mark and read the accounts — Mentor's Generate binds to them.
    const paneDeskProps = useMemo(
        () => ({ availableAccounts, selectedAccounts, accounts: timelineAccounts, setSelectedAccounts, mainAccountId, setMainAccountId }),
        [availableAccounts, selectedAccounts, timelineAccounts, setSelectedAccounts, mainAccountId, setMainAccountId],
    )

    /** A turn to a desk, with the marked accounts — what a doorway that opens a desk ON a sentence sends. */
    function talkTo(agent, text, extra = {}) {
        const { accounts, mainAccountId: mainId } = deskAccountsRef.current
        return mainSessionRef.current.send(text, { agent, accounts, mainAccountId: mainId, ...extra })
    }

    /** Show a desk's surface beside the chat (the chat column is the timeline's while it is open). */
    function openDesk(agent) {
        // The desk the user was sent to must not open underneath the thing they sent themselves from (8b CR).
        closePanel()
        // ON A PHONE a desk the user TALKS to opens with its work LOWERED (Roy, 2026-11-01): raised, the sheet covered the
        // whole chat box at the start of the conversation. "Show …" in the chat header raises it — their choice. A kept
        // surface (the ticket, Pythia, Aether) has no chat under it: it IS the screen they asked for, so it comes up.
        openSurface(agent, { collapse: isHandheld() && !SURFACES[agent]?.keepMounted })
    }

    /**
     * Reopen a saved item at the desk that owns it, in the session (backend POST /sessions/:id/edit). A desk holding
     * other unsaved work answers busy: the user is asked, and a yes repeats it with `force`. `ask` is the turn the
     * desk opens ON (a card's reason); a pencil passes none.
     */
    async function editEntity(kind, id, { name = null, ask = null, reviewMode = false, redraw = false, accounts = null, mainAccountId: mainId, onOpened = null } = {}) {
        const session = mainSessionRef.current
        let out = await session.reopen(kind, id, { name, reviewMode, redraw })
        if (!out.ok && out.reason === 'busy') {
            const work = (agentMeta(out.extra?.agent).work ?? 'work').toLowerCase()
            if (!window.confirm(`There is other ${work} open and unsaved. Set it aside and open this?`)) return false
            out = await session.reopen(kind, id, { name, reviewMode, redraw, force: true })
        }
        if (!out.ok) { showErrorMsg(out.message); return false }
        onOpened?.()
        const agent = out.result?.agent
        if (agent) openDesk(agent)
        if (ask && agent) {
            const marked = accounts ?? deskAccountsRef.current.accounts
            session.send(ask, { agent, accounts: marked, mainAccountId: mainId !== undefined ? mainId : deskAccountsRef.current.mainAccountId })
        }
        return true
    }

    const { workspace, setWorkspace } = useWorkspaceMode(user?._id)
    const { positions, loading: positionsLoading, refresh: refreshPositions, closePosition, closePositions } = usePositions()
    const { ideas, setIdeas, loadIdeas, loading: ideasLoading, handleStatusChange, preEntryPrompt, setPreEntryPrompt } = useTradeIdeas()
    // The workspace's lists, computed once per change — NOT inline in the JSX. This page re-renders on every session
    // frame (each streamed token), and a fresh array each time re-ran every effect keyed on it: TradeIdeasList's
    // pending-reviews read fired per token and tripped the API limiter mid-build (8f drive, 2026-10-18).
    const workspaceIdeas  = useMemo(() => inWorkspace(ideas, workspace).filter(i => i.status !== 'closed'), [ideas, workspace])
    const workspaceSetups = useMemo(() => inWorkspace(setups, workspace), [setups, workspace])
    // The names that are already the user's in this workspace — every list marks them (OwnedBadge, 2026-10-28).
    const owned = useMemo(() => ownedSymbols({ setups: workspaceSetups, ideas: workspaceIdeas, positions }), [workspaceSetups, workspaceIdeas, positions])
    // Every entity that can OWN a broker position — what the book folds a holding's legs by. Setups are not in `ideas`
    // (/api/trade-ideas stopped returning them on 2026-11-10), so a setup's scale-in legs folded only by accident before.
    const positionOwners = useMemo(() => [...ideas, ...setups], [ideas, setups])

    // Atlas's surface reads the books (a book's holdings are ideas with its portfolioId) and hands back what follows a
    // save or an adoption — on top of the props every surface takes.
    const surfaceProps = useMemo(
        () => ({ ...paneDeskProps, ideas, coverage, onSaved: handleDeskSaved, onAdopted: handleBookAdopted }),
        [paneDeskProps, ideas, coverage], // eslint-disable-line react-hooks/exhaustive-deps -- the two handlers are re-read through the memo's next build
    )

    // A press on a surface saved something: the page re-reads what it changed. Atlas: the book, and the queued list
    // when a change waits for the open (the list is fetched, never pushed — reviewApply.queuedAnything). Prometheus: the
    // coverage book. (Argus saves nothing since 2026-11-09 — his list-building chat is archived.)
    function handleDeskSaved({ agent, result }) {
        // (The coverage book itself reloads on COVERAGE_CHANGED, which the commit announces — session.service.remote.)
        if (agent === 'analyst') { setNewsTab('coverage'); return }
        loadIdeas()
        if (queuedAnything(result?.rebalance)) loadQueued()
    }
    // An adoption landed: straight into the book that now exists — the next thing to do is look at what was adopted.
    function handleBookAdopted(portfolioId) {
        Promise.resolve(loadIdeas()).then(() => handleEditPortfolio(portfolioId)).catch(() => {})
    }

    // The trade-ideas list's "building" row: a plan on Atlas's table, from the session. Only while there IS one (8c CR):
    // the session outlives a visit, so a book merely opened would otherwise stay "building" after the user walked
    // away — and an edited book's row shows only in its own workspace.
    const atlasState = mainSession.agentState?.portfolio ?? null
    const buildingPortfolio = useMemo(() => {
        const plan = atlasState?.pendingPlan
        if (!plan?.ideas?.length) return null
        const editingId = atlasState?.portfolioId ?? null
        const legs = editingId ? ideas.filter(i => i.portfolioId === editingId) : []
        if (legs.length && !inWorkspace(legs, workspace).length) return null
        return { name: plan.name ?? legs[0]?.portfolioName ?? 'New portfolio', ideasCount: plan.ideas.length, portfolioId: editingId }
    }, [atlasState, ideas, workspace])
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
    // Immediate-trade ticket. Whether the pad is SHOWING is the side pane's (its `ticket` tab, kept mounted) — opened
    // the way a desk is, so there is one notion of "what is beside the chat".
    // Which entity it manages is state, but the entity ITSELF is read from `ideas`
    // (see handleTicketPlace) so a broker fill moves the ticket on without tracking the lifecycle twice.
    const [ticketIdeaId, setTicketIdeaId] = useState(null)
    const [ticketBusy, setTicketBusy]     = useState(false)
    const [ticketError, setTicketError]   = useState(null)
    const [preEntryBusy, setPreEntryBusy] = useState(false)

    // A position row in the Floor's book opens the idea that OWNS it. Same rule TradeIdeasList uses for its Positions tab — the routing is the entity's, not the
    // panel's, so both surfaces ask positionOpenTarget.
    function handleOpenPositionFromFloor(position) {
        const target = positionOpenTarget(position, ideas, setups)
        if (target?.kind === 'idea')  openIdeaPopup(target.idea)
        if (target?.kind === 'setup') openSetupPopup(target.setup)
    }


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

    // The card listeners below register once, so they cannot close over state — these are what they
    // read instead. There used to be four more, mirroring the ideas / setups / coverage
    // lists so a card could resolve its subject out of them; the cards now READ their subject by id
    // (resolveEntity), which is both fresher and the same authorization the server already applies.
    // What is left is state with no document behind it to fetch.
    const isAdminRef = useRef(isAdmin)
    isAdminRef.current = isAdmin
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
        return eventBus.on(PORTFOLIO_REVIEW, ({ portfolioId }) => {
            handleEditPortfolio(portfolioId, { reviewMode: true })
        })
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Sleeve-sourced card → back to the build the sleeve was FOR. A book that exists reopens as its edit. A construction
    // still in a pre-session THREAD (a card from before phase 5d — sleeves settle into the session's chain since) has no
    // way back: the threads drawer went with the panels (phase 8e), so Atlas's surface opens and the user is told.
    useEffect(() => {
        return eventBus.on(RESUME_BUILD, ({ portfolioId = null, threadId = null } = {}) => {
            if (portfolioId) { handleEditPortfolio(portfolioId); return }
            openDesk('portfolio')
            if (threadId) showUserMsg('That build was started before the chat moved — ask me to pick it up from the research.')
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

    // An entity POP-OUT asked for something only the app window can do (re-draw it in the desk's
    // chat). The bridge re-emits onto this same eventBus under the same event names the social-chat
    // cards use, so the doorways below serve both without knowing which one called.
    useEffect(() => listenForPopupEvents(), [])

    // Setup-invalidation card "Re-draw it" → reopen the setup in Mentor's chat AND open the turn.
    //
    // It shares the pencil's doorway (the setup reopened in the session, its accounts restored, "Update setup" re-arms
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
    // Unresolvable ids fall back to Mentor's surface rather than a dead click — same rule as
    // SETUP_CONFIRM_OPEN. A setup deleted since the card was posted is the ordinary case.
    useEffect(() => {
        return eventBus.on(SETUP_INVALIDATION_EDIT, async ({ setupId }) => {
            const setup = await resolveEntity('setup', setupId)
            if (setup) handleEditSetup(setup, { ask: redrawAsk(setup) })
            else openDesk('mentor')
        })
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Shared-setup card "Open in Mentor" → MY Mentor, on a plan SOMEONE ELSE drew.
    //
    // Not the pencil's doorway and not the re-draw card's: there is no document of mine to edit, no conversation to
    // restore, and no workspace to align to — the
    // blueprint carries no account, so I stay where I am standing and mark my own. The server
    // hydrates it through the same normalise + readiness the desk uses on every turn, and what
    // comes back is always short of ready by the size: that is the point of the flow, not a
    // failure of it. `problems` is what was sent and did not survive the read — said out loud,
    // because silently dropping two of four levels hands the user a different trade.
    //
    // It goes onto Mentor's table as a FRESH plan (a hand edit, `fresh: true`), never as an edit of whatever build was
    // open — asked first over work Mentor holds. The ask fires a turn (sharedAsk): Mentor reads the plan against the
    // tape now, then helps size it.
    //
    // The accounts are read from a ref, not the closure: this doorway is registered once.
    useEffect(() => {
        return eventBus.on(SETUP_SHARED_OPEN, async ({ blueprint, note = null, drawnPrice = null }) => {
            let hydrated
            try {
                hydrated = await mentorService.hydrateBlueprint(blueprint, selectedAccountsRef.current)
            } catch (err) {
                showErrorMsg(err?.response?.data?.problems?.[0] ?? apiError(err, 'Could not open the shared setup'))
                return
            }
            const { setup, problems = [] } = hydrated ?? {}
            if (!setup) { showErrorMsg(problems[0] ?? 'Could not open the shared setup'); return }
            // A blueprint from a newer app is the one problem that stops the open — half-understanding
            // someone else's trade is worse than declining it. Everything else is reported and opened.
            if (problems.some(p => /newer version/i.test(p))) { showErrorMsg(problems[0]); return }
            for (const p of problems) showUserMsg(p)

            // Someone else's plan goes onto MY Mentor's table as a fresh plan — never as an edit of the setup I may be
            // editing (the server clears Mentor's markers for it). Work Mentor is holding is not thrown away unasked.
            // ANY work counts (phase 8b CR) — a generated setup waiting on Arm has no draft, and a fresh plan clears it.
            const session = mainSessionRef.current
            const held = mentorHolding(session.agentState?.mentor)
            if (held && !window.confirm(`I'm working on ${held} with you. Put it aside and open the shared ${setup.asset ?? ''} plan?`)) return
            const fresh = { draft: setup, fresh: true, accounts: deskAccountsRef.current.accounts }
            let put = await session.edit('mentor', fresh)
            // A Mentor turn finishing in between moves the revision: once more on the one the refusal named. The user
            // already said yes to what was on the table; a turn's next words are not worth a second question.
            if (!put.ok && put.reason === 'stale_state' && Number.isInteger(put.extra?.rev)) put = await session.edit('mentor', fresh, { rev: put.extra.rev })
            if (!put.ok) {
                showErrorMsg(put.reason === 'stale_state' ? 'I am mid-reply — open the shared plan again once I finish.' : put.message)
                return
            }
            if (setup.asset) openChart({ ticker: setup.asset, source: 'mentor' })
            openDesk('mentor')
            talkTo('mentor', sharedAsk({ blueprint, note, drawnPrice }))
        })
    }, [])

    // Market-brief card "Get the brief" → open Axl and have him write it there.
    //
    // The chat is always the timeline (phase 8e), so the brief is asked for where the user already is. The counter is
    // what tells the timeline to write. A counter and not a flag, because two briefs a day (a second card after the
    // first was dismissed) must both fire. The timeline clears it once it starts, so a later render doesn't re-deliver
    // a brief the user already read.
    useEffect(() => {
        return eventBus.on(MARKET_BRIEF_OPEN, () => {
            setBriefRequest(n => n + 1)
        })
    }, [])

    // Coverage cards → the Analyst. WHICH Prometheus depends on what the card asked for, and the
    // payload has always carried enough to tell: this used to drop it on the floor and open a blank
    // chat, so a card saying "ZTS — target hit, revise the thesis" landed the user on an empty desk
    // with the name it named nowhere in sight.
    //
    //   • a monitor VERDICT (mode 'revise') → the pencil's own pipeline: update mode on that doc, a
    //     revise turn already in flight.
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
            // WHICH SURFACES MOVE — coverageRoute, so the rule is assertable outside this page.
            // `handheld`: the book's column is display:none on a phone — a read goes to the detail page.
            const go = coverageRoute({ mode, resolved: !!cov, handheld: isHandheld() })
            if (go.revise) { handleEditCoverage(cov); return }
            if (go.detail) { eventBus.emit(ENTITY_DETAIL_OPEN, { kind: 'coverage', id: cov.id }); return }
            // The book is in the right column, which is ONE OF TWO surfaces depending on the design:
            // the Radar's Coverage tab (`newsTab`), or — on the Floor, the default — FloorLists's
            // Forecasts map opened on that company (it replaced the "Analyst companies" desk on
            // 2026-10-14), which never reads `newsTab`. Switching only the tab made
            // "Open coverage" a dead button on every Floor desktop (2026-10-03). Both are asked: the
            // listener is registered once, so it cannot read the live design, and the request the
            // other design does not render is inert. A fresh object, so a second press re-opens a
            // desk closed in between (same channel as the forecast and queued-list cards).
            if (go.book) { setNewsTab('coverage'); setDeskRequest({ key: 'forecasts', symbol: cov?.symbol ?? sym }) }
            if (go.desk) openDesk('analyst')
        })
    }, []) // eslint-disable-line react-hooks/exhaustive-deps -- registered once; handleEditCoverage reads the session through its ref

    // Sector-view card → the Radar's Forecasts tab. Unlike a coverage verdict there is nothing to
    // revise from here: the house view is a STATE, and the card's job is to put the board in front of
    // the reader.
    //
    // Two surfaces show that board — the Radar tab and, since the calendar moved right, the Floor's
    // Forecasts desk — so one handler opens both. The Floor rail used to subscribe to this event
    // itself; routing it through `deskRequest` instead keeps ONE channel for "something outside
    // asked for a desk", which is the same one the queued list already travels on.
    useEffect(() => {
        // Pythia's "industry changed" card names its industry (`code`): the map opens ON it, not on the bare map.
        return eventBus.on(OPEN_SECTOR_VIEW, (payload) => {
            setNewsTab('forecasts')
            setDeskRequest({ key: 'forecasts', code: payload?.code ?? null })
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
            if (!setup) { openDesk('mentor'); return }
            setSetupDrift(null)   // a refusal belongs to the dialog it was shown in, never the next
            setSetupConfirmId(setupId)
            // The dialog derives from the setups list, so make sure it holds this setup's current
            // state — the market-open sweep can flip a parked setup while the list is 20s behind.
            refreshSetups?.()
        })
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Confirm a setup's entry. Execution is kind-blind (placeOrdersForIdea resolves the entity by
    // id, not by kind), so the setup's own plan places through the same endpoint an idea uses.
    //
    // The server re-prices at this moment: a confirmed entry goes out at MARKET, so if the price has
    // moved off the plan it answers 409 `price_moved` with the live numbers instead of placing. The
    // dialog then shows them, and the second press carries `acceptPrice` — the user buys at market
    // knowing what it costs (EXPD 2026-10-20: planned 196, paid 198.81, nobody said so).
    async function handleConfirmSetupOrders(setup, orders) {
        setPlacingOrders(true)
        try {
            await tradeIdeasService.placeOrders(setup.id, orders, { acceptPrice: Boolean(setupDrift) })
            setSetupConfirmId(null)
            setSetupDrift(null)
            refreshSetups()
        } catch (err) {
            const data = err?.response?.data
            // `past_stop` is final — the dialog shows it with no way to place; `price_moved` is the
            // one a second press (acceptPrice) can take.
            if ((data?.reason === 'price_moved' || data?.reason === 'past_stop') && data.drift) { setSetupDrift(data.drift); return }
            console.error('[setups] place orders failed', err)
            showErrorMsg(`Order placement failed: ${apiError(err)}`)
        } finally {
            setPlacingOrders(false)
        }
    }
    function handleDismissSetupConfirm() { setSetupConfirmId(null); setSetupDrift(null) }

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

    // ── Immediate-trade ticket ────────────────────────────────────────────────
    // The discretionary order pad. It authors an `idea` and places it through the same
    // endpoints as every other order — a ticket trade is an idea like any other, so it is
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
                // Roll it back.
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
            // account") instead of failing silently — apiError prefers the per-account
            // result over the summary line.
            showErrorMsg(`Order placement failed: ${apiError(err)}`)
            // The idea reached 'hit' via the monitor: keep it there so the user can retry.
            setDismissedConfirmIds(prev => new Set(prev).add(idea.id))
        } finally {
            setPlacingOrders(false)
        }
    }

    // ── Arm-time pre-flight prompt actions (Buy now / Reset) ─────────────────
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

    // Which act this is belongs to the BOOK, not to the surface the click came from. Four paths reach
    // here — three pencils and the Axl hand-off — and they disagreed: the two lists forced a review
    // only when one was DUE, the Floor pencil never did, so the same live book was reviewed from one
    // surface and RE-PLANNED from another, standing its open positions down to rewrite a plan the
    // market had already acted on. Deciding it here is what makes the four agree.
    //
    // A caller may still FORCE a review (a due-review pencil, the review card, the pre-activation
    // prompt) — that is a schedule or a request, and it is legitimate on a book with nothing live.
    // None of them can force a plain edit on a book that holds a position. See isPortfolioReview.
    //
    // Since phase 8c the book reopens IN THE SESSION (backend POST /sessions/:id/edit, `reviewMode` honoured): Atlas's
    // state is the book's id, its mode and its standing thesis, the floor goes to Atlas and its surface comes up.
    async function handleEditPortfolio(portfolioId, { reviewMode: forceReview = false } = {}) {
        // The book is READ, not filtered out of whatever this client happens to be holding. It used
        // to be `ideas.filter(...)`, which made opening a book depend on a list having loaded — and
        // from a social-chat card it hadn't, so Atlas was handed a portfolio with no item ids,
        // invented them, and every accepted change came back not_found.
        const portfolioIdeas = await resolveEntity('portfolio', portfolioId)
        if (!portfolioIdeas) { showErrorMsg('Could not open the portfolio — try again'); return }
        if (!portfolioIdeas.length) { showErrorMsg('This portfolio has no holdings'); return }
        const reviewMode = forceReview || isPortfolioReview(portfolioIdeas)

        await editEntity('portfolio', portfolioId, {
            name: portfolioIdeas[0]?.portfolioName ?? null, reviewMode,
            // ONLY ONCE IT REOPENED: a "no" to the busy question keeps the user's own work, with its accounts.
            onOpened: () => {
                // Seed the account selector from the portfolio's own ideas so it reflects what's actually attached
                // (not stale global selection) — and so saving the edit doesn't wipe accounts the user never meant to
                // change. A book's holdings all bind to the same workspace, so the first one names it for the book.
                const seedAccounts = [...new Set(portfolioIdeas.flatMap(i => Array.isArray(i.accounts) ? i.accounts : []))]
                alignWorkspaceTo(portfolioIdeas[0])
                setSelectedAccounts(seedAccounts)
                setMainAccountId(portfolioIdeas.find(i => i.mainAccountId)?.mainAccountId ?? null)

                // Editing the plan de-activates it: move every idea back to 'waiting' until the user re-activates. A
                // scheduled REVIEW must NOT do this — a live book stays live and monitored while reviewed; only
                // accepted changes touch positions. (Pre-activation books are already 'waiting', so review is a
                // no-op here either way.)
                const toReset = reviewMode ? [] : portfolioIdeas.filter(i => i.status !== 'waiting')
                if (toReset.length > 0) {
                    setIdeas(prev => prev.map(i => i.portfolioId === portfolioId ? { ...i, status: 'waiting' } : i))
                    Promise.all(toReset.map(i => tradeIdeasService.updateIdea(i.id, { status: 'waiting' })))
                        .catch(err => console.error('[portfolio] reset to waiting failed', err))
                }
            },
        })
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

    // Shared calendar → Mentor handoff: open the setup desk with the catalyst already said, and put
    // the ticker on the chart so the conversation and the chart open on the same name. The message
    // goes out as one session turn to Mentor, so one click is one turn. A hand-off INTO the chat closes
    // the detail panel docked over it (openDesk does) — the desk the user was sent to must not open
    // underneath the thing they sent themselves from.
    function seedMentorChat(symbol, message) {
        if (!symbol) return
        closePanel()
        talkTo('mentor', message)
        openDesk('mentor')
        openChart({ ticker: symbol, source: 'mentor' })
    }

    // ── The order ticket ──────────────────────────────────────────────────────
    // Trade by hand (Axl's <show>ticket, the Lists): the pad is a pane tab beside the chat (phase 8e).
    function handleOpenTicket(symbol = null) {
        openDesk('ticket')
        // The pad starts blank; the chart of the name they asked about is beside it.
        if (symbol) openChart({ ticker: symbol, source: 'ticket' })
    }

    // ── The house's views, from Axl's <show>heatmap / <show>calendar (Roy, 2026-10-19) ──
    // The Floor's own panels, through the one outside-ask channel they already answer (deskRequest): Forecasts is
    // Pythia's heat map (on a company's industry when a symbol rides along), Calendar the month grid — both open as
    // the detail panel over the chat column.
    // Since 2026-10-22 every Floor list is a view too (Roy: Axl opens them when asked) — the show kind is the user's word
    // for it, the desk key FloorLists's.
    function handleOpenView(kind, symbol = null) {
        if (kind === 'heatmap') setDeskRequest({ key: 'forecasts', symbol: symbol ?? null })
        else if (VIEW_DESKS[kind]) setDeskRequest({ key: VIEW_DESKS[kind] })
    }

    /**
     * Open something the user already has, at the desk that owns it — an edit a route names by id or by name.
     *
     * FINDING it is not this component's job — resolveForEdit answers an id or a name, and answers null rather than
     * guessing when a name is ambiguous. What stays here is the OPENING, each kind through its own doorway.
     */
    async function openForEdit({ kind, ref } = {}) {
        const doc = await resolveForEdit(kind, ref)
        if (!doc) return false
        switch (kind) {
            case 'setup':     handleEditSetup(doc);   return true
            case 'coverage':  setNewsTab('coverage'); handleEditCoverage(doc); return true
            case 'portfolio': handleEditPortfolio(doc.portfolioId); return true
            default:          return false
        }
    }

    // ── A desk → another desk, by the user's ask ──────────────────────────────
    // "Send NVDA to Prometheus", said at a desk: its reply carried the same route grammar Axl's does, the panel offered
    // it (RouteOffer), and the user pressed Go. The desk opens on the opening sentence the sender wrote, which is where
    // what it found travels — a hop added at any desk is a prompt edit there, never a handler here.
    //
    // Since phase 8e only Pythia's and Aether's panels offer one (the session desks route through Axl, on the server).
    // An edit opens the item; a desk on the session gets the opening as a turn; Pythia or Aether opens on it as a seed.
    async function handleRoute(offer) {
        const desk = DESKS.find(d => d.key === (offer?.edit?.desk ?? offer?.route))
        if (!desk) return
        if (offer.edit && await openForEdit(offer.edit)) return
        const agent = desk.entryTab
        const symbol = offer.routeSymbol ?? null
        const opening = typeof offer.opening === 'string' && offer.opening.trim() ? offer.opening.trim()
            : symbol && agent === 'analyst' ? `Research ${symbol} for coverage.`
            : symbol && agent === 'mentor' ? `I want to work on my own ${symbol} trade.`
            : null
        if (agent === 'strategy' || agent === 'aether') {
            if (!isAdmin) return
            if (opening) (agent === 'strategy' ? setPythiaSeed : setAetherSeed)({ key: Date.now(), message: opening })
            openDesk(agent)
            return
        }
        // Argus is reached ONLY through Mentor's route, on the server (2026-11-09: his list-building chat is archived) —
        // a panel's offer to send the user there opens nothing.
        if (agent === 'scanner') return
        if (opening) talkTo(agent, opening)
        openDesk(agent)
    }


    // Earnings ticker → MENTOR: a scheduled print is a date with a ticker attached and no bias,
    // which is a setup (zones + a window), not an idea's condition tree. Each row carries its own
    // report date (the list spans the trading week).
    // A name off the HOTLIST → Mentor, ONE at a time (Roy, 2026-10-21) — the scan pick's path, with the
    // board and column as a reference the server resolves into the board's facts (the horizon, the
    // grade and free range, the catalyst, Argus's note). The read in the opening sentence is Argus's
    // pick note, else the board's own reason the name is in play.
    // A Swing / Long term row (the house's coverage, 2026-10-24) has no board: it rides as which list, and the server
    // reads the name's coverage back for Mentor — the horizon (swing / long term), the target, the thesis (bookSeed).
    function handleBuildFromHotlist(row, column, board) {
        const turn = handoffTurn(hotlistHandoff(row, column, board))
        if (!turn) return
        talkTo('mentor', turn.text, { seed: turn.seed })
        openDesk('mentor')
    }

    // THE BADGE on a Hotlist row (backend proteus.md step 5): the technical analyst's read on how the name trades, in the chat.
    function handleTechnicalsFromHotlist(symbol) {
        if (!symbol) return
        talkTo('proteus', `How does ${symbol} trade?`)
    }

    function handleBuildFromEarning(earning) {
        if (!earning?.symbol) return
        seedMentorChat(earning.symbol, buildEarningSeed(earning, earning.date))
    }

    // IPO ticker → MENTOR: same shape — the listing is the date, direction stays open.
    function handleBuildFromIpo(ipoItem) {
        if (!ipoItem?.symbol) return
        seedMentorChat(ipoItem.symbol, buildIpoSeed(ipoItem))
    }

    // The pad is built here and shown in the side pane's `ticket` tab, which stays MOUNTED (TicketSurface.keepMounted):
    // a half-typed ticket (or a resting order it is tracking) survives the pane closing.
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

    // The side pane's props: what every surface reads (surfaceProps), and the kept tabs' — the ticket pad, and Pythia's
    // and Aether's panels for an admin (their props are their own: a seed a route left, where a publish lands).
    const paneProps = {
        ...surfaceProps,
        ticketPad,
        ...(isAdmin ? {
            pythia: { seed: pythiaSeed, onRoute: handleRoute, onPublished: () => setNewsTab('forecasts') },
            aether: { seed: aetherSeed, onRoute: handleRoute },
        } : {}),
    }

    return (
        <OwnedSymbolsProvider value={owned}>
            <main className="main-page">
                {/* ── Desktop / tablet workspace ── */}
                <div className="workspace">
                    {/* The Floor (Ctrl+Shift+D): MENU | chat | INFO (Roy, 2026-10-23). */}
                    {floorMode && (
                        <div className="workspace__left">
                            {/* THE MENU (Roy, 2026-10-23): every list — Positions first — each opening in the detail window
                                over the chat. The row actions run the SAME handlers as the ideas table: a second surface
                                onto the same entities, not a second set of rules about them. */}
                            <FloorLists
                                    setups={workspaceSetups}
                                ideas={workspaceIdeas}
                                positions={positions}
                                coverage={coverage}
                                queued={queued}
                                onExecuteQueued={handleExecuteQueued}
                                onCancelQueued={handleCancelQueued}
                                queuedBusyId={queuedBusyId}
                                deskRequest={deskRequest}
                                // Pythia's board — the `board` desk the map's "Board" button opens.
                                industries={industries}
                                industriesLoading={industriesLoading}
                                industriesError={industriesError}
                                week={week}
                                assessments={assessments}
                                themes={themes}
                                aetherCandidates={{ runs: aetherRuns, loading: aetherLoading, error: aetherError, onRead: onAetherRead, onTradeWithMentor: seedMentorChat }}
                                onEarningSelect={handleBuildFromEarning}
                                onIpoSelect={handleBuildFromIpo}
                                onHotlistBuild={handleBuildFromHotlist}
                                onHotlistTechnicals={handleTechnicalsFromHotlist}
                                onEditSetup={handleEditSetup}
                                onDeleteSetup={handleDeleteSetup}
                                onEditPortfolio={handleEditPortfolio}
                                onDeletePortfolio={handleDeletePortfolio}
                                onActivatePortfolio={handleActivatePortfolio}
                                onDeleteIdea={handleDeleteIdea}
                                onEditCoverage={handleEditCoverage}
                                onRetireCoverage={handleRetireCoverage}
                                onDeleteCoverage={handleDeleteCoverage}
                                isAdmin={isAdmin}
                                onOpenDesk={openDesk}
                                // The book again, for the Positions window Axl's <show>positions opens (the column is hidden
                                // on a narrower screen).
                                book={{ positions, ideas: positionOwners, loading: positionsLoading, onOpenPosition: handleOpenPositionFromFloor, onClosePosition: closePosition, onClosePositions: closePositions }}
                            />
                        </div>
                    )}
                    <div className="workspace__chat">
                        {/* Where a list row's detail docks on desktop (DetailPanel) — over the chat,
                            the widest column, with the chat still mounted underneath. */}
                        <DetailPanelSlot />
                        {/* The chat and, beside it, the side pane: each desk's working surface (8b–8d), and Pythia, Aether and the
                            order ticket as kept tabs (8e). The chat column is always the timeline — no desk tab replaces it. */}
                        <SessionContext.Provider value={mainSession}>
                            <div className="chat-with-pane">
                                <ChatTimeline
                                    accounts={timelineAccounts}
                                    mainAccountId={mainAccountId}
                                    onOpenTicket={handleOpenTicket}
                                    onOpenView={handleOpenView}
                                    briefRequest={briefRequest}
                                    onBriefStart={() => setBriefRequest(0)}
                                    // The admin row that opened Pythia and Aether under the header is OFF for now (Roy,
                                    // 2026-10-18). To bring it back: desks={isAdmin ? [{ agent: 'strategy', label: 'Pythia' },
                                    // { agent: 'aether', label: 'Aether' }] : []} onOpenDesk={openDesk} — ChatTimeline still
                                    // draws the row when given them.
                                    paneSurfaces={SURFACES}
                                />
                                <SidePane session={mainSession} surfaces={SURFACES} deskProps={paneProps} />
                            </div>
                        </SessionContext.Provider>
                    </div>
                    {floorMode ? (
                        <div className="workspace__right">
                            {/* INFO (Roy, 2026-10-23): what is going on in the app, the chat and the lists — to come. */}
                            <FloorInfo floor={mainSession.floor} agentState={mainSession.agentState} rows={mainSession.rows} />
                        </div>
                    ) : (
                    <div className="workspace__ideas">
                        <TradeIdeasList
                            ideas={workspaceIdeas}
                            // The desk the user is talking to — the list opens on its kind (the floor, since phase 8e).
                            chatTab={mainSession.floor ?? 'axl'}
                            buildingPortfolio={buildingPortfolio}
                            loading={ideasLoading}
                            onDelete={handleDeleteIdea}
                            onStatusChange={handleStatusChange}
                            onEditPortfolio={handleEditPortfolio}
                            onDeletePortfolio={handleDeletePortfolio}
                            onPlaceOrder={handleReopenConfirm}
                            positions={positions}
                            positionsLoading={positionsLoading}
                            onRefreshPositions={refreshPositions}
                            onClosePosition={closePosition}
                            onClosePositions={closePositions}
                            setups={workspaceSetups}
                            setupsLoading={setupsLoading}
                            onArmSetup={handleArmSetup}
                            onDisarmSetup={handleDisarmSetup}
                            onDeleteSetup={handleDeleteSetup}
                            onEditSetup={handleEditSetup}
                            setupBusyId={setupBusyId}
                            radar={{
                                tab:               newsTab,
                                onTabChange:       setNewsTab,
                                coverage,
                                coverageLoading,
                                industries,
                                industriesLoading,
                                industriesError,
                                week,
                                assessments,
                                themes,
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
                            aetherCandidates={{ runs: aetherRuns, loading: aetherLoading, error: aetherError, onRead: onAetherRead, onTradeWithMentor: seedMentorChat }}
                        />
                    </div>
                    )}
                </div>

                {/* ── Mobile ──
                    No separate mobile surface: the workspace above collapses to its chat column
                    (RootCmp.scss, < 768px), so a phone gets the header and the live desks. The
                    monitor dashboard + chat FAB/sheet that used to stand in here are gone. */}
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
                    drift={setupDrift}
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
        </OwnedSymbolsProvider>
    )
}
