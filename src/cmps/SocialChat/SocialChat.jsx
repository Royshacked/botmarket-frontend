import { useState, useEffect, useCallback, useRef } from 'react'
import PropTypes from 'prop-types'
import { chatService }   from '../../services/chat/chat.service'
import { chatWsService } from '../../services/chat/chatWs.service'
import { ConversationList } from './ConversationList'
import { ChatWindow }       from './ChatWindow'
import { readStoredModel }       from '../modelOptions'
import { readStoredReasoning }   from '../reasoningOptions'
import { readStoredRoutingMode } from '../routingModeOptions'
import './SocialChat.scss'

// The one shared AI-mode the user sets in their profile is mirrored to every
// agent's localStorage keys; read the 'idea' keys as the representative so Axl
// obeys the same routing as Idea/Atlas/Argus.
function readAiPref() {
    return {
        routingMode:     readStoredRoutingMode('ideaRoutingMode'),
        model:           readStoredModel('ideaModel'),
        reasoningEffort: readStoredReasoning('ideaReasoning'),
    }
}

const PAGE   = 50
const BOT_ID = 'axl'

export function SocialChat({ currentUserId, onUnreadChange, onClose }) {
    const [conversations, setConversations] = useState([])
    const [activeConv,    setActiveConv]    = useState(null)
    const [messages,      setMessages]      = useState([])
    const [hasMore,       setHasMore]       = useState(false)
    const [loading,       setLoading]       = useState(false)
    const [closing,       setClosing]       = useState(false)
    const activeConvRef = useRef(null)

    // Play the close (bubble-deflate) animation, then let the parent unmount us.
    // Keep the duration in sync with the social-chat-bubble-out keyframe.
    function handleClose() {
        if (closing) return
        setClosing(true)
        setTimeout(() => onClose?.(), 260)
    }

    // ── Load conversation list ──────────────────────────────────────────────
    const loadConversations = useCallback(async () => {
        try {
            const convs = await chatService.getConversations()
            const bot  = convs.filter(c => c.participants.includes(BOT_ID))
            const rest = convs.filter(c => !c.participants.includes(BOT_ID))
            setConversations([...bot, ...rest])
            onUnreadChange?.(convs.reduce((s, c) => s + (c.unread ?? 0), 0))
        } catch (err) {
            console.error('[SocialChat] loadConversations failed', err)
        }
    }, [onUnreadChange])

    useEffect(() => { loadConversations() }, [loadConversations])

    // ── WS events ──────────────────────────────────────────────────────────
    useEffect(() => {
        function onConnected() { loadConversations() }

        function onNewMessage(msg) {
            const isActive = activeConvRef.current?.id === msg.conversationId
            setConversations(prev => {
                const updated = prev.map(c => c.id !== msg.conversationId ? c : {
                    ...c,
                    lastMessage:   msg.content,
                    lastMessageAt: msg.createdAt,
                    unread: isActive ? 0 : (c.unread ?? 0) + 1,
                })
                onUnreadChange?.(updated.reduce((s, c) => s + (c.unread ?? 0), 0))
                return updated
            })
            if (isActive) setMessages(m => [...m, msg])
        }

        chatWsService.on('connected',   onConnected)
        chatWsService.on('new_message', onNewMessage)
        return () => {
            chatWsService.off('connected',   onConnected)
            chatWsService.off('new_message', onNewMessage)
        }
    }, [loadConversations, onUnreadChange])

    useEffect(() => { activeConvRef.current = activeConv }, [activeConv])

    // ── Select conversation ─────────────────────────────────────────────────
    async function handleSelectConv(conv) {
        setActiveConv(conv)
        setMessages([])
        setLoading(true)
        try {
            const msgs = await chatService.getMessages(conv.id)
            setMessages(msgs)
            setHasMore(msgs.length === PAGE)
            await chatService.markRead(conv.id)
            setConversations(prev => {
                const updated = prev.map(c => c.id === conv.id ? { ...c, unread: 0 } : c)
                onUnreadChange?.(updated.reduce((s, c) => s + (c.unread ?? 0), 0))
                return updated
            })
        } catch (err) {
            console.error('[SocialChat] getMessages failed', err)
        } finally { setLoading(false) }
    }

    async function handleLoadMore() {
        if (!activeConv || loading) return
        setLoading(true)
        try {
            const older = await chatService.getMessages(activeConv.id, messages[0]?.createdAt)
            setMessages(prev => [...older, ...prev])
            setHasMore(older.length === PAGE)
        } catch { /* ignore */ } finally { setLoading(false) }
    }

    async function handleSend(content) {
        if (!activeConv) return
        const toBot   = activeConv.participants.includes(BOT_ID)
        const msg = await chatService.sendMessage(activeConv.id, content, toBot ? readAiPref() : null)
        setMessages(prev => [...prev, msg])
        setConversations(prev => prev.map(c =>
            c.id === activeConv.id
                ? { ...c, lastMessage: msg.content, lastMessageAt: msg.createdAt }
                : c
        ))
    }

    function handleConversationStarted(conv) {
        setConversations(prev => prev.find(c => c.id === conv.id) ? prev : [conv, ...prev])
        handleSelectConv(conv)
    }

    // Persist a message dismissal (e.g. an invalidation alert) so the choice sticks:
    // patch it locally now, and mark it dismissed server-side so it stays acknowledged
    // on reload. Does not touch the idea's invalidation latch.
    async function handleDismissMessage(msgId) {
        if (!activeConv) return
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, dismissed: true } : m))
        try {
            await chatService.dismissMessage(activeConv.id, msgId)
        } catch (err) {
            console.error('[SocialChat] dismiss failed', err)
        }
    }

    return (
        <>
            <div className="social-chat__backdrop" onClick={handleClose} />

            <div className={`social-chat${closing ? ' social-chat--closing' : ''}`}>
                <ConversationList
                    conversations={conversations}
                    activeId={activeConv?.id}
                    currentUserId={currentUserId}
                    onSelect={handleSelectConv}
                    onConversationStarted={handleConversationStarted}
                />

                <ChatWindow
                    conversation={activeConv}
                    messages={messages}
                    currentUserId={currentUserId}
                    loading={loading}
                    hasMore={hasMore}
                    onClose={handleClose}
                    onSend={handleSend}
                    onLoadMore={handleLoadMore}
                    onDismissMessage={handleDismissMessage}
                />
            </div>
        </>
    )
}

SocialChat.propTypes = {
    currentUserId:  PropTypes.string,
    onUnreadChange: PropTypes.func,
    onClose:        PropTypes.func,
}
