import { useState, useEffect, useCallback, useRef } from 'react'
import PropTypes from 'prop-types'
import { chatService }   from '../../services/chat/chat.service'
import { chatWsService } from '../../services/chat/chatWs.service'
import { ConversationList } from './ConversationList'
import { ChatWindow }       from './ChatWindow'
import './SocialChat.scss'

const PAGE   = 50
const BOT_ID = 'ar2trade_bot'

export function SocialChat({ currentUserId, onUnreadChange, onClose }) {
    const [conversations, setConversations] = useState([])
    const [activeConv,    setActiveConv]    = useState(null)
    const [messages,      setMessages]      = useState([])
    const [hasMore,       setHasMore]       = useState(false)
    const [loading,       setLoading]       = useState(false)
    const activeConvRef = useRef(null)

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
        const msg = await chatService.sendMessage(activeConv.id, content)
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

    return (
        <>
            <div className="social-chat__backdrop" onClick={onClose} />

            <div className="social-chat">
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
                    onClose={onClose}
                    onSend={handleSend}
                    onLoadMore={handleLoadMore}
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
