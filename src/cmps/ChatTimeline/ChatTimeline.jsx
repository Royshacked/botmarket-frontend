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
import { startsRun, agentMeta } from './timelineRows.js'
import { AxlGreeting } from './AxlGreeting.jsx'
import { SessionHistory } from './SessionHistory.jsx'
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
 * card. Background desk cards land here as rows drawn by the same bubble the social chat uses.
 *
 * The session is the one MainPage shares (SessionContext — the side pane and the doorways press the same one);
 * without a provider for this scope the timeline runs its own.
 *
 * @param {{ scope?: string, accounts?: object[], mainAccountId?: string|null, briefRequest?: number,
 *           onBriefStart?: Function, onOpenTicket?: Function }} props
 */
export function ChatTimeline(props) {
    const shared = useSharedSession(props.scope ?? 'main')
    return shared ? <TimelineView {...props} session={shared} /> : <OwnSessionTimeline {...props} />
}

function OwnSessionTimeline(props) {
    const session = useSession(props.scope ?? 'main')
    return <TimelineView {...props} session={session} />
}

function TimelineView({ scope = 'main', accounts = [], mainAccountId = null, briefRequest = 0, onBriefStart, onOpenTicket, session }) {
    const { user } = useAuth()
    const { rows, live, queuedTurn, lastTurn, chain, floor, send, stop, cancelQueued, choose, startNew, resolveCard, loadError } = session
    const [draft, setDraft]             = useState('')
    const [historyOpen, setHistoryOpen] = useState(false)
    // "Ask Axl" — the next message goes to Axl even though a desk holds the floor (the server's own rule is
    // that an unaddressed message goes to the floor-holder).
    const [toAxl, setToAxl]             = useState(false)
    const inputRef = useRef(null)

    const busy  = !!live
    const empty = rows.length === 0 && !live

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
    const waiting = busy && !live.text
        ? (live.tool ? toolStatusLabel(live.tool) : live.status === 'queued' ? 'sending…' : 'thinking…')
        : ''
    const floorName = agentMeta(floor ?? 'axl').brand
    const atDesk = (floor ?? 'axl') !== 'axl'
    const placeholder = !atDesk || toAxl ? 'Ask Axl anything, or say what you’d like to do…' : `Message ${floorName}…`

    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDraft() }
    }

    return (
        <div className="chat-timeline">
            <div className="panel-header chat-timeline__header">
                <span className="chat-timeline__title">{empty ? 'Chat' : `Talking with ${floorName}`}</span>
                <span className="chat-timeline__actions">
                    <button type="button" className="chat-timeline__action" onClick={() => setHistoryOpen(true)}>History</button>
                    <button type="button" className="chat-timeline__action" onClick={() => startNew()} disabled={busy || empty}>New session</button>
                </span>
            </div>

            {historyOpen && <SessionHistory scope={scope} onClose={() => setHistoryOpen(false)} />}

            <div className={`chat-timeline__body${empty ? '' : ' chat-timeline__body--active'}`} ref={messagesRef} onScroll={handleScroll}>
                {loadError && <p className="chat-timeline__note chat-timeline__note--error">{loadError}</p>}

                {empty ? (
                    <div className="chat-timeline__empty">
                        <AxlGreeting name={firstName(user?.fullname)} question={OPENING_QUESTION} />
                        <SuggestionChips suggestions={OPENING_OPTIONS} onPick={(t) => sendText(t, { agent: 'axl' })} disabled={busy || !session.sessionId} />
                        {failed && <p className="chat-timeline__note chat-timeline__note--error">{lastTurn.message || 'That did not go through — try again.'}</p>}
                    </div>
                ) : (
                    <div className="chat-timeline__thread">
                        {rows.map((row, i) => (
                            <div key={row.seq} className={`chat-timeline__row chat-timeline__row--${row.role}${row.kind && row.kind !== 'msg' ? ` chat-timeline__row--${row.kind}` : ''}`}>
                                {startsRun(row, rows[i - 1]) && <SpeakerTag agent={row.agent} />}
                                <TimelineRow
                                    row={row}
                                    decisionOpen={row.seq === openDecisionSeq}
                                    onChoose={choose}
                                    onResolveCard={resolveCard}
                                    onOpenTicket={onOpenTicket}
                                />
                            </div>
                        ))}

                        {busy && (
                            <div className="chat-timeline__row chat-timeline__row--assistant chat-timeline__row--live">
                                {startsRun({ role: 'assistant', agent: live.agent }, rows.at(-1)) && <SpeakerTag agent={live.agent} />}
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

            {atDesk && !empty && (
                <div className="chat-timeline__address">
                    <button type="button" className={`chat-timeline__address-btn${toAxl ? ' is-on' : ''}`} onClick={() => setToAxl(v => !v)} aria-pressed={toAxl}>
                        {toAxl ? `Back to ${floorName}` : 'Ask Axl instead'}
                    </button>
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
}
OwnSessionTimeline.propTypes = ChatTimeline.propTypes
TimelineView.propTypes = { ...ChatTimeline.propTypes, session: PropTypes.object.isRequired }
