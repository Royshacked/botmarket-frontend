import { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'

const BOT_ID = 'ar2trade_bot'

function formatTime(ms) {
    if (!ms) return ''
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function ChatWindow({ conversation, messages, currentUserId, loading, hasMore, onSend, onLoadMore }) {
    const [draft, setDraft] = useState('')
    const [sending, setSending] = useState(false)
    const bottomRef = useRef(null)
    const listRef   = useRef(null)

    // Scroll to bottom when new messages arrive
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    async function handleSend(e) {
        e.preventDefault()
        const text = draft.trim()
        if (!text || sending) return
        setDraft('')
        setSending(true)
        try { await onSend(text) }
        catch { /* error visible enough from empty message */ }
        finally { setSending(false) }
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) handleSend(e)
    }

    if (!conversation) {
        return (
            <div className="social-chat__window social-chat__window--empty">
                <p>Select a conversation to start chatting</p>
            </div>
        )
    }

    const otherId = conversation.participants?.find(p => p !== currentUserId) ?? ''
    const isBot   = otherId === BOT_ID
    const title   = isBot ? '🤖 ar2trade' : (conversation.otherName ?? otherId)

    return (
        <div className="social-chat__window">
            <div className="social-chat__window-header">
                <div className="social-chat__conv-avatar">
                    {isBot ? '🤖' : title[0]?.toUpperCase()}
                </div>
                <span className="social-chat__window-title">{title}</span>
            </div>

            <div className="social-chat__messages" ref={listRef}>
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
                            <div className="social-chat__msg-bubble">{msg.content}</div>
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

ChatWindow.propTypes = {
    conversation:  PropTypes.object,
    messages:      PropTypes.array.isRequired,
    currentUserId: PropTypes.string,
    loading:       PropTypes.bool,
    hasMore:       PropTypes.bool,
    onSend:        PropTypes.func.isRequired,
    onLoadMore:    PropTypes.func.isRequired,
}
