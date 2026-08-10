import { useState, useRef, useEffect } from 'react'
import PropTypes from 'prop-types'
import { scannerService } from '../../services/scanner/scanner.service.remote.js'
import { threadsService, newThreadId } from '../../services/threads/threads.service.remote.js'
import { ChatBubble } from '../ChatBubble.jsx'
import { readStoredModel } from '../modelOptions.js'
import { readStoredReasoning } from '../reasoningOptions.js'
import { readStoredRoutingMode } from '../routingModeOptions.js'
import { useChatStream, toChatHistory } from '../../customHooks/useChatStream.js'
import { AgentMessages } from '../AgentMessages.jsx'
import { AgentChatInput } from '../AgentChatInput.jsx'
import { LaterButton } from '../LaterButton.jsx'
import { AgentIntro, AgentTurnTag } from '../AxlHub/AgentSummon.jsx'
import { AGENTS } from '../AxlHub/agentMeta.jsx'
import { ToolStatusChip } from '../ToolStatusChip/ToolStatusChip.jsx'
import { waitingLabel } from '../ToolStatusChip/waitingLabel.js'
import '../PortfolioPanel/PortfolioPanel.scss'
import './ScannerPanel.scss'

// How many of a ranked investing list go to Prometheus on the hand-off. It researches FEW and DEEP —
// each name is a full coverage cycle — and Argus already ranked them, so the top slice is the part
// worth the time. The rest stay on the saved list and can be asked for by name in Prometheus.
export const RESEARCH_TOP_N = 4

const SCAN_PHASE_LABELS = { 1: 'Thesis', 2: 'Discovery', 3: 'Filtering', 4: 'Ranked List' }

// Hand-off mode walks the same four numbers to a different destination, so two of the four labels
// describe work it never does. Argus converges on ONE name there: phase 1 asks the ANGLE only (not
// the spine's five-field scan thesis), and phase 4 is that single pick — a heading reading "Ranked
// List" over one ticker described the list-building dead end this mode replaced. Phase 3 is
// "Validation" rather than "Filtering" because the validate-a-name branch has nothing to filter: the
// user brought the ticker, and phase 3 is the whole session — it starts there and there is no pool.
const PICK_PHASE_LABELS = { 1: 'Angle', 2: 'Discovery', 3: 'Validation', 4: 'The Pick' }

// Famous scan angles (the "what") — thesis picks for Phase 1. `label` is what the
// user sees; `phrase` is the noun phrase we compose into the message so the agent
// slots it in as the scan's angle. Multi-select: several can be combined into one
// scan (e.g. false breaks + cyclic windows). The user can always type any other thesis.
const ANGLES = [
    { label: 'Momentum',           phrase: 'momentum setups' },
    { label: 'Breakouts',          phrase: 'breakout setups' },
    { label: 'False breaks',       phrase: 'false breakouts / failed breakdowns' },
    { label: 'Cyclic windows',     phrase: 'recurring-interval price cycles (repeating peak-to-trough timing)' },
    { label: 'Calendar patterns',  phrase: 'seasonal / calendar patterns (time-of-year tendencies)' },
    { label: 'Top movers',         phrase: 'today\'s top movers' },
    { label: 'Squeeze plays',      phrase: 'short-squeeze candidates' },
    { label: 'Sector rotation',    phrase: 'sector-rotation plays' },
    { label: 'Oversold bounce',    phrase: 'oversold bounce setups' },
]

// Per-pipeline intro shown in Argus's empty state. `profile` is the lens to lock to
// (null = show the selector). `hint` overrides the default AgentIntro hint text.
//
// The trade desk's copy takes the DESTINATION as an argument rather than naming a desk: it hardcoded
// "Kairos" through the whole Argus → Mentor pivot, so the first thing the desk told a user was where
// their pick was NOT going. MainPage derives the name from the same findReceiver call that routes
// the pick, so the sentence and the hop cannot disagree.
const PIPELINE_CONFIG = {
    trade: {
        profile: 'trading',
        // Singular on purpose: this desk's scan step is `produces: 'one'`, so Argus settles on a
        // single name and hands it over. Promising "candidates" here described the old dead end.
        intro:   (dest) => `Bring me a ticker to validate, or describe what you're after and I'll settle on one name to trade — then hand it ${dest ? `to ${dest}` : 'on'}.`,
        hint:    (dest) => `Name a ticker or tell me the setup type — I'll check it and hand you ${dest ? `to ${dest}` : 'on'}.`,
    },
    portfolio: {
        profile: 'investing',
        intro:   "Tell me your investment thesis or time horizon and I'll scan for long-term portfolio candidates.",
        hint:    'Share your thesis, sector focus, or time horizon to start.',
    },
    scan: {
        profile: null,   // user picks the lens
        intro:   null,   // use Argus default
        hint:    null,
    },
}

// A pipeline's copy is either a fixed string or a function of the hand-off destination. Resolving
// here keeps the two shapes out of the render, and keeps a desk that has nothing to say (null) null
// rather than turning it into the string "null".
const copyFor = (value, dest) => (typeof value === 'function' ? value(dest) : value)

// Compose the natural-language message from the selected angle labels. One angle →
// a plain "Scan for X"; several → the intersection thesis ("names that fit both /
// all of these") so the agent looks for names satisfying every selected setup.
function buildAnglePrompt(labels) {
    const phrases = ANGLES.filter(a => labels.includes(a.label)).map(a => a.phrase)
    if (phrases.length === 0) return ''
    if (phrases.length === 1) return `Scan for ${phrases[0]}`
    const tail = phrases.length === 2 ? 'names that fit both angles' : 'names that fit all of these angles'
    return `Scan for ${phrases.join(' + ')} — ${tail}`
}

// Multi-select setup chips + a "Scan these" send button, shown as a footer strip
// while the agent is still in the thesis phase. Tapping a chip toggles it; the
// button composes the selected angles into one scan.
function AngleChips({ selected, onToggle, onScan, disabled }) {
    return (
        <>
            <div className="scanner-panel__angles">
                {ANGLES.map(a => {
                    const on = selected.has(a.label)
                    return (
                        <button
                            key={a.label}
                            className={`scanner-panel__angle${on ? ' scanner-panel__angle--on' : ''}`}
                            onClick={() => onToggle(a.label)}
                            disabled={disabled}
                            aria-pressed={on}
                        >
                            {a.label}
                        </button>
                    )
                })}
            </div>
            {selected.size > 0 && (
                <button className="scanner-panel__angles-go" onClick={onScan} disabled={disabled}>
                    Scan {selected.size === 1 ? 'this' : 'these'} ({selected.size}) →
                </button>
            )}
        </>
    )
}

const MessageBubble = ({ msg, onTickerSelect, phaseLabels = SCAN_PHASE_LABELS }) => (
    <ChatBubble
        msg={msg}
        phaseLabels={phaseLabels}
        phaseTotal={4}
        onTickerSelect={onTickerSelect}
    />
)

export function ScannerPanel({ pipeline = null, onTickerSelect, onGenerateList, onUpdateList, onResearchList, onResearchLater, sleeveRun = null, onSkipSleeve, onLoadingChange, chatRestore = null, scanSeed = null, handoff = false, handoffTo = null, autoHandoff = false, onSendPick, onDismissHandoff, resumeRef = null }) {
    const pipelineCfg = PIPELINE_CONFIG[pipeline] ?? PIPELINE_CONFIG.scan
    // The desk the pick goes on to, as the user should read it. Falls back to no name rather than a
    // guess — every surface here degrades to "hand it on", which is vague but never wrong.
    const destBrand = AGENTS[handoffTo]?.brand ?? null
    const chat = useChatStream()
    const { messages, setMessages } = chat

    // Report streaming state up so the agent-bar "live" dot can pulse for Argus.
    useEffect(() => { onLoadingChange?.(chat.isLoading) }, [chat.isLoading])   // eslint-disable-line react-hooks/exhaustive-deps

    const [pendingScan,    setPendingScan]    = useState(null)
    // A just-generated investing list, held only to offer the research hand-off (see handleGenerate).
    const [researchOffer,  setResearchOffer]  = useState(null)
    // Mid-run, a turn that ended with no list. The run advances on a list coming back, so this is the
    // state where it has stopped moving and only the user can decide what that means: answer Argus's
    // question, or accept that the pond was empty and skip the sleeve.
    const [sleeveStalled,  setSleeveStalled]  = useState(false)
    const inSleeveRun = !!sleeveRun?.active
    // Live mirror: onDone fires long after the render that armed it, and whether we are mid-run is
    // the thing it has to be right about (same reason profileRef exists below).
    const inRunRef = useRef(inSleeveRun)
    inRunRef.current = inSleeveRun
    // Did THIS turn produce a list? Read once the turn is over (_endTurn) to tell "the sleeve is
    // done" apart from "the sleeve is stuck".
    const settledRef = useRef(false)
    const [editingScanId,  setEditingScanId]  = useState(null)
    const [editDirty,      setEditDirty]      = useState(false)
    const [selectedAngles, setSelectedAngles] = useState(() => new Set())
    // Profile: locked by pipeline context (trade → trading, portfolio → investing)
    // or user-selectable (scan desk). In hand-off mode always trading.
    const [profile,        setProfile]        = useState(() => pipelineCfg.profile ?? 'trading')
    const profileRef = useRef(profile)      // live mirror so a seed-set profile reaches the same-tick _send
    profileRef.current = profile
    // The single pick emitted at the end of a hand-off scan → the hand-off button. Named for the
    // `<kairos_pick>` wire tag it carries, which outlived the desk it was named after.
    const [kairosPick,     setKairosPick]     = useState(null)
    // Auto mode: hand the settled pick straight on rather than offering it. Waits for the turn to
    // end — a pick still being written is not yet a pick. `kairosPick` is deliberately left set: the
    // hand-off remounts this panel, and clearing it here would flash the generate bar on the way out.
    useEffect(() => {
        if (!autoHandoff || chat.isLoading || !kairosPick) return
        onSendPick?.(kairosPick, { viaUser: false })
    }, [autoHandoff, chat.isLoading, kairosPick])   // eslint-disable-line react-hooks/exhaustive-deps
    // Reopen a saved list to edit it (clicked from its pencil): restore the chat,
    // enter edit mode, and prime the pending list with its current contents so the
    // agent can refine it and "Update list" persists back to the same scan.
    useEffect(() => {
        if (!chatRestore) return
        setMessages(chatRestore.messages ?? [])
        setEditingScanId(chatRestore.scanId ?? null)
        setPendingScan(chatRestore.scan ?? null)
        setEditDirty(false)
        setSelectedAngles(new Set())
        // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when a new restore is pushed (keyed by .key)
    }, [chatRestore?.key])

    const pendingTickersRef = useRef([])
    const threadIdRef       = useRef(newThreadId())   // scan construction draft thread

    // Kairos hand-off seed: MainPage remounts this panel fresh (chatResetKey) then pushes a
    // constraints message (direction/horizon/window). We just send it — Argus reads the constraints
    // and asks for the scan angle, exactly as if the user opened a fresh scan. Keyed so it fires once.
    // Fires once per seed key — but WAITS for any turn in flight, because _send bails while
    // chat.isLoading. A sleeve run seeds the next sector from inside the previous one's onDone, which
    // runs BEFORE the stream's finally, so a fire-and-forget seed would silently do nothing. It used
    // to survive only because the panel was remounted, and the remount is what wiped the transcript.
    const seededKeyRef = useRef(null)
    useEffect(() => {
        if (!scanSeed?.message || chat.isLoading) return
        if (seededKeyRef.current === scanSeed.key) return
        seededKeyRef.current = scanSeed.key
        // Atlas → Argus investing hand-off carries the profile; set it (ref first so this same-tick send uses it).
        if (scanSeed.profile === 'investing' || scanSeed.profile === 'trading') { profileRef.current = scanSeed.profile; setProfile(scanSeed.profile) }
        _send(scanSeed.message)
    }, [scanSeed?.key, chat.isLoading])   // eslint-disable-line react-hooks/exhaustive-deps


    /**
     * Settle a finished turn's list. Shared by the normal send and the resume path — they used to
     * carry the same block twice, and the run's advance lived inside it.
     *
     * Mid-run the ABSENCE of a list is the case that matters: Argus answering "nothing worth owning
     * here", asking for the angle, or having its block cut short all land here, and each one used to
     * park the queue with nothing on screen to say so. The scan is passed explicitly — the state set
     * above is not readable in this closure.
     */
    function _settleScan(data) {
        if (!data.scan?.candidates?.length) return
        settledRef.current = true
        setPendingScan(data.scan)
        setSleeveStalled(false)
        // In a SLEEVE RUN nobody is steering between sectors — Atlas routed several at once and
        // the point is that it runs through. A complete list saves itself and hands control back
        // rather than waiting on a press no one is here to make.
        if (inRunRef.current) handleGenerate({ scan: data.scan })
    }

    /**
     * Close out a turn. Mid-run, a turn that ended with NO list is where the queue stops moving —
     * Argus answering "nothing worth owning here", asking for the angle, a block cut short, a failed
     * request, or the user pressing Stop. Checked here rather than in onDone because the abort and
     * error paths never reach onDone at all, and they strand the run just as thoroughly.
     */
    function _endTurn() {
        chat.endStream()
        if (inRunRef.current && !settledRef.current) setSleeveStalled(true)
    }

    async function _send(text) {
        if (!text || chat.isLoading) return
        setEditDirty(true)
        setKairosPick(null)   // a new turn supersedes any prior hand-off pick
        setResearchOffer(null)
        setSleeveStalled(false)   // a new turn is a fresh chance at this sleeve's list
        settledRef.current = false
        // NOTE: the chip selection is intentionally NOT cleared here — it persists as
        // "marked" so that after a scan the user can see their prior pick and refine it.
        // It's reset only on Clear or when a saved list is restored.

        const history = toChatHistory(messages)
        history.push({ role: 'user', content: text })

        pendingTickersRef.current = []

        const { signal, handlers } = chat.begin(text, {
            onTicker: (symbol) => {
                if (!pendingTickersRef.current.includes(symbol)) pendingTickersRef.current.push(symbol)
            },
            onDone: (data) => {
                const tickers = [...pendingTickersRef.current]
                pendingTickersRef.current = []
                chat.finishStreaming({ role: 'assistant', content: data.reply, tickers })
                _settleScan(data)
                if (data.kairos_pick) setKairosPick(data.kairos_pick)   // hand-off: single pick → button
                // Construction only: persist the scan-building conversation as a draft thread.
                // The backend enforces the substantive floor (scanner = past nucleus) + TTL.
                if (!editingScanId) {
                    threadsService.saveDraft({
                        threadId: threadIdRef.current, agent: 'scanner',
                        messages: [...history, { role: 'assistant', content: data.reply }],
                        phase: data.phase ?? null, subjectType: 'scan',
                        state: data.scan ? { scan: data.scan } : null,
                    })
                }
            },
        })

        try {
            await scannerService.sendStream(history, {
                model:           readStoredModel('scannerModel'),
                reasoningEffort: readStoredReasoning('scannerReasoning'),
                routingMode:     readStoredRoutingMode('scannerRoutingMode'),
                currentPhase:    chat.phase,
                // When editing, tell the agent the list's current contents so it can
                // add / remove / change names against it.
                editList:        editingScanId ? (pendingScan || null) : null,
                handoff,     // hand-off mode: find ONE ticker, emit <kairos_pick>
                handoffTo,   // …and which desk it goes to, so Argus's prose names the right one
                profile:         handoff ? 'trading' : profileRef.current,   // Investing profile → the Analyst
                signal,
                ...handlers,
            })
        } catch (err) {
            console.error('[scanner]', err)
            chat.freezeError()
        } finally {
            _endTurn()
        }
    }

    // Resume a stopped reply in place: send the conversation ending with the partial
    // assistant turn as a prefill so the model continues the SAME bubble.
    async function _continue() {
        if (chat.isLoading) return
        const last = messages[messages.length - 1]
        if (!last || last.role !== 'assistant' || !last.stopped) return
        const base = chat.resumeBase()   // '' = stopped before any token → regenerate
        setEditDirty(true)
        settledRef.current = false   // the resumed turn owes this sleeve a list of its own

        // Continuing: history ends with the partial as an assistant prefill. Regenerating (empty
        // base): it ends at the user turn. finalizeResumeHistory decides which.
        const history = chat.finalizeResumeHistory(
            toChatHistory(messages),
            base,
        )

        pendingTickersRef.current = []
        const cont = chat.beginContinue({
            onTicker: (symbol) => {
                if (!pendingTickersRef.current.includes(symbol)) pendingTickersRef.current.push(symbol)
            },
            onError: () => chat.restoreStopped(base),   // keep the partial + Continue on failure
            onDone: (data) => {
                const tickers = [...pendingTickersRef.current]
                pendingTickersRef.current = []
                const content = base + data.reply
                chat.finishStreaming({ role: 'assistant', content, tickers })
                _settleScan(data)
                if (data.kairos_pick) setKairosPick(data.kairos_pick)
                if (!editingScanId) {
                    threadsService.saveDraft({
                        threadId: threadIdRef.current, agent: 'scanner',
                        messages: [...history.slice(0, -1), { role: 'assistant', content }],
                        phase: data.phase ?? null, subjectType: 'scan',
                        state: data.scan ? { scan: data.scan } : null,
                    })
                }
            },
        })
        if (!cont) return   // nothing continuable

        try {
            await scannerService.sendStream(history, {
                model:           readStoredModel('scannerModel'),
                reasoningEffort: readStoredReasoning('scannerReasoning'),
                routingMode:     readStoredRoutingMode('scannerRoutingMode'),
                currentPhase:    chat.phase,
                editList:        editingScanId ? (pendingScan || null) : null,
                handoff,
                profile:         handoff ? 'trading' : profileRef.current,
                signal:          cont.signal,
                ...cont.handlers,
            })
        } catch (err) {
            console.error('[scanner]', err)
            chat.restoreStopped(base)
        } finally {
            _endTurn()
        }
    }

    // Multi-select setup chips: tapping toggles a label; "Scan these" composes the
    // selected angles into one message and sends it, then clears the selection.
    function toggleAngle(label) {
        setSelectedAngles(prev => {
            const next = new Set(prev)
            next.has(label) ? next.delete(label) : next.add(label)
            return next
        })
    }
    function scanSelectedAngles() {
        const prompt = buildAnglePrompt([...selectedAngles])
        if (prompt) _send(prompt)   // _send clears the selection
    }

    function handleClear() {
        chat.reset()
        setPendingScan(null)
        setKairosPick(null)
        setEditingScanId(null)
        setEditDirty(false)
        setSelectedAngles(new Set())
        threadIdRef.current = newThreadId()   // fresh construction thread; abandoned draft TTL-expires
    }

    // Resume an unfinished scan-building draft: restore its conversation (+ last list)
    // and keep writing to the SAME thread.
    async function handleResumeThread(threadId) {
        const t = await threadsService.getThread(threadId)
        if (!t) return
        setMessages(t.messages ?? [])
        setPendingScan(t.state?.scan ?? null)
        setEditingScanId(null)
        setEditDirty(false)
        threadIdRef.current = t.threadId
    }
    // Expose resume to the shared agent-bar hamburger (MainPage).
    if (resumeRef) resumeRef.current = handleResumeThread

    // `thenResearch` collapses save-then-hand-off into ONE press. In the portfolio pipeline a saved
    // list is never the goal — the names are — so making the user press "Generate list" and then
    // "Send to research" was one button asking them to confirm a step they never wanted separately.
    // The list is still saved either way: it carries the lens and the provenance, and it holds the
    // names that did NOT get queued, which is what "also do KLAC" reads from later.
    async function handleGenerate({ thenResearch = false, thenLeave = false, scan: given = null } = {}) {
        // Explicit `scan` for the auto path: it fires from inside onDone, where the state just set is
        // not yet readable. Manual presses read the state as before.
        const scan = given ?? pendingScan
        if (!scan) return
        // Persist the conversation alongside the list so reopening it returns here. Chart rows are
        // dropped: a chart the user asked to LOOK at is not part of the list, and persisting one as
        // a content-less turn would reopen the thread with an empty bubble in it.
        const chatLog = messages
            .filter(m => !m.streaming && m.type !== 'chart')
            .map(m => ({ role: m.role, content: m.content, ...(m.tickers?.length ? { tickers: m.tickers } : {}) }))

        if (editingScanId) {
            // Update the existing list in place; stay in edit mode for more refining.
            await onUpdateList?.(editingScanId, { ...scan, chat: chatLog })
            // A refined investing list has the same next step as a fresh one — the names still owe
            // Prometheus a look. Offering it only on first generation meant anyone who tightened
            // their list lost the hand-off for having improved it.
            //
            // `scan`, not `pendingScan`: on the auto path the list arrives as an argument because the
            // state set moments earlier is not yet readable here, so reading state back would offer
            // the list as it was BEFORE the update and send the superseded names to research.
            if (profileRef.current === 'investing') setResearchOffer(scan)
        } else {
            await onGenerateList?.({ ...scan, chat: chatLog }, threadIdRef.current)
            // An INVESTING list is not the end of the road — the names are meant to go to Prometheus
            // for coverage and then back to Atlas. Hold the list so the hand-off can be offered right
            // here, instead of making the user go find the saved card to click names one at a time.
            if (profileRef.current === 'investing') {
                if (thenResearch) onResearchList?.(scan)
                // `thenLeave` is the save-and-go path — setting an offer we are walking away from
                // would leave one primed behind us for no one. Mid-RUN is the same case: the run
                // pools every sleeve and hands over once at the end, so a per-sector offer left
                // behind here would re-enter Prometheus with this one sector and drop the others.
                else if (!thenLeave && !inRunRef.current) setResearchOffer(scan)
            }
            setPendingScan(null)
            if (thenLeave) onResearchLater?.()
            threadIdRef.current = newThreadId()   // next scan build gets a fresh draft thread
        }
    }

    const listReady = !!pendingScan && pendingScan.candidates?.length > 0
    const showChangedMind = !!editingScanId && !editDirty
    // In edit mode there's ALWAYS an enabled escape (leave without saving), shown at the end of
    // every turn and after a Stop — next to "Update list" instead of only before the first edit.
    const laterBtn = editingScanId ? <LaterButton onClick={handleClear} /> : null
    // A stopped reply with real text can be resumed in place.
    // Argus has FINISHED at least one Phase-1 turn (not merely started+stopped). Gates
    // the setup chips so they don't pop up when the user stops before Argus has asked
    // anything — but still show (with prior picks marked) once a real turn has landed.
    const hasCompletedArgusTurn = messages.some(m => m.role === 'assistant' && !m.streaming && !m.stopped && !!(m.content && m.content.trim()))
    // Every ANGLE is a trading setup (momentum, breakouts, squeezes) — the wrong question to put in
    // front of a portfolio scan, where the thesis is a sector mandate or a horizon and Atlas usually
    // supplied it already. So the strip belongs to the trading lens only.
    const showAngleStrip = !chat.isLoading && !editingScanId && profile !== 'investing'
        && chat.phase === 1 && !listReady && hasCompletedArgusTurn

    return (
        <div className="portfolio-panel scanner-panel">
            {listReady && (
                <div className="portfolio-panel__build-summary">
                    <div className="portfolio-panel__build-summary-header">
                        <span className="portfolio-panel__build-summary-title">{editingScanId ? 'editing list —' : 'your list —'}</span>
                        <span className="portfolio-panel__build-summary-name">{pendingScan.thesis}</span>
                        {pendingScan.period?.label && (
                            <span className="scanner-panel__period-chip">{pendingScan.period.label}</span>
                        )}
                        <span className="portfolio-panel__build-summary-count">
                            {pendingScan.candidates.length} {pendingScan.candidates.length === 1 ? 'asset' : 'assets'}
                        </span>
                    </div>
                    <div className="portfolio-panel__build-summary-items">
                        {pendingScan.candidates.map(c => (
                            <span key={c.ticker} className="portfolio-panel__build-summary-item">
                                <span className={`scanner-panel__dir scanner-panel__dir--${c.direction}`}>
                                    {c.direction === 'short' ? '▾' : '▴'}
                                </span>
                                <span className="portfolio-panel__build-summary-asset">{c.ticker}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <AgentMessages chat={chat} watch={`${listReady}|${!!editingScanId}`}>
                {messages.length === 0 && (
                    editingScanId ? (
                        <div className="portfolio-panel__empty">
                            Editing your list — ask me to add, remove, or change names, then hit Update list.
                        </div>
                    ) : (
                        <AgentIntro
                            agent={AGENTS.scanner}
                            introOverride={copyFor(pipelineCfg.intro, destBrand)}
                            hintOverride={copyFor(pipelineCfg.hint, destBrand)}
                        />
                    )
                )}
                {messages.map((msg, i) => (
                    <MessageBubble
                        key={i}
                        msg={msg}
                        onTickerSelect={onTickerSelect}
                        phaseLabels={handoff ? PICK_PHASE_LABELS : SCAN_PHASE_LABELS}
                    />
                ))}
                {chat.isLoading && <ToolStatusChip label={waitingLabel({ messages, streamStatus: chat.streamStatus, placeholder: 'scanning…' })} pulse={chat.reasoningPulse} />}

                {(chat.isLoading || messages.some(m => m.role === 'assistant' && m.content)) && (
                    <AgentTurnTag agent={AGENTS.scanner} active={chat.isLoading} />
                )}

            </AgentMessages>

            {/* Thesis-phase angle strip — once the user has started but the agent is
                still nailing down the thesis (Phase 1), keep the famous setups one tap
                away. Hidden as soon as discovery begins or a list is forming. */}
            {showAngleStrip && (
                <div className="scanner-panel__angles-bar">
                    <span className="scanner-panel__angles-hint scanner-panel__angles-hint--inline">scan by setup:</span>
                    <AngleChips selected={selectedAngles} onToggle={toggleAngle} onScan={scanSelectedAngles} disabled={chat.isLoading} />
                </div>
            )}

            {/* Hand-off: Argus settled on a single pick → send it on or dismiss. In auto the
                conveyor takes it on its own, so there is nothing here to press. The label names the
                desk that will actually receive it — see destBrand. */}
            {!chat.isLoading && kairosPick && !autoHandoff && (
                <div className="portfolio-panel__action-bubble">
                    <button
                        className="portfolio-panel__review-btn portfolio-panel__review-btn--update"
                        onClick={() => onSendPick?.(kairosPick)}
                    >
                        {destBrand ? `Send to ${destBrand}` : 'Send it on'} · {kairosPick.ticker}{kairosPick.direction ? ` · ${kairosPick.direction}` : ''}
                    </button>
                    <button
                        className="portfolio-panel__review-btn portfolio-panel__review-btn--later"
                        onClick={() => onDismissHandoff?.()}
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Action bar — a footer below the scroll area (not inside it) so it stays
                pinned above the input without ever covering the messages. */}
            {/* SLEEVE RUN — where we are in it. Atlas routes three or four sectors at once and Argus
                walks them unattended, so without this the user watches it start talking again with
                no idea a queue exists or how much of it is left. The skip appears only once a turn
                has ended with no list: that is the moment the run has stopped moving and the choice
                (answer Argus, or accept the empty pond) is genuinely theirs. */}
            {inSleeveRun && (
                <div className="scanner-panel__sleeve-run">
                    <span className="scanner-panel__sleeve-run-pos">
                        Sleeve {sleeveRun.index} of {sleeveRun.total}{sleeveRun.label ? ` · ${sleeveRun.label}` : ''}
                    </span>
                    {!chat.isLoading && sleeveStalled && (
                        <>
                            <span className="scanner-panel__sleeve-run-hint">
                                No list came back for this one. Answer Argus to try again, or record it as empty and move on.
                            </span>
                            <button
                                className="portfolio-panel__review-btn portfolio-panel__review-btn--later"
                                onClick={() => { setSleeveStalled(false); onSkipSleeve?.() }}
                            >
                                {sleeveRun.index < sleeveRun.total ? 'Nothing here — next sleeve →' : 'Nothing here — finish the run →'}
                            </button>
                        </>
                    )}
                </div>
            )}
            {/* Investing list generated → send the top of it to research. Argus ranked them, so the
                top slice is the part worth Prometheus's time (it researches few and deep, and each
                name is a full coverage cycle). The rest stay on the saved list and can be asked for
                by name once the user is in Prometheus. */}
            {!chat.isLoading && researchOffer?.candidates?.length > 0 && (
                <div className="portfolio-panel__action-bubble">
                    <button
                        className="portfolio-panel__review-btn portfolio-panel__review-btn--update"
                        onClick={() => { onResearchList?.(researchOffer); setResearchOffer(null) }}
                    >
                        Send top {Math.min(RESEARCH_TOP_N, researchOffer.candidates.length)} to research →
                    </button>
                    {/* Declining research after a FRESH generate is the end of the road for this
                        list, so it lands where a finished list always did — the hub. Clearing the
                        offer in place would strand the user in a scanner with nothing left to do.

                        Mid-EDIT it is the opposite: the session is still open (the list is still
                        pending, "Update list" is still the next press), so leaving would abandon an
                        edit the user never finished. There, declining just puts the offer away and
                        hands the footer back to the edit bar. */}
                    <button
                        className="portfolio-panel__review-btn portfolio-panel__review-btn--later"
                        onClick={() => { setResearchOffer(null); if (!editingScanId) onResearchLater?.() }}
                    >
                        Not now
                    </button>
                </div>
            )}

            {/* A pending hand-off OWNS the footer, the same way a Kairos pick does. Updating an
                investing list leaves both live at once — the list stays pending so the edit session
                can continue — and the two bars stack into four buttons asking two different
                questions, two of which navigate away. The offer is the one that just appeared, so it
                answers first; declining it brings this bar straight back. */}
            {!chat.isLoading && !kairosPick && !researchOffer && (!!editingScanId || listReady) && (
                <div className="portfolio-panel__action-bubble">
                    {/* "Update/Generate list" only once there's a ready list; the "I'll do it later"
                        escape is always present in edit mode. */}
                    {!showChangedMind && listReady && (
                        profile === 'investing' && !editingScanId ? (
                            // The pipeline's one press: save the list AND send the top of it on.
                            <>
                                <button
                                    className="portfolio-panel__review-btn portfolio-panel__review-btn--update"
                                    onClick={() => handleGenerate({ thenResearch: true })}
                                >
                                    Send top {Math.min(RESEARCH_TOP_N, pendingScan?.candidates?.length ?? 0)} to research →
                                </button>
                                {/* For the rarer case: keep the list, research later. Saves exactly as
                                    before and lands in the hub, which is where a finished list went. */}
                                <button
                                    className="portfolio-panel__review-btn portfolio-panel__review-btn--later"
                                    onClick={() => handleGenerate({ thenLeave: true })}
                                >
                                    Save list only
                                </button>
                            </>
                        ) : (
                            <button className="portfolio-panel__review-btn portfolio-panel__review-btn--update" onClick={() => handleGenerate()}>
                                {editingScanId ? 'Update list' : 'Generate list'}
                            </button>
                        )
                    )}
                    {laterBtn}
                </div>
            )}

            {!handoff && pipelineCfg.profile === null && (
                <div className="scanner-panel__profiles" role="group" aria-label="Scan lens">
                    <span className="scanner-panel__profiles-label">lens</span>
                    <button
                        type="button"
                        className={`scanner-panel__profile-chip${profile === 'trading' ? ' is-active' : ''}`}
                        onClick={() => setProfile('trading')}
                        disabled={chat.isLoading}
                        title="Technical / catalyst setups → build a Kairos trade"
                    >Trading</button>
                    <button
                        type="button"
                        className={`scanner-panel__profile-chip${profile === 'investing' ? ' is-active' : ''}`}
                        onClick={() => setProfile('investing')}
                        disabled={chat.isLoading}
                        title="Fundamental / quality candidates → research in the Analyst"
                    >Investing</button>
                </div>
            )}

            <AgentChatInput
                chat={chat}
                placeholder="What should I scan for? (Enter to send, Shift+Enter for newline)"
                onSend={_send}
                onClear={handleClear}
                onResume={_continue}
            />
        </div>
    )
}

ScannerPanel.propTypes = {
    pipeline:        PropTypes.string,
    onTickerSelect:  PropTypes.func.isRequired,
    onGenerateList:  PropTypes.func,
    onUpdateList:    PropTypes.func,
    sleeveRun:       PropTypes.object,   // { active, index, total, label } — the Atlas→Argus run
    onSkipSleeve:    PropTypes.func,
    onLoadingChange: PropTypes.func,
    chatRestore:     PropTypes.object,
    scanSeed:        PropTypes.object,
    handoff:         PropTypes.bool,
    handoffTo:       PropTypes.string,   // the receiving desk's agent key ('mentor' | 'kairos')
    autoHandoff:     PropTypes.bool,     // conveyor in auto: hand the pick on without the offer
    onSendPick:      PropTypes.func,
    onDismissHandoff: PropTypes.func,
}
