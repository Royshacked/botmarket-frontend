import { useState, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { chatService }   from '../../services/chat/chat.service'
import { chatWsService } from '../../services/chat/chatWs.service'
import { ConversationList } from './ConversationList'
import { ChatWindow }       from './ChatWindow'
import './SocialChat.scss'

const PAGE = 50

export function SocialChat({ currentUserId, onUnreadChange, onClose }) {
    const [conversations, setConversations] = useState([])
    const [activeConv,    setActiveConv]    = useState(null)
    const [messages,      setMessages]      = useState([])
    const [hasMore,       setHasMore]       = useState(false)
    const [loading,       setLoading]       = useState(false)

    // ── Load conversation list ─────────────────────────────────────────────
    const loadConversations = useCallback(async () => {
        try {
            const convs = await chatService.getConversations()
            setConversations(convs)
            const total = convs.reduce((sum, c) => sum + (c.unread ?? 0), 0)
            onUnreadChange?.(total)
        } catch { /* ignore */ }
    }, [onUnreadChange])

    useEffect(() => { loadConversations() }, [loadConversations])

    // ── WS: re-fetch conversations on connect; append new messages ─────────
    useEffect(() => {
        function onConnected() { loadConversations() }

        function onNewMessage(msg) {
            // Update conversation list preview + unread
            setConversations(prev => {
                const updated = prev.map(c => {
                    if (c.id !== msg.conversationId) return c
                    const isActive = activeConvRef.current?.id === c.id
                    return {
                        ...c,
                        lastMessage:    msg.content,
                        lastMessageAt:  msg.createdAt,
                        unread: isActive ? 0 : (c.unread ?? 0) + 1,
                    }
                })
                const total = updated.reduce((sum, c) => sum + (c.unread ?? 0), 0)
                onUnreadChange?.(total)
                return updated
            })
            // Append to open chat window
            setActiveConv(prev => {
                if (prev?.id === msg.conversationId) {
                    setMessages(m => [...m, msg])
                }
                return prev
            })
        }

        chatWsService.on('connected',   onConnected)
        chatWsService.on('new_message', onNewMessage)
        return () => {
            chatWsService.off('connected',   onConnected)
            chatWsService.off('new_message', onNewMessage)
        }
    }, [loadConversations, onUnreadChange])

    // Keep a ref to activeConv so the WS handler can read it without stale closure
    const activeConvRef = { current: activeConv }
    useEffect(() => { activeConvRef.current = activeConv }, [activeConv])

    // ── Open a conversation ────────────────────────────────────────────────
    async function handleSelectConv(conv) {
        setActiveConv(conv)
        setMessages([])
        setLoading(true)
        try {
            const msgs = await chatService.getMessages(conv.id)
            setMessages(msgs)
            setHasMore(msgs.length === PAGE)
            await chatService.markRead(conv.id)
            setConversations(prev => prev.map(c =>
                c.id === conv.id ? { ...c, unread: 0 } : c
            ))
            const total = conversations.reduce((sum, c) => sum + (c.id === conv.id ? 0 : (c.unread ?? 0)), 0)
            onUnreadChange?.(total)
        } catch { /* ignore */ }
        finally { setLoading(false) }
    }

    // ── Load older messages ────────────────────────────────────────────────
    async function handleLoadMore() {
        if (!activeConv || loading) return
        const oldest = messages[0]?.createdAt
        setLoading(true)
        try {
            const older = await chatService.getMessages(activeConv.id, oldest)
            setMessages(prev => [...older, ...prev])
            setHasMore(older.length === PAGE)
        } catch { /* ignore */ }
        finally { setLoading(false) }
    }

    // ── Send a message ─────────────────────────────────────────────────────
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

    // ── New DM started from search ─────────────────────────────────────────
    function handleConversationStarted(conv) {
        setConversations(prev => {
            const exists = prev.find(c => c.id === conv.id)
            return exists ? prev : [conv, ...prev]
        })
        handleSelectConv(conv)
    }

    return (
        <div className="social-chat__overlay" onClick={e => e.target === e.currentTarget && onClose?.()}>
            <div className="social-chat">
                <button className="social-chat__close" onClick={onClose}>✕</button>

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
                    onSend={handleSend}
                    onLoadMore={handleLoadMore}
                />
            </div>
        </div>
    )
}

SocialChat.propTypes = {
    currentUserId:  PropTypes.string,
    onUnreadChange: PropTypes.func,
    onClose:        PropTypes.func,
}
