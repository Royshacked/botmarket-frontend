import { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { eventBus, INVALIDATION_EDIT_IDEA, INVALIDATION_CLOSE_TRADE, PORTFOLIO_REVIEW, MANUAL_FILLED } from '../../services/event-bus.service'
import { manualService } from '../../services/manual/manual.service.remote'
import { ChatInputRow } from '../ChatInputRow.jsx'
import { useMicInput } from '../../customHooks/useMicInput.js'
import { AGENTS } from '../AxlHub/agentMeta.jsx'

// Compact "from <agent>" attribution chip for notification cards: the agent's
// sigil + brand, tinted by its hue. Makes a card read as coming from Idea / Atlas
// (each specialist owns its own alerts and the card routes back to that agent).
function CardAgentTag({ agent }) {
    return (
        <span className={`social-chat__card-agent social-chat__card-agent--${agent.hue}`}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {agent.icon}
            </svg>
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
                                : <div className="social-chat__msg-bubble">{msg.content}</div>
                            }
                            <div className="social-chat__msg-time">{formatTime(msg.createdAt)}</div>
                        </div>
                    )
                })}
                <div ref={bottomRef} />
            </div>

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

    function handleReview() {
        eventBus.emit(INVALIDATION_EDIT_IDEA, { ideaId })
        onClose?.()
    }

    function handleCloseTrade() {
        eventBus.emit(INVALIDATION_CLOSE_TRADE, { ideaId })
        onClose?.()
    }

    // Local acknowledge. The server latch (invalidation_status) already stops
    // re-alerting for this idea, so dismissing just collapses the bubble.
    if (dismissed) {
        return (
            <div className="social-chat__msg-bubble social-chat__invalidation-alert social-chat__invalidation-alert--dismissed">
                <div className="social-chat__invalidation-alert-header">Dismissed &middot; {asset}</div>
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
                    onClick={() => onDismiss?.(msg.id)}
                >Dismiss</button>
            </div>
        </div>
    )
}

function PortfolioReviewBubble({ msg, onClose }) {
    const { portfolioId, portfolioName, lastReviewAt } = msg.payload
    const lastReview = lastReviewAt
        ? new Date(lastReviewAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
        : 'never'

    function handleReview() {
        eventBus.emit(PORTFOLIO_REVIEW, { portfolioId, reviewMode: true })
        onClose?.()
    }

    return (
        <div className="social-chat__msg-bubble social-chat__portfolio-review">
            <CardAgentTag agent={AGENTS.portfolio} />
            <div className="social-chat__portfolio-review-header">
                Portfolio Review &middot; {portfolioName}
            </div>
            <div className="social-chat__portfolio-review-meta">Last reviewed: {lastReview}</div>
            <button className="social-chat__portfolio-review-btn" onClick={handleReview}>
                Review Portfolio →
            </button>
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
