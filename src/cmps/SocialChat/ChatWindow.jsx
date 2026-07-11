import { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { eventBus, INVALIDATION_EDIT_IDEA, INVALIDATION_CLOSE_TRADE, PORTFOLIO_REVIEW, MANUAL_FILLED, ENTRY_CONFIRM_OPEN } from '../../services/event-bus.service'
import { manualService } from '../../services/manual/manual.service.remote'
import { kairosService } from '../../services/kairos/kairos.service.remote'
import { ChatInputRow } from '../ChatInputRow.jsx'
import { useMicInput } from '../../customHooks/useMicInput.js'
import { AGENTS, isBotId, CONVERSATIONAL_BOT_ID } from '../AxlHub/agentMeta.jsx'
import { AgentGlyph } from '../AxlHub/AgentBadges.jsx'

// Compact "from <agent>" attribution chip for notification cards: the agent's
// sigil + brand, tinted by its hue. Makes a card read as coming from Idea / Atlas
// (each specialist owns its own alerts and the card routes back to that agent).
function CardAgentTag({ agent }) {
    return (
        <span className={`social-chat__card-agent social-chat__card-agent--${agent.hue}`}>
            <AgentGlyph agentKey={agent.tab} icon={agent.icon} size={16} />
            <span>{agent.brand}</span>
        </span>
    )
}

function formatTime(ms) {
    if (!ms) return ''
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function ChatWindow({ conversation, messages, currentUserId, loading, hasMore, onClose, onSend, onLoadMore, onDismissMessage }) {
    const [draft,   setDraft]   = useState('')
    const [sending, setSending] = useState(false)
    const bottomRef  = useRef(null)
    const textareaRef = useRef(null)

    // Same mic-to-text as the agent chats; transcript is appended to the draft.
    const { isRecording, isTranscribing, toggle: toggleMic, cancel: cancelMic } = useMicInput({
        onTranscript: text => setDraft(d => (d ? `${d} ${text}` : text)),
    })

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    async function handleSend() {
        const text = draft.trim()
        if (!text || sending) return
        setDraft('')
        setSending(true)
        try { await onSend(text) } catch { /* ignore */ } finally { setSending(false) }
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
    }

    if (!conversation) {
        return (
            <div className="social-chat__window social-chat__window--empty">
                <p style={{ margin: 'auto' }}>Select a conversation</p>
            </div>
        )
    }

    // Specialist bot threads (Idea/Atlas/Argus) are notify-only feeds — you reply and edit
    // in that agent's own chat via the card, not here. Only Axl and human DMs are chattable.
    const otherId    = conversation.participants.find(p => p !== currentUserId) ?? ''
    const notifyBot  = isBotId(otherId) && otherId !== CONVERSATIONAL_BOT_ID
    const notifyName = notifyBot ? (AGENTS[otherId]?.brand ?? 'this agent') : null

    return (
        <div className="social-chat__window">
            <div className="social-chat__messages">
                {hasMore && (
                    <button className="social-chat__load-more" onClick={onLoadMore} disabled={loading}>
                        {loading ? 'Loading…' : 'Load earlier'}
                    </button>
                )}

                {messages.map(msg => {
                    const isMine = msg.senderId === currentUserId
                    return (
                        <div
                            key={msg.id}
                            className={`social-chat__msg ${isMine ? 'social-chat__msg--mine' : 'social-chat__msg--theirs'}`}
                        >
                            {msg.type === 'invalidation_alert' && msg.payload
                                ? <InvalidationAlertBubble msg={msg} onClose={onClose} onDismiss={onDismissMessage} />
                                : msg.type === 'portfolio_review' && msg.payload
                                ? <PortfolioReviewBubble msg={msg} onClose={onClose} />
                                : (msg.type === 'manual_entry' || msg.type === 'manual_exit') && msg.payload
                                ? <ManualFillCard msg={msg} onDismiss={onDismissMessage} />
                                : msg.type === 'entry_confirm' && msg.payload
                                ? <EntryConfirmBubble msg={msg} onClose={onClose} onDismiss={onDismissMessage} />
                                : msg.type === 'call_expiry' && msg.payload
                                ? <CallExpiryBubble msg={msg} onDismiss={onDismissMessage} />
                                : msg.type === 'call_manage' && msg.payload
                                ? <CallManageBubble msg={msg} onDismiss={onDismissMessage} />
                                : <div className="social-chat__msg-bubble">{msg.content}</div>
                            }
                            <div className="social-chat__msg-time">{formatTime(msg.createdAt)}</div>
                        </div>
                    )
                })}
                <div ref={bottomRef} />
            </div>

            {notifyBot ? (
                <div className="social-chat__notify-only">
                    Notifications from {notifyName}. Open a card to continue in {notifyName}&apos;s chat.
                </div>
            ) : (
                <ChatInputRow
                    prefix="social-chat"
                    textareaRef={textareaRef}
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message…"
                    onSend={handleSend}
                    sendDisabled={!draft.trim() || sending}
                    onToggleMic={toggleMic}
                    onCancelMic={cancelMic}
                    isRecording={isRecording}
                    isTranscribing={isTranscribing}
                    micDisabled={sending || isTranscribing}
                    textareaDisabled={sending || isRecording}
                />
            )}
        </div>
    )
}

function InvalidationAlertBubble({ msg, onClose, onDismiss }) {
    const { reason, asset, status, inPosition, ideaId } = msg.payload
    // Dismissal is persisted on the message (msg.dismissed), so the choice survives
    // reload and the alert never reappears actionable.
    const dismissed = !!msg.dismissed
    // 'drifting' = pre-entry, price running away from a distant entry (softer nudge);
    // 'fired' = the entry envelope broke. Fall back to 'fired' for older payloads.
    const isDrifting = status === 'drifting'
    const kind  = isDrifting ? 'drifting' : 'fired'
    const label = isDrifting
        ? 'Setup drifting'
        : `Invalidation${inPosition ? ' (in position)' : ''}`

    // Taking an action (edit / close) also marks the card handled so it collapses to a "taken
    // care of" state — not just Dismiss. dismissOutcome records which, for the collapsed label.
    function handleReview() {
        onDismiss?.(msg.id, 'editing')
        eventBus.emit(INVALIDATION_EDIT_IDEA, { ideaId })
        onClose?.()
    }

    function handleCloseTrade() {
        onDismiss?.(msg.id, 'closing')
        eventBus.emit(INVALIDATION_CLOSE_TRADE, { ideaId })
        onClose?.()
    }

    // Handled: the card collapses to an acknowledged state. The server latch
    // (invalidation_status) already stops re-alerting, so this is purely the visual "done".
    if (dismissed) {
        const label = msg.dismissOutcome === 'editing' ? '✓ Opened in chat'
            : msg.dismissOutcome === 'closing' ? '✓ Closing'
            : 'Dismissed'
        return (
            <div className="social-chat__msg-bubble social-chat__invalidation-alert social-chat__invalidation-alert--dismissed">
                <div className="social-chat__invalidation-alert-header">{label} &middot; {asset}</div>
            </div>
        )
    }

    return (
        <div className={`social-chat__msg-bubble social-chat__invalidation-alert social-chat__invalidation-alert--${kind}`}>
            <CardAgentTag agent={AGENTS.idea} />
            <div className="social-chat__invalidation-alert-header">
                {label} &middot; {asset}
            </div>
            <div className="social-chat__invalidation-alert-reason">{reason}</div>
            <div className="social-chat__invalidation-alert-actions">
                <button className="social-chat__invalidation-alert-btn" onClick={handleReview}>Edit in chat</button>
                {inPosition && (
                    <button
                        className="social-chat__invalidation-alert-btn social-chat__invalidation-alert-btn--close"
                        onClick={handleCloseTrade}
                    >Close</button>
                )}
                <button
                    className="social-chat__invalidation-alert-btn social-chat__invalidation-alert-btn--dismiss"
                    onClick={() => onDismiss?.(msg.id, 'dismissed')}
                >Dismiss</button>
            </div>
        </div>
    )
}

// Open a Kairos call's pop-out detail window — Confirm entry / Accept edit / Delete all live
// there. CallPage fetches the call by id, so a chat card (which only has the id) can open it
// straight without stashing data first.
function openCallPopup(callId) {
    window.open(`/call/${callId}`, `call-${callId}`, 'width=1180,height=760')
}

// "Entry triggered — confirm" card. Notify + route: an idea routes to the workspace's
// OrderConfirmDialog (via the app), a Kairos call opens its pop-out where Confirm entry lives.
// Same collapse-on-handled behaviour as the invalidation card (persisted via msg.dismissed).
function EntryConfirmBubble({ msg, onClose, onDismiss }) {
    const { kind, ideaId, callId, asset } = msg.payload
    const isCall = kind === 'call'
    const agent  = isCall ? AGENTS.kairos : AGENTS.idea

    // Route to the action surface: a call opens its pop-out; an idea asks the app to surface the
    // OrderConfirmDialog. Either target may fail to materialize (idea still loading, another
    // user's idea, orders that don't resolve to a session account) — so this stays replayable.
    function openTarget() {
        if (isCall) openCallPopup(callId)
        else        eventBus.emit(ENTRY_CONFIRM_OPEN, { ideaId })
    }

    function handleConfirm() {
        onDismiss?.(msg.id, 'confirmed')
        openTarget()
        onClose?.()
    }

    if (msg.dismissed) {
        const label = msg.dismissOutcome === 'confirmed' ? '✓ Opened' : 'Dismissed'
        // A 'confirmed' card keeps its target replayable: the dialog/pop-out it routed to may not
        // have surfaced, so let the collapsed chip re-trigger it instead of dead-ending.
        const reopen = msg.dismissOutcome === 'confirmed'
        return (
            <div
                className={'social-chat__msg-bubble social-chat__invalidation-alert social-chat__invalidation-alert--dismissed' + (reopen ? ' social-chat__invalidation-alert--reopen' : '')}
                {...(reopen ? { role: 'button', tabIndex: 0, title: 'Re-open', onClick: openTarget,
                    onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTarget() } } } : {})}
            >
                <div className="social-chat__invalidation-alert-header">{label} &middot; {asset}</div>
            </div>
        )
    }

    return (
        <div className="social-chat__msg-bubble social-chat__invalidation-alert social-chat__invalidation-alert--confirm">
            <CardAgentTag agent={agent} />
            <div className="social-chat__invalidation-alert-header">Confirm entry &middot; {asset}</div>
            <div className="social-chat__invalidation-alert-reason">{msg.content}</div>
            <div className="social-chat__invalidation-alert-actions">
                <button className="social-chat__invalidation-alert-btn" onClick={handleConfirm}>
                    {isCall ? 'View call' : 'Confirm order'}
                </button>
                <button
                    className="social-chat__invalidation-alert-btn social-chat__invalidation-alert-btn--dismiss"
                    onClick={() => onDismiss?.(msg.id, 'dismissed')}
                >Dismiss</button>
            </div>
        </div>
    )
}

// "Trade thesis expiring / expired" card for a Kairos call. Edit re-maps it (opens the call
// pop-out → Accept edit); Delete removes the call outright. Both persist as handled.
function CallExpiryBubble({ msg, onDismiss }) {
    const { callId, asset, kind, why } = msg.payload
    const label = kind === 'expired' ? 'Thesis expired' : 'Thesis expiring'

    function handleEdit() {
        onDismiss?.(msg.id, 'editing')
        openCallPopup(callId)
    }

    async function handleDelete() {
        onDismiss?.(msg.id, 'deleted')
        try { await kairosService.deleteCall(callId) } catch { /* list re-syncs on next load */ }
    }

    if (msg.dismissed) {
        const label = msg.dismissOutcome === 'editing' ? '✓ Opened'
            : msg.dismissOutcome === 'deleted' ? '✓ Deleted'
            : 'Dismissed'
        return (
            <div className="social-chat__msg-bubble social-chat__invalidation-alert social-chat__invalidation-alert--dismissed">
                <div className="social-chat__invalidation-alert-header">{label} &middot; {asset}</div>
            </div>
        )
    }

    return (
        <div className="social-chat__msg-bubble social-chat__invalidation-alert social-chat__invalidation-alert--expiry">
            <CardAgentTag agent={AGENTS.kairos} />
            <div className="social-chat__invalidation-alert-header">{label} &middot; {asset}</div>
            <div className="social-chat__invalidation-alert-reason">{why || msg.content}</div>
            <div className="social-chat__invalidation-alert-actions">
                <button className="social-chat__invalidation-alert-btn" onClick={handleEdit}>Edit call</button>
                <button
                    className="social-chat__invalidation-alert-btn social-chat__invalidation-alert-btn--close"
                    onClick={handleDelete}
                >Delete</button>
                <button
                    className="social-chat__invalidation-alert-btn social-chat__invalidation-alert-btn--dismiss"
                    onClick={() => onDismiss?.(msg.id, 'dismissed')}
                >Dismiss</button>
            </div>
        </div>
    )
}

// "Kairos wants to manage the position" card. Notify + route: opens the call pop-out where the
// user accepts (move stop / take partial / exit / let run) or dismisses the suggestion.
const MANAGE_VERB_COPY = { move_stop: 'move the stop', take_partial: 'take a partial', exit_now: 'exit now', let_run: 'let it run' }
function CallManageBubble({ msg, onDismiss }) {
    const { callId, asset, verdict, read } = msg.payload

    function handleOpen() {
        onDismiss?.(msg.id, 'opened')
        openCallPopup(callId)
    }

    if (msg.dismissed) {
        const label = msg.dismissOutcome === 'opened' ? '✓ Opened' : 'Dismissed'
        return (
            <div className="social-chat__msg-bubble social-chat__invalidation-alert social-chat__invalidation-alert--dismissed">
                <div className="social-chat__invalidation-alert-header">{label} &middot; {asset}</div>
            </div>
        )
    }

    return (
        <div className="social-chat__msg-bubble social-chat__invalidation-alert social-chat__invalidation-alert--manage">
            <CardAgentTag agent={AGENTS.kairos} />
            <div className="social-chat__invalidation-alert-header">Manage {asset} &middot; {MANAGE_VERB_COPY[verdict] ?? verdict}</div>
            <div className="social-chat__invalidation-alert-reason">{read || msg.content}</div>
            <div className="social-chat__invalidation-alert-actions">
                <button className="social-chat__invalidation-alert-btn" onClick={handleOpen}>Review</button>
                <button
                    className="social-chat__invalidation-alert-btn social-chat__invalidation-alert-btn--dismiss"
                    onClick={() => onDismiss?.(msg.id, 'dismissed')}
                >Dismiss</button>
            </div>
        </div>
    )
}

function PortfolioReviewBubble({ msg, onClose }) {
    const { portfolioId, portfolioName, mode, account, lastReviewAt, resolved, outcome, nextReviewAt } = msg.payload
    const fmtDate = (ms) => new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
    const lastReview = lastReviewAt ? fmtDate(lastReviewAt) : 'never'
    const modeLabel = mode ? mode.charAt(0).toUpperCase() + mode.slice(1) : null

    function handleReview() {
        eventBus.emit(PORTFOLIO_REVIEW, { portfolioId, reviewMode: true })
        onClose?.()
    }

    // Once the review cycle is resolved (dismissed or an update applied), the card stops
    // routing into an active review and shows the outcome + when the next one is due.
    const outcomeLabel = outcome === 'updated' ? 'Updated' : outcome === 'reviewed' ? 'Reviewed' : 'Dismissed'

    return (
        <div className={`social-chat__msg-bubble social-chat__portfolio-review${resolved ? ' social-chat__portfolio-review--resolved' : ''}`}>
            <CardAgentTag agent={AGENTS.portfolio} />
            <div className="social-chat__portfolio-review-header">
                Portfolio Review &middot; {portfolioName}
            </div>
            {(modeLabel || account) && (
                <div className="social-chat__portfolio-review-scope">
                    {modeLabel && (
                        <span className={`social-chat__portfolio-review-mode social-chat__portfolio-review-mode--${mode}`}>
                            {modeLabel}
                        </span>
                    )}
                    {account && <span className="social-chat__portfolio-review-account">{account}</span>}
                </div>
            )}
            {resolved ? (
                <>
                    <div className="social-chat__portfolio-review-meta">
                        {outcomeLabel}{nextReviewAt ? ` · next review ${fmtDate(nextReviewAt)}` : ''}
                    </div>
                    <div className="social-chat__portfolio-review-done">✓ Review complete</div>
                </>
            ) : (
                <>
                    <div className="social-chat__portfolio-review-meta">Last reviewed: {lastReview}</div>
                    <button className="social-chat__portfolio-review-btn" onClick={handleReview}>
                        Review Portfolio →
                    </button>
                </>
            )}
        </div>
    )
}

// The unified manual-mode FillCard: broker-less mode can't place/close, so the user reports
// the real fill here. N legs (1 for an idea, N for a portfolio); each leg opens/closes the
// instant its price is submitted (incremental, partial baskets fine). Entry legs also carry
// an editable quantity. On a successful fill it emits MANUAL_FILLED so the app patches the
// idea + refreshes positions. Dismissal persists on the message like the other cards.
function ManualFillCard({ msg, onDismiss }) {
    const { kind, reason, portfolioName, legs = [] } = msg.payload
    const isEntry = kind === 'entry'

    const [rows, setRows] = useState(() =>
        Object.fromEntries(legs.map(l => [l.ideaId, {
            price: '', qty: l.quantity != null ? String(l.quantity) : '', status: 'idle', err: null,
        }])))

    function patch(ideaId, fields) {
        setRows(prev => ({ ...prev, [ideaId]: { ...prev[ideaId], ...fields } }))
    }

    async function submit(leg) {
        const row   = rows[leg.ideaId] ?? {}
        const price = Number(row.price)
        if (!(price > 0)) { patch(leg.ideaId, { err: 'Enter a valid price' }); return }
        const qty = isEntry ? Number(row.qty) : undefined
        if (isEntry && !(qty > 0)) { patch(leg.ideaId, { err: 'Enter a valid quantity' }); return }

        patch(leg.ideaId, { status: 'saving', err: null })
        try {
            const idea = isEntry
                ? await manualService.confirmEntry(leg.ideaId, { price, quantity: qty })
                : await manualService.confirmExit(leg.ideaId, { price })
            patch(leg.ideaId, { status: 'done', err: null })
            eventBus.emit(MANUAL_FILLED, { idea })
        } catch (err) {
            patch(leg.ideaId, { status: 'error', err: err?.response?.data?.error || 'Failed — try again' })
        }
    }

    if (msg.dismissed) {
        return (
            <div className="social-chat__msg-bubble social-chat__manual-card social-chat__manual-card--dismissed">
                <div className="social-chat__manual-card-header">Dismissed &middot; {isEntry ? 'entry' : 'exit'}</div>
            </div>
        )
    }

    const allDone = legs.every(l => rows[l.ideaId]?.status === 'done')
    const many    = legs.length > 1
    const title   = isEntry
        ? (many ? `Enter ${portfolioName || 'portfolio'} — ${legs.length} legs` : 'Confirm your entry fill')
        : (many ? `Exit ${portfolioName || 'portfolio'} — ${legs.length} legs`  : `Confirm your exit${reason && reason !== 'manual' ? ` · ${reason}` : ''}`)

    return (
        <div className={`social-chat__msg-bubble social-chat__manual-card social-chat__manual-card--${isEntry ? 'entry' : 'exit'}`}>
            <CardAgentTag agent={AGENTS.idea} />
            <div className="social-chat__manual-card-header">{title}</div>
            <div className="social-chat__manual-card-legs">
                {legs.map(leg => {
                    const row  = rows[leg.ideaId] ?? {}
                    const done = row.status === 'done'
                    return (
                        <div key={leg.ideaId} className={`social-chat__manual-leg${done ? ' is-done' : ''}`}>
                            <div className="social-chat__manual-leg-meta">
                                <span className={`social-chat__manual-leg-dir social-chat__manual-leg-dir--${leg.direction}`}>{String(leg.direction).toUpperCase()}</span>
                                <span className="social-chat__manual-leg-asset">{leg.asset}</span>
                                {isEntry && leg.quantity != null && <span className="social-chat__manual-leg-qty">&times; {leg.quantity}</span>}
                            </div>
                            {done ? (
                                <span className="social-chat__manual-leg-done">✓ {isEntry ? 'filled' : 'closed'} @ {row.price}</span>
                            ) : (
                                <div className="social-chat__manual-leg-inputs">
                                    {isEntry && (
                                        <input
                                            className="social-chat__manual-input" type="number" step="any" placeholder="qty"
                                            value={row.qty} onChange={e => patch(leg.ideaId, { qty: e.target.value })}
                                        />
                                    )}
                                    <input
                                        className="social-chat__manual-input" type="number" step="any"
                                        placeholder={isEntry ? 'fill price' : 'exit price'}
                                        value={row.price} onChange={e => patch(leg.ideaId, { price: e.target.value })}
                                    />
                                    <button
                                        className="social-chat__manual-btn" disabled={row.status === 'saving'}
                                        onClick={() => submit(leg)}
                                    >{row.status === 'saving' ? '…' : (isEntry ? 'Fill' : 'Close')}</button>
                                </div>
                            )}
                            {row.err && <div className="social-chat__manual-leg-err">{row.err}</div>}
                        </div>
                    )
                })}
            </div>
            <div className="social-chat__manual-card-actions">
                <button
                    className="social-chat__manual-btn social-chat__manual-btn--dismiss"
                    onClick={() => onDismiss?.(msg.id)}
                >{allDone ? 'Done' : 'Dismiss'}</button>
            </div>
        </div>
    )
}

ChatWindow.propTypes = {
    conversation:  PropTypes.object,
    messages:      PropTypes.array.isRequired,
    currentUserId: PropTypes.string,
    loading:       PropTypes.bool,
    hasMore:       PropTypes.bool,
    onClose:       PropTypes.func,
    onSend:        PropTypes.func.isRequired,
    onLoadMore:    PropTypes.func.isRequired,
}
