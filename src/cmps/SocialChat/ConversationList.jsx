import { useState } from 'react'
import PropTypes from 'prop-types'
import { chatService } from '../../services/chat/chat.service'
import { AxlBotGlyph } from '../AxlHub/AgentSummon'
import { useDesign } from '../../customHooks/useDesign.js'
import { AGENTS, BOT_IDS, isBotId } from '../AxlHub/agentMeta.jsx'

// The agent behind a conversation, or null for a human DM. Drives the brand name,
// tinted avatar and the "AGENT" chip.
function botMetaFor(otherId) {
    return isBotId(otherId) ? AGENTS[otherId] : null
}

// Small tinted agent sigil for the conversation avatar (Axl keeps its dedicated glyph).
function BotAvatarGlyph({ agentKey }) {
    if (agentKey === 'axl') return <AxlBotGlyph />
    const meta = AGENTS[agentKey]
    if (!meta) return null
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {meta.icon}
        </svg>
    )
}

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
    const cardMode = useDesign() === 'cards'

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

    // Sort: bots pinned above people. Within the bot group, order by the fixed agent
    // order (Axl first) so the pinned feeds stay put; people sort by recency.
    const botRank = (conv) => {
        const id = conv.participants.find(isBotId)
        return id ? BOT_IDS.indexOf(id) : -1
    }
    const sorted = [...conversations].sort((a, b) => {
        const aRank = botRank(a)
        const bRank = botRank(b)
        const aBot  = aRank !== -1
        const bBot  = bRank !== -1
        if (aBot && bBot) return aRank - bRank
        if (aBot) return -1
        if (bBot) return 1
        return (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0)
    })

    return (
        <div className="social-chat__list">
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
                        const botMeta = botMetaFor(otherId)
                        const isBot   = !!botMeta
                        const name    = isBot ? botMeta.brand : (conv.otherName ?? conv.otherUsername ?? otherId)
                        const active  = conv.id === activeId

                        return (
                            <button
                                key={conv.id}
                                className={'social-chat__conv-item' + (active ? ' social-chat__conv-item--active' : '')}
                                onClick={() => onSelect(conv)}
                            >
                                <div className={'social-chat__conv-avatar' + (isBot ? ' social-chat__conv-avatar--bot' : '') + (isBot && otherId !== 'axl' ? ` social-chat__conv-avatar--${botMeta.hue}` : '')}>
                                    {isBot ? <BotAvatarGlyph agentKey={otherId} /> : name[0]?.toUpperCase()}
                                </div>
                                <div className="social-chat__conv-meta">
                                    <div className="social-chat__conv-name">
                                        <span>{name}</span>
                                        {isBot && cardMode && (
                                            <span className="social-chat__agent-chip">AGENT</span>
                                        )}
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
