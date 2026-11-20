import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { useAuth } from '../../context/AuthContext.jsx'
import { useSession } from '../../customHooks/useSession.js'
import { useSharedSession } from '../../context/SessionContext.jsx'
import { useChatScroll } from '../../customHooks/useChatScroll.js'
import { reasoningLength } from '../../services/reasoning.service.js'
import { useMicInput } from '../../customHooks/useMicInput.js'
import { lastTapOptions } from '../../services/session/sessionReducer.js'
import { toolStatusLabel } from '../../services/toolStatusLabels.js'
import { ChatBubble } from '../ChatBubble.jsx'
import { ChatInputRow } from '../ChatInputRow.jsx'
import { SuggestionChips } from '../SuggestionChips.jsx'
import { ToolStatusChip } from '../ToolStatusChip/ToolStatusChip.jsx'
import { readWaitingLines } from './readWaiting.js'
import { ChatChartDock } from '../ChatChartDock.jsx'
import { TimelineRow, SpeakerTag } from './TimelineRow.jsx'
import { startsRun, isEndedLine, isFreshEndedLine, isOffScreen } from './timelineRows.js'
import { speakerOf } from '../AxlHub/agentMeta.jsx'
import { AxlGreeting } from './AxlGreeting.jsx'
import { SessionHistory } from './SessionHistory.jsx'
import { ChatInfo } from './ChatInfo.jsx'
import { VIEW_LABELS } from './ShowOffer.jsx'
import { PaneToggle } from '../SidePane/PaneToggle.jsx'
import { ChatActionSlot } from '../SidePane/ChatActions.jsx'
import { MentorTradeChart } from '../MentorSurface/MentorTradeChart.jsx'
import { tradeChartSetup, tradeChartReady } from '../MentorSurface/mentorSurface.utils.js'
import { useReturnTo, openPanel, setReturnTo, panelMounted, nextReturnTo } from '../DetailPanel/detailPanel.store.js'
import { OPENING_OPTIONS, LANDING_ASKS, OPENING_QUESTION } from './openingOptions.js'
import { ModePicker } from './ModePicker.jsx'
import { QuestionCard } from './QuestionCard.jsx'
import { openCard, openMidCard } from './questionCard.utils.js'
import { BuildBar, BuildSummary } from './BuildSummary.jsx'
import { barBuild } from './buildSummary.utils.js'
import { modeOf, modeOption } from './mode.utils.js'
import { showErrorMsg } from '../../services/event-bus.service.js'
import './ChatTimeline.scss'

const firstName = (fullname = '') => String(fullname).trim().split(/\s+/)[0] || ''
const BRIEF_ASK = "Today's market brief, please."

/**
 * THE chat (unified-chat plan phase 7): one timeline where ONE assistant speaks — Axl, the role at work under his name
 * (one-axl.md, 2026-11-13); the server runs the hand-offs, and the user never sees them. Replaces Axl's hub.
 *
 * An empty session is Axl's opening question with taps (J5). The live turn streams in place under its
 * speaker; Stop is the shared turn stop. A decision card's taps are live only while the chain waits on that
 * card. Background desk cards are not drawn here — they live, and are acted on, in the social chat.
 *
 * The session is the one MainPage shares (SessionContext — the side pane and the doorways press the same one);
 * without a provider for this scope the timeline runs its own.
 *
 * @param {{ scope?: string, accounts?: object[], mainAccountId?: string|null, briefRequest?: number,
 *           onBriefStart?: Function, onOpenTicket?: Function, onOpenView?: Function }} props
 */
export function ChatTimeline(props) {
    const shared = useSharedSession(props.scope ?? 'main')
    return shared ? <TimelineView {...props} session={shared} /> : <OwnSessionTimeline {...props} />
}

function OwnSessionTimeline(props) {
    const session = useSession(props.scope ?? 'main')
    return <TimelineView {...props} session={session} />
}

function TimelineView({ scope = 'main', accounts = [], allAccounts = null, onPickAccounts = null, mainAccountId = null, briefRequest = 0, onBriefStart, onOpenTicket, onOpenView, desks = [], onOpenDesk, paneSurfaces = null, session }) {
    const { user } = useAuth()
    const { rows, live, queuedTurn, lastTurn, chain, floor, send, stop, cancelQueued, choose, startNew, loadError } = session
    // The analyst's reads in line for this chat — said until they land (readWaiting.js, Roy 2026-11-14).
    const readLines = readWaitingLines(session.waiting)
    // A builder at work while the user is with Axl (step 5a) — said on one line, never in the chat's live bubble.
    // A BUILD in the background says what it builds (step 5b), between its turns too; otherwise any builder at work behind.
    const buildingAgent = ['mentor', 'portfolio', 'analyst'].find(a => session.agentState?.[a]?.build?.status === 'building')
    const behindAgent = buildingAgent ?? session.background?.agent ?? null
    const behindTool = session.background?.agent === behindAgent && session.background?.tool ? toolStatusLabel(session.background.tool, session.background.targets) : null
    const behind = behindAgent
        ? `The ${(speakerOf(behindAgent).role ?? 'desk').toLowerCase()} is ${buildingAgent ? `building ${session.agentState[buildingAgent].build.title} in the background` : 'working in the background'}${behindTool ? ` — ${behindTool}` : ''}.`
        : null
    const [draft, setDraft]             = useState('')
    const [historyOpen, setHistoryOpen] = useState(false)
    // Info over the chat — a phone's (ChatInfo; the desktop Floor has its Info column). Stable: the sheet's Esc binds on it.
    const [infoOpen, setInfoOpen] = useState(false)
    const closeInfo = useCallback(() => setInfoOpen(false), [])
    // THE MODE (modes-and-builders.md M4): derived from the floor; the one just picked shows until the server's floor
    // arrives (a switch waits behind a running turn). It replaced "Ask something else" (2026-11-20): picking General is
    // how the user gets back to Axl.
    const mode = modeOf(floor ?? 'axl')
    const [pendingMode, setPendingMode] = useState(null)
    useEffect(() => { if (pendingMode && pendingMode === mode) setPendingMode(null) }, [pendingMode, mode])
    const inputRef = useRef(null)

    const busy  = !!live
    // A session a commit opened starts with the line saying what was saved (backend act.endAfterCommit) — it is
    // still a fresh start: Axl's greeting and taps, with that line above them. The line belongs to THAT moment only
    // (Roy, 2026-10-18): once the session has anything else in it — the first message — it is gone from the chat. And
    // only on the visit it was saved in (isFreshEndedLine, 2026-11-02): the session stays a fresh start either way.
    const empty = rows.every(isEndedLine) && !live
    const endedLines = rows.filter(r => isFreshEndedLine(r))
    const thread = useMemo(() => rows.filter(r => !isEndedLine(r) && !isOffScreen(r)), [rows])

    // The scroll follows rows AND the streaming text (the live bubble is not a row).
    const scrollItems = useMemo(() => (live ? [...rows, live] : rows), [rows, live])
    const { messagesRef, messagesEndRef, handleScroll } = useChatScroll(scrollItems, { watch: `${live?.text?.length ?? 0}|${reasoningLength(live?.reasoning)}|${live?.tool ?? ''}` })

    // The per-turn extras every desk reads: the marked accounts. The clock is added by the client service.
    const extras = useMemo(() => ({ accounts, mainAccountId }), [accounts, mainAccountId])

    // Mentor's plan on a chart, at the end of the thread, once it has a stop and a target — drawn from his state on the session,
    // so it stays in the conversation whether or not his pane is showing.
    // A trade built in the background is shown in its summary, not at the end of the thread (step 6).
    const mentorBuild = session.agentState?.mentor?.build?.status
    const tradeSetup = mentorBuild === 'building' || mentorBuild === 'ready' ? null : tradeChartSetup(session.agentState?.mentor ?? null, accounts.length, busy)
    const tradeReady = tradeChartReady(session.agentState?.mentor ?? null, accounts.length)

    // Allowed while another turn runs — it waits behind it, and a running chain pauses for it (G4). One
    // waiting message at a time.
    const sendText = useCallback(async (text, more = {}) => {
        const t = String(text ?? '').trim()
        if (!t || queuedTurn) return false
        setDraft('')
        return send(t, { ...extras, ...more })
    }, [send, extras, queuedTurn])

    // A build that is ready (or failed): its bar above the prompt box, and its summary when asked (step 6).
    const bar = scope === 'main' ? barBuild(session.agentState) : null
    const [summaryOpen, setSummaryOpen] = useState(false)
    useEffect(() => { if (!bar || bar.build.status !== 'ready') setSummaryOpen(false) }, [bar?.build?.id, bar?.build?.status]) // eslint-disable-line react-hooks/exhaustive-deps
    const reworkBar = useCallback(async (action, text = null) => {
        const r = await session.reworkBuild(bar.agent, action, text)
        if (!r.ok) showErrorMsg(r.message ?? 'That did not go through')
    }, [session, bar])

    // A builder's open question card (step 4) — shown while that builder is the mode.
    const card = scope === 'main' ? (openCard(rows, floor) ?? openMidCard(rows)) : null
    const answerCard = useCallback(async (answers, picked) => {
        // The account picked on the card is marked in the venue picker too, so the pane and the build agree.
        if (picked.length) onPickAccounts?.(picked.map(a => String(a.id)), String(picked[0].id))
        return session.answer(card.seq, answers, { accounts: picked, mainAccountId: picked[0] ? String(picked[0].id) : null })
    }, [session, card, onPickAccounts])

    const pickMode = useCallback(async (m) => {
        setPendingMode(m)
        const r = await session.setMode(m)
        if (!r.ok) { setPendingMode(null); showErrorMsg(r.message ?? 'Could not switch the mode') }
    }, [session])

    // What the user TYPED is theirs: a send that did not go through puts it back in the box.
    const sendDraft = useCallback(async () => {
        const typed = draft
        if (await sendText(typed) === false && typed.trim()) setDraft(d => d || typed)
    }, [draft, sendText])

    // The brief card / bus asked for today's brief — Axl's turn (J4).
    // One waiting message at a time: with one already waiting, the brief waits for it to start.
    useEffect(() => {
        if (!briefRequest || !session.sessionId || queuedTurn) return
        onBriefStart?.()
        send(BRIEF_ASK, { agent: 'axl', brief: true, ...extras })
    }, [briefRequest, session.sessionId, queuedTurn]) // eslint-disable-line react-hooks/exhaustive-deps

    // A show of a house VIEW — the heat map, the calendar — opens by itself as the reply ends (Roy, 2026-10-19: "show me
    // the calendar" should open it). On the LIVE turn's end only: lastTurn is set by the turn's own frames, never by a
    // load, so a reload or History does not reopen it — the row keeps its button for that.
    const openedFor = useRef(null)
    useEffect(() => {
        const show = lastTurn?.status === 'done' ? lastTurn.payload?.show : null
        if (!show || !VIEW_LABELS[show.kind] || openedFor.current === lastTurn.turnId) return
        openedFor.current = lastTurn.turnId
        onOpenView?.(show.kind, show.ref ?? null)
    }, [lastTurn]) // eslint-disable-line react-hooks/exhaustive-deps -- once per turn; the opener is read at that moment

    // Dictation goes out as a turn, read through a ref at fire time (useMicInput keeps its callback stable).
    const sendRef = useRef(sendText)
    sendRef.current = sendText
    const onTranscript = useCallback((text) => { if (text) sendRef.current(text) }, [])
    const { isRecording, isTranscribing, toggle: toggleMic, cancel: cancelMic } = useMicInput({ onTranscript })

    // The live decision: the last decision row, while the chain is waiting on the user.
    const openDecisionSeq = useMemo(() => {
        if (!chain || !['awaiting', 'paused', 'waiting'].includes(chain.status)) return null
        for (let i = rows.length - 1; i >= 0; i--) if (rows[i].kind === 'decision') return rows[i].seq
        return null
    }, [rows, chain])

    const taps = busy ? [] : lastTapOptions(rows)
    const failed = lastTurn && (lastTurn.status === 'error' || lastTurn.status === 'refused') && !busy
    // A running tool is named even under text already streamed — a desk that says one line and then checks twelve
    // names would otherwise go quiet for minutes (2026-10-19). With no tool, only an empty turn shows a chip.
    const waiting = !busy ? ''
        : live.tool ? toolStatusLabel(live.tool, live.targets)
        : live.text ? ''
        : live.status === 'queued' ? 'sending…' : 'thinking…'
    // ONE AXL (one-axl.md, 2026-11-13): the user is always talking with Axl; the role at work rides beside the name.
    const floorRole = speakerOf(floor ?? 'axl').role
    const floorName = floorRole ? `Axl · ${floorRole}` : 'Axl'
    const returnTo = useReturnTo()
    // The way back lives where the hand-off LANDED (code review 2026-10-24: it stayed on every chat until a reload) —
    // detailPanel.store nextReturnTo.
    const here = `${floor ?? 'axl'}|${session.sessionId ?? ''}`
    useEffect(() => {
        const next = nextReturnTo(returnTo, here)
        if (next !== returnTo) setReturnTo(next)
    }, [returnTo, here])
    // Only while something renders the list (the Floor's lists): a Back with nothing to open would do nothing, and leave
    // the panel to spring open later, unasked.
    const showBack = Boolean(returnTo) && panelMounted(returnTo.panel)
    const placeholder = mode === 'general' ? 'Ask Axl anything, or say what you’d like to do…'
        : `Tell the ${modeOption(mode).label.toLowerCase()} what you want to build…`

    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDraft() }
    }

    return (
        <div className="chat-timeline">
            <div className="panel-header chat-timeline__header">
                <span className="chat-timeline__title">{empty ? 'Chat' : <><span className="chat-timeline__title-lead">Talking with </span>{floorName}</>}</span>
                <span className="chat-timeline__actions">
                    {paneSurfaces && <PaneToggle floor={floor} surfaces={paneSurfaces} agentState={session.agentState} />}
                    <button type="button" className="chat-timeline__action chat-timeline__info-btn" onClick={() => setInfoOpen(true)}>Info</button>
                    <button type="button" className="chat-timeline__action" onClick={() => setHistoryOpen(true)}>History</button>
                    <button type="button" className="chat-timeline__action" onClick={() => startNew()} disabled={busy || empty}>New session</button>
                </span>
            </div>
            {/* Desks the chat does not route to yet — Pythia's, for an admin — opened beside it in the side pane
                (unified-chat phase 8e, K6; temporary, plan §1 q4). A row of their own under the header: beside History and
                New session they pushed the header off the narrow column the pane leaves. */}
            {onOpenDesk && desks.length > 0 && (
                <div className="chat-timeline__desks">
                    {desks.map(d => (
                        <button key={d.agent} type="button" className="chat-timeline__action chat-timeline__desk" onClick={() => onOpenDesk(d.agent)} title={d.title}>{d.label}</button>
                    ))}
                </div>
            )}

            {infoOpen && <ChatInfo floor={floor ?? 'axl'} agentState={session.agentState} rows={rows} onClose={closeInfo} />}
            {historyOpen && (
                <SessionHistory
                    scope={scope}
                    onClose={() => setHistoryOpen(false)}
                    // Writing in a past session picks it back up (design §3.5) — with the same per-turn extras as here.
                    onResume={(id, text) => session.resume(id, text, extras)}
                    // A turn running here would be cut off by the put-away — the History input waits for it.
                    busy={busy}
                />
            )}

            <div className={`chat-timeline__body${empty ? '' : ' chat-timeline__body--active'}`} ref={messagesRef} onScroll={handleScroll}>
                {loadError && <p className="chat-timeline__note chat-timeline__note--error">{loadError}</p>}

                {empty ? (
                    <div className="chat-timeline__empty">
                        {endedLines.map(r => <TimelineRow key={r.seq} row={r} onChoose={choose} />)}
                        <AxlGreeting name={firstName(user?.fullname)} question={OPENING_QUESTION} />
                        <SuggestionChips suggestions={OPENING_OPTIONS} onPick={(t) => sendText(t, { agent: 'axl' })} disabled={busy || !session.sessionId} />
                        {failed && <p className="chat-timeline__note chat-timeline__note--error">{lastTurn.message || 'That did not go through — try again.'}</p>}
                    </div>
                ) : (
                    <div className="chat-timeline__thread">
                        {thread.map((row, i) => (
                            <div key={row.seq} className={`chat-timeline__row chat-timeline__row--${row.role}${row.kind && row.kind !== 'msg' ? ` chat-timeline__row--${row.kind}` : ''}`}>
                                {startsRun(row, thread[i - 1]) && <SpeakerTag agent={row.agent} />}
                                <TimelineRow
                                    row={row}
                                    decisionOpen={row.seq === openDecisionSeq}
                                    onChoose={choose}
                                    onOpenTicket={onOpenTicket}
                                    onOpenView={onOpenView}
                                />
                            </div>
                        ))}

                        {/* The finished plan stays in the thread; the levels so far only while Mentor has the floor. */}
                        {tradeSetup && (tradeReady || floor === 'mentor') && <MentorTradeChart setup={tradeSetup} ready={tradeReady} />}

                        {behind && (
                            <div className="chat-timeline__row chat-timeline__row--assistant chat-timeline__row--waiting-read chat-timeline__row--behind">
                                <ToolStatusChip label={behind} />
                            </div>
                        )}
                        {readLines.map(l => (
                            <div key={l.key} className="chat-timeline__row chat-timeline__row--assistant chat-timeline__row--waiting-read">
                                <ToolStatusChip label={l.text} />
                            </div>
                        ))}

                        {busy && (
                            <div className="chat-timeline__row chat-timeline__row--assistant chat-timeline__row--live">
                                {startsRun({ role: 'assistant', agent: live.agent }, thread.at(-1)) && <SpeakerTag agent={live.agent} />}
                                {(live.text || live.reasoning) && (
                                    <ChatBubble msg={{ role: 'assistant', content: live.text, reasoning: live.reasoning, streaming: true }} />
                                )}
                                {waiting && <ToolStatusChip label={waiting} />}
                            </div>
                        )}

                        {queuedTurn && (
                            <div className="chat-timeline__row chat-timeline__row--user chat-timeline__row--queued">
                                <ChatBubble msg={{ role: 'user', content: queuedTurn.text }} />
                                <span className="chat-timeline__note">
                                    Sends when Axl finishes{chain?.status === 'running' ? ' — the chain will pause for it' : ''}.{' '}
                                    <button type="button" className="chat-timeline__link" onClick={cancelQueued}>Cancel</button>
                                </span>
                            </div>
                        )}

                        {failed && (
                            <p className="chat-timeline__note chat-timeline__note--error">
                                {lastTurn.message || 'That did not go through — try again.'}
                            </p>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            <ChatChartDock />

            {taps.length > 0 && <SuggestionChips suggestions={taps} onPick={(t) => sendText(t)} disabled={busy} />}

            {/* A desk's buttons (Generate, Update, Arm…) land here on a phone while its sheet is down (ChatActions). */}
            <ChatActionSlot />

            {showBack && (
                <div className="chat-timeline__address">
                    {/* The way back to the list a hand-off came from (Roy, 2026-10-24) — the Hotlist, on the horizon it was on. */}
                    <button type="button" className="chat-timeline__address-btn chat-timeline__back" onClick={() => openPanel(returnTo.panel, returnTo.resume ?? null)}>
                        ‹ Back to {returnTo.label}
                    </button>
                </div>
            )}

            {bar && summaryOpen && bar.build.status === 'ready' && (
                <BuildSummary
                    key={bar.build.id}
                    agent={bar.agent}
                    build={bar.build}
                    session={session}
                    accounts={accounts}
                    mainAccountId={mainAccountId}
                    onClose={() => setSummaryOpen(false)}
                    onError={(m) => showErrorMsg(m)}
                />
            )}
            {bar && <BuildBar agent={bar.agent} build={bar.build} open={summaryOpen} onOpen={() => setSummaryOpen(v => !v)}
                onRetry={() => reworkBar('retry')} onDrop={() => reworkBar('drop')} onChange={(t) => reworkBar('change', t)} busy={busy} />}

            {card && (
                <QuestionCard
                    key={card.seq}
                    card={card}
                    role={modeOption(card.agent).label}
                    accounts={allAccounts ?? accounts}
                    marked={accounts.map(a => String(a.id))}
                    main={mainAccountId}
                    onSubmit={answerCard}
                    busy={busy}
                />
            )}

            <ChatInputRow
                prefix="axl"
                empty={empty}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                textareaRef={inputRef}
                placeholder={placeholder}
                onSend={sendDraft}
                sendDisabled={!draft.trim() || !!queuedTurn || !session.sessionId}
                // Stop while a turn runs and the box is empty; typed text turns the button back into Send.
                isStreaming={busy && !draft.trim()}
                onStop={stop}
                onToggleMic={toggleMic}
                onCancelMic={cancelMic}
                isRecording={isRecording}
                isTranscribing={isTranscribing}
                micDisabled={busy || isTranscribing}
                textareaDisabled={isRecording}
                leading={scope === 'main' ? <ModePicker mode={mode} pending={pendingMode} onPick={pickMode} disabled={!session.sessionId} /> : null}
            />

            {empty && <SuggestionChips suggestions={LANDING_ASKS} variant="landing" onPick={(t) => sendText(t, { agent: 'axl' })} disabled={busy || !session.sessionId} />}
        </div>
    )
}

ChatTimeline.propTypes = {
    scope:         PropTypes.string,
    accounts:      PropTypes.array,
    // Every account in the workspace (a question card's account options) and the marking of the ones picked on it.
    allAccounts:   PropTypes.array,
    onPickAccounts: PropTypes.func,
    mainAccountId: PropTypes.string,
    briefRequest:  PropTypes.number,
    onBriefStart:  PropTypes.func,
    onOpenTicket:  PropTypes.func,
    onOpenView:    PropTypes.func,
    // Desks opened from the header (admin: Pythia) — `{ agent, label, title? }` — and the opener.
    desks:         PropTypes.arrayOf(PropTypes.shape({ agent: PropTypes.string.isRequired, label: PropTypes.string.isRequired, title: PropTypes.string })),
    onOpenDesk:    PropTypes.func,
    // The desks with a side-pane surface — given, the header offers Show / Hide for the pane (PaneToggle).
    paneSurfaces:  PropTypes.object,
}
OwnSessionTimeline.propTypes = ChatTimeline.propTypes
TimelineView.propTypes = { ...ChatTimeline.propTypes, session: PropTypes.object.isRequired }
