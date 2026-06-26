import { useState } from 'react'
import PropTypes from 'prop-types'
import { chatService } from '../../services/chat/chat.service'

const BOT_ID = 'ar2trade_bot'

function timeAgo(ms) {
    if (!ms) return ''
    const diff = Date.now() - ms
    if (diff < 60000)  return 'now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
    return `${Math.floor(diff / 86400000)}d`
}

export function ConversationList({ conversations, activeId, currentUserId, onSelect, onConversationStarted }) {
    const [search, setSearch]   = useState('')
    const [results, setResults] = useState([])
    const [searching, setSearching] = useState(false)

    async function handleSearch(q) {
        setSearch(q)
        if (q.trim().length < 2) { setResults([]); return }
        setSearching(true)
        try {
            const users = await chatService.searchUsers(q)
            setResults(users)
        } catch { setResults([]) }
        finally { setSearching(false) }
    }

    async function handleStartDm(user) {
        setSearch(''); setResults([])
        try {
            const conv = await chatService.startConversation(user.id)
            onConversationStarted(conv)
        } catch { /* ignore */ }
    }

    const bot  = conversations.find(c => c.participants.includes(BOT_ID))
    const rest = conversations.filter(c => !c.participants.includes(BOT_ID))

    function renderItem(conv) {
        const otherId = conv.participants.find(p => p !== currentUserId) ?? ''
        const isBot   = otherId === BOT_ID
        const name    = isBot ? '🤖 ar2trade' : (conv.otherName ?? otherId)
        const active  = conv.id === activeId

        return (
            <button
                key={conv.id}
                className={`social-chat__conv-item${active ? ' social-chat__conv-item--active' : ''}`}
                onClick={() => onSelect(conv)}
            >
                <div className="social-chat__conv-avatar">
                    {isBot ? '🤖' : name[0]?.toUpperCase()}
                </div>
                <div className="social-chat__conv-meta">
                    <div className="social-chat__conv-name">{name}</div>
                    <div className="social-chat__conv-preview">{conv.lastMessage || '—'}</div>
                </div>
                <div className="social-chat__conv-right">
                    <span className="social-chat__conv-time">{timeAgo(conv.lastMessageAt)}</span>
                    {conv.unread > 0 && (
                        <span className="social-chat__unread-dot">{conv.unread}</span>
                    )}
                </div>
            </button>
        )
    }

    return (
        <div className="social-chat__list">
            <div className="social-chat__list-header">Messages</div>

            <input
                className="social-chat__search"
                placeholder="Search users..."
                value={search}
                onChange={e => handleSearch(e.target.value)}
            />

            {search && (
                <div className="social-chat__search-results">
                    {searching && <div className="social-chat__search-hint">Searching…</div>}
                    {results.map(u => (
                        <button key={u.id} className="social-chat__search-result" onClick={() => handleStartDm(u)}>
                            <span className="social-chat__conv-avatar">{u.fullname?.[0]?.toUpperCase()}</span>
                            <span>{u.fullname} <span className="social-chat__search-username">@{u.username}</span></span>
                        </button>
                    ))}
                    {!searching && results.length === 0 && (
                        <div className="social-chat__search-hint">No users found</div>
                    )}
                </div>
            )}

            {!search && (
                <>
                    {bot && renderItem(bot)}
                    {rest.map(renderItem)}
                </>
            )}
        </div>
    )
}

ConversationList.propTypes = {
    conversations:        PropTypes.array.isRequired,
    activeId:             PropTypes.string,
    currentUserId:        PropTypes.string,
    onSelect:             PropTypes.func.isRequired,
    onConversationStarted: PropTypes.func.isRequired,
}
