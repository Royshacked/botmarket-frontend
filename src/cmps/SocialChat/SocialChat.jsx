import { useState, useEffect, useCallback, useRef } from 'react'
import PropTypes from 'prop-types'
import { chatService }   from '../../services/chat/chat.service'
import { chatWsService } from '../../services/chat/chatWs.service'
import { ConversationList } from './ConversationList'
import { ChatWindow }       from './ChatWindow'
import { readStoredModel }       from '../modelOptions'
import { isBotId, isRetiredBotId, CONVERSATIONAL_BOT_ID } from '../AxlHub/agentMeta.jsx'
import './SocialChat.scss'

// Sending into the Axl thread generates an Axl reply, so it needs a model like any other Axl
// turn. One stored setting serves every desk (services/aiPrefKeys.js), so this is the same value
// AxlHub reads and the bot runs on the same model on both of its surfaces.
function readAiPref() {
    return { model: readStoredModel() }
}

const PAGE = 50

export function SocialChat({ currentUserId, initialConvId, initialMsgId, onUnreadChange, onClose }) {
    const [conversations, setConversations] = useState([])
    const [activeConv,    setActiveConv]    = useState(null)
    const [messages,      setMessages]      = useState([])
    const [hasMore,       setHasMore]       = useState(false)
    const [loading,       setLoading]       = useState(false)
    const [closing,       setClosing]       = useState(false)
    const activeConvRef = useRef(null)
    // Auto-open target (from a preview-toast click). Consumed once per value so a
    // later conversations-list refresh doesn't yank the user back to it.
    const consumedConvRef = useRef(null)
    // The specific message a notification click wants to land on — ChatWindow scrolls
    // to it once it's loaded, then calls back to clear it (a one-shot highlight).
    const [scrollToMsgId, setScrollToMsgId] = useState(null)

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
            // The server already hides retired feeds; this repeats it because the failure mode is
            // silent — a retired id the client doesn't drop renders as a PERSON, and its unread
            // count keeps feeding a badge for a thread you can't act on.
            const convs = (await chatService.getConversations())
                .filter(c => !c.participants.some(isRetiredBotId))
            const bots = convs.filter(c => c.participants.some(isBotId))
            const rest = convs.filter(c => !c.participants.some(isBotId))
            setConversations([...bots, ...rest])
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

    // ── Auto-open the conversation from a preview-toast click ────────────────
    // Waits for the list to load (the target may not be there on first render),
    // then selects it once. The ref guards against re-selecting on later list
    // updates (e.g. an incoming message re-maps `conversations`).
    useEffect(() => {
        if (!initialConvId) { consumedConvRef.current = null; return }
        if (consumedConvRef.current === initialConvId) return
        const conv = conversations.find(c => c.id === initialConvId)
        if (!conv) return
        consumedConvRef.current = initialConvId
        setScrollToMsgId(initialMsgId ?? null)   // land on the clicked notification once it loads
        handleSelectConv(conv)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- handleSelectConv is a stable per-render decl; re-adding it would loop
    }, [initialConvId, initialMsgId, conversations])

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

    // Mobile only: the two panes collapse to one, so leaving a conversation is how you get
    // back to the list. `consumedConvRef` is deliberately left alone — the auto-open target
    // is spent, and clearing it would yank the user straight back into the thread.
    function handleBackToList() {
        setActiveConv(null)
        setMessages([])
        setHasMore(false)
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
        // Only the Axl thread is conversational (it generates a reply), so it's the only
        // one that needs the AI-mode pref. Specialist bots are notify-only feeds.
        const toAxl = activeConv.participants.includes(CONVERSATIONAL_BOT_ID)
        const msg = await chatService.sendMessage(activeConv.id, content, toAxl ? readAiPref() : null)
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

    // Resolve a card (done | dismissed) so the choice sticks: patch it locally now, and persist
    // server-side so it stays collapsed on reload. Does not touch the idea's invalidation latch.
    async function handleResolveMessage(msgId, { status = 'dismissed', outcome = null } = {}) {
        if (!activeConv) return
        setMessages(prev => prev.map(m => m.id === msgId
            ? { ...m, status, resolvedAt: Date.now(), resolveOutcome: outcome }
            : m))
        try {
            await chatService.resolveMessage(activeConv.id, msgId, { status, outcome })
        } catch (err) {
            console.error('[SocialChat] resolve failed', err)
        }
    }

    return (
        <>
            <div className="social-chat__backdrop" onClick={handleClose} />

            <div className={`social-chat${closing ? ' social-chat--closing' : ''}${activeConv ? ' social-chat--conv-open' : ''}`}>
                <div className="social-chat__topbar">
                    <div className="social-chat__topbar-left">
                        {activeConv && (
                            <button
                                className="social-chat__topbar-back"
                                onClick={handleBackToList}
                                aria-label="Back to conversations"
                            >‹</button>
                        )}
                        <span className="social-chat__topbar-title">Messages</span>
                    </div>
                    <button className="social-chat__topbar-close" onClick={handleClose} aria-label="Close">✕</button>
                </div>

                <div className="social-chat__body">
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
                        onResolveMessage={handleResolveMessage}
                        scrollToMsgId={scrollToMsgId}
                        onScrolledToMsg={() => setScrollToMsgId(null)}
                    />
                </div>
            </div>
        </>
    )
}

SocialChat.propTypes = {
    currentUserId:  PropTypes.string,
    initialConvId:  PropTypes.string,
    initialMsgId:   PropTypes.string,
    onUnreadChange: PropTypes.func,
    onClose:        PropTypes.func,
}
