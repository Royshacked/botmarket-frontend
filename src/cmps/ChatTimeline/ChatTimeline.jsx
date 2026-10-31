import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { useAuth } from '../../context/AuthContext.jsx'
import { useSession } from '../../customHooks/useSession.js'
import { useSharedSession } from '../../context/SessionContext.jsx'
import { useChatScroll } from '../../customHooks/useChatScroll.js'
import { useMicInput } from '../../customHooks/useMicInput.js'
import { lastTapOptions } from '../../services/session/sessionReducer.js'
import { toolStatusLabel } from '../../services/toolStatusLabels.js'
import { ChatBubble } from '../ChatBubble.jsx'
import { ChatInputRow } from '../ChatInputRow.jsx'
import { SuggestionChips } from '../SuggestionChips.jsx'
import { ToolStatusChip } from '../ToolStatusChip/ToolStatusChip.jsx'
import { ChatChartDock } from '../ChatChartDock.jsx'
import { TimelineRow, SpeakerTag } from './TimelineRow.jsx'
import { startsRun, agentMeta, isEndedLine } from './timelineRows.js'
import { AxlGreeting } from './AxlGreeting.jsx'
import { SessionHistory } from './SessionHistory.jsx'
import { ChatInfo } from './ChatInfo.jsx'
import { VIEW_LABELS } from './ShowOffer.jsx'
import { PaneToggle } from '../SidePane/PaneToggle.jsx'
import { ChatActionSlot } from '../SidePane/ChatActions.jsx'
import { useReturnTo, openPanel, setReturnTo, panelMounted, nextReturnTo } from '../DetailPanel/detailPanel.store.js'
import { OPENING_OPTIONS, LANDING_ASKS, OPENING_QUESTION } from './openingOptions.js'
import './ChatTimeline.scss'

const firstName = (fullname = '') => String(fullname).trim().split(/\s+/)[0] || ''
const BRIEF_ASK = "Today's market brief, please."

/**
 * THE chat (unified-chat plan phase 7): one timeline where every agent speaks under its own name, the
 * server runs the hand-offs, and the user just sees who is talking. Replaces Axl's hub.
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

function TimelineView({ scope = 'main', accounts = [], mainAccountId = null, briefRequest = 0, onBriefStart, onOpenTicket, onOpenView, desks = [], onOpenDesk, paneSurfaces = null, session }) {
    const { user } = useAuth()
    const { rows, live, queuedTurn, lastTurn, chain, floor, send, stop, cancelQueued, choose, startNew, loadError } = session
    const [draft, setDraft]             = useState('')
    const [historyOpen, setHistoryOpen] = useState(false)
    // Info over the chat — a phone's (ChatInfo; the desktop Floor has its Info column). Stable: the sheet's Esc binds on it.
    const [infoOpen, setInfoOpen] = useState(false)
    const closeInfo = useCallback(() => setInfoOpen(false), [])
    // "Ask Axl" — the next message goes to Axl even though a desk holds the floor (the server's own rule is
    // that an unaddressed message goes to the floor-holder).
    const [toAxl, setToAxl]             = useState(false)
    const inputRef = useRef(null)

    const busy  = !!live
    // A session a commit opened starts with the line saying what was saved (backend act.endAfterCommit) — it is
    // still a fresh start: Axl's greeting and taps, with that line above them. The line belongs to THAT moment only
    // (Roy, 2026-10-18): once the session has anything else in it — the first message — it is gone from the chat.
    const endedLines = rows.filter(isEndedLine)
    const empty = rows.length === endedLines.length && !live
    const thread = useMemo(() => rows.filter(r => !isEndedLine(r)), [rows])

    // The scroll follows rows AND the streaming text (the live bubble is not a row).
    const scrollItems = useMemo(() => (live ? [...rows, live] : rows), [rows, live])
    const { messagesRef, messagesEndRef, handleScroll } = useChatScroll(scrollItems, { watch: `${live?.text?.length ?? 0}|${live?.tool ?? ''}` })

    // The per-turn extras every desk reads: the marked accounts. The clock is added by the client service.
    const extras = useMemo(() => ({ accounts, mainAccountId }), [accounts, mainAccountId])

    // Allowed while another turn runs — it waits behind it, and a running chain pauses for it (G4). One
    // waiting message at a time.
    const sendText = useCallback(async (text, more = {}) => {
        const t = String(text ?? '').trim()
        if (!t || queuedTurn) return false
        setDraft('')
        const to = toAxl && !more.agent ? { agent: 'axl' } : {}
        setToAxl(false)
        return send(t, { ...extras, ...to, ...more })
    }, [send, extras, queuedTurn, toAxl])

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
    const floorName = agentMeta(floor ?? 'axl').brand
    const atDesk = (floor ?? 'axl') !== 'axl'
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
    const placeholder = !atDesk || toAxl ? 'Ask Axl anything, or say what you’d like to do…' : `Message ${floorName}…`

    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDraft() }
    }

    return (
        <div className="chat-timeline">
            <div className="panel-header chat-timeline__header">
                <span className="chat-timeline__title">{empty ? 'Chat' : `Talking with ${floorName}`}</span>
                <span className="chat-timeline__actions">
                    {paneSurfaces && <PaneToggle floor={floor} surfaces={paneSurfaces} />}
                    <button type="button" className="chat-timeline__action chat-timeline__info-btn" onClick={() => setInfoOpen(true)}>Info</button>
                    <button type="button" className="chat-timeline__action" onClick={() => setHistoryOpen(true)}>History</button>
                    <button type="button" className="chat-timeline__action" onClick={() => startNew()} disabled={busy || empty}>New session</button>
                </span>
            </div>
            {/* Desks the chat does not route to yet — Pythia's and Aether's, for an admin — opened beside it in the side pane
                (unified-chat phase 8e, K6; temporary, plan §1 q4). A row of their own under the header: beside History and
                New session they pushed the header off the narrow column the pane leaves. */}
            {onOpenDesk && desks.length > 0 && (
                <div className="chat-timeline__desks">
                    {desks.map(d => (
                        <button key={d.agent} type="button" className="chat-timeline__action chat-timeline__desk" onClick={() => onOpenDesk(d.agent)} title={d.title}>{d.label}</button>
                    ))}
                </div>
            )}

            {infoOpen && <ChatInfo floor={floor ?? 'axl'} onClose={closeInfo} />}
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
                                    Sends when {agentMeta(live?.agent ?? floor).brand} finishes{chain?.status === 'running' ? ' — the chain will pause for it' : ''}.{' '}
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

            {((atDesk && !empty) || showBack) && (
                <div className="chat-timeline__address">
                    {/* The way back to the list a hand-off came from (Roy, 2026-10-24) — the Hotlist, on the horizon it was on. */}
                    {showBack && (
                        <button type="button" className="chat-timeline__address-btn chat-timeline__back" onClick={() => openPanel(returnTo.panel, returnTo.resume ?? null)}>
                            ‹ Back to {returnTo.label}
                        </button>
                    )}
                    {atDesk && !empty && (
                        <button type="button" className={`chat-timeline__address-btn${toAxl ? ' is-on' : ''}`} onClick={() => setToAxl(v => !v)} aria-pressed={toAxl}>
                            {toAxl ? `Back to ${floorName}` : 'Ask Axl instead'}
                        </button>
                    )}
                </div>
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
            />

            {empty && <SuggestionChips suggestions={LANDING_ASKS} variant="landing" onPick={(t) => sendText(t, { agent: 'axl' })} disabled={busy || !session.sessionId} />}
        </div>
    )
}

ChatTimeline.propTypes = {
    scope:         PropTypes.string,
    accounts:      PropTypes.array,
    mainAccountId: PropTypes.string,
    briefRequest:  PropTypes.number,
    onBriefStart:  PropTypes.func,
    onOpenTicket:  PropTypes.func,
    onOpenView:    PropTypes.func,
    // Desks opened from the header (admin: Pythia, Aether) — `{ agent, label, title? }` — and the opener.
    desks:         PropTypes.arrayOf(PropTypes.shape({ agent: PropTypes.string.isRequired, label: PropTypes.string.isRequired, title: PropTypes.string })),
    onOpenDesk:    PropTypes.func,
    // The desks with a side-pane surface — given, the header offers Show / Hide for the pane (PaneToggle).
    paneSurfaces:  PropTypes.object,
}
OwnSessionTimeline.propTypes = ChatTimeline.propTypes
TimelineView.propTypes = { ...ChatTimeline.propTypes, session: PropTypes.object.isRequired }
