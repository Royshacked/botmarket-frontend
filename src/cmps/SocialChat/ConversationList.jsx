import { useState } from 'react'
import PropTypes from 'prop-types'
import { chatService } from '../../services/chat/chat.service'
import { AxlBotGlyph } from '../AxlHub/AgentSummon'

const BOT_ID = 'axl'

function timeAgo(ms) {
    if (!ms) return ''
    const diff = Date.now() - ms
    if (diff < 60000)  return 'now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
    return `${Math.floor(diff / 86400000)}d`
}

export function ConversationList({ conversations, activeId, currentUserId, onSelect, onConversationStarted }) {
    const [search,    setSearch]    = useState('')
    const [results,   setResults]   = useState([])
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

    // Sort: bot pinned first, then by lastMessageAt desc
    const sorted = [...conversations].sort((a, b) => {
        const aBot = a.participants.includes(BOT_ID)
        const bBot = b.participants.includes(BOT_ID)
        if (aBot && !bBot) return -1
        if (!aBot && bBot) return 1
        return (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0)
    })

    return (
        <div className="social-chat__list">
            <div className="social-chat__list-header">Messages</div>

            <input
                className="social-chat__search"
                placeholder="Search users..."
                value={search}
                onChange={e => handleSearch(e.target.value)}
            />

            {search ? (
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
            ) : (
                <div className="social-chat__conv-scroll">
                    {sorted.map(conv => {
                        const otherId = conv.participants.find(p => p !== currentUserId) ?? ''
                        const isBot   = otherId === BOT_ID
                        const name    = isBot ? 'axl' : (conv.otherName ?? conv.otherUsername ?? otherId)
                        const active  = conv.id === activeId

                        return (
                            <button
                                key={conv.id}
                                className={'social-chat__conv-item' + (active ? ' social-chat__conv-item--active' : '')}
                                onClick={() => onSelect(conv)}
                            >
                                <div className={'social-chat__conv-avatar' + (isBot ? ' social-chat__conv-avatar--bot' : '')}>
                                    {isBot ? <AxlBotGlyph /> : name[0]?.toUpperCase()}
                                </div>
                                <div className="social-chat__conv-meta">
                                    <div className="social-chat__conv-name">
                                        <span>{name}</span>
                                        {conv.unread > 0 && (
                                            <span className="social-chat__unread-dot">{conv.unread}</span>
                                        )}
                                    </div>
                                    <div className="social-chat__conv-preview">{conv.lastMessage || '—'}</div>
                                </div>
                                <div className="social-chat__conv-right">
                                    <span className="social-chat__conv-time">{timeAgo(conv.lastMessageAt)}</span>
                                </div>
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

ConversationList.propTypes = {
    conversations:         PropTypes.array.isRequired,
    activeId:              PropTypes.string,
    currentUserId:         PropTypes.string,
    onSelect:              PropTypes.func.isRequired,
    onConversationStarted: PropTypes.func.isRequired,
}
