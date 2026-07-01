import { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { eventBus, INVALIDATION_EDIT_IDEA, INVALIDATION_CLOSE_TRADE, PORTFOLIO_REVIEW } from '../../services/event-bus.service'

function formatTime(ms) {
    if (!ms) return ''
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function ChatWindow({ conversation, messages, currentUserId, loading, hasMore, onClose, onSend, onLoadMore, onDismissMessage }) {
    const [draft,   setDraft]   = useState('')
    const [sending, setSending] = useState(false)
    const bottomRef = useRef(null)

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    async function handleSend(e) {
        e.preventDefault()
        const text = draft.trim()
        if (!text || sending) return
        setDraft('')
        setSending(true)
        try { await onSend(text) } catch { /* ignore */ } finally { setSending(false) }
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) handleSend(e)
    }

    if (!conversation) {
        return (
            <div className="social-chat__window social-chat__window--empty">
                <button className="social-chat__close social-chat__close--float" onClick={onClose}>✕</button>
                <p style={{ margin: 'auto' }}>Select a conversation</p>
            </div>
        )
    }

    return (
        <div className="social-chat__window">
            <button className="social-chat__close social-chat__close--float" onClick={onClose}>✕</button>

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
                                : <div className="social-chat__msg-bubble">{msg.content}</div>
                            }
                            <div className="social-chat__msg-time">{formatTime(msg.createdAt)}</div>
                        </div>
                    )
                })}
                <div ref={bottomRef} />
            </div>

            <form className="social-chat__input-row" onSubmit={handleSend}>
                <textarea
                    className="social-chat__input"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message…"
                    rows={1}
                />
                <button className="social-chat__send-btn" type="submit" disabled={!draft.trim() || sending}>
                    Send
                </button>
            </form>
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
            <div className="social-chat__invalidation-alert-header">
                {label} &middot; {asset}
            </div>
            <div className="social-chat__invalidation-alert-reason">{reason}</div>
            <div className="social-chat__invalidation-alert-actions">
                <button className="social-chat__invalidation-alert-btn" onClick={handleReview}>Update</button>
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
