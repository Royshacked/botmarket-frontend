import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { chatWsService } from '../services/chat/chatWs.service'
import { chatService } from '../services/chat/chat.service'
import { playNotify } from '../services/sound.service'
import { showUserMsg } from '../services/event-bus.service'
import { AGENTS, isBotId } from '../cmps/AxlHub/agentMeta.jsx'

// Special-card messages carry a human-readable `content` summary (it's what the
// conversation list shows), so we prefer that; this is only a fallback for the
// rare empty-content card.
const TYPE_LABELS = {
    invalidation_alert: 'Trade alert',
    portfolio_review:   'Portfolio review',
    manual_fill:        'Fill confirmation',
    entry_confirm:      'Confirm entry',
    call_expiry:        'Call update',
}

// One-line preview for the incoming-message toast. Bot senders resolve to their
// brand (Idea / Atlas / Argus / axl); human DMs use `senderName` (attached to the
// WS payload by the server) so the toast shows who it's from.
export function chatPreview(msg) {
    const who  = isBotId(msg?.senderId) ? (AGENTS[msg.senderId]?.brand ?? null) : (msg?.senderName ?? null)
    const body = (msg?.content && String(msg.content).trim())
        ? String(msg.content).replace(/\s+/g, ' ').slice(0, 80)
        : (TYPE_LABELS[msg?.type] ?? 'New message')
    return who ? `💬 ${who}: ${body}` : `💬 ${body}`
}

export function useChatWs(userId) {
    const navigate = useNavigate()
    const [unread, setUnread] = useState(0)
    const [showChat, setShowChat] = useState(false)
    // Conversation to auto-open when the chat panel is launched from a preview
    // toast; null on a plain header-button open.
    const [pendingConvId, setPendingConvId] = useState(null)
    const showChatRef = useRef(false)
    useEffect(() => { showChatRef.current = showChat }, [showChat])

    useEffect(() => {
        if (!userId) { chatWsService.disconnect(); return }
        chatWsService.connect()
        return () => chatWsService.disconnect()
    }, [userId])

    // Seed the badge with the persisted unread total on app open, so the count
    // shows without needing to open the chat first. The chat panel keeps it in
    // sync afterwards via onUnreadChange.
    useEffect(() => {
        if (!userId) { setUnread(0); return }
        let cancelled = false
        chatService.getConversations()
            .then(convs => {
                if (cancelled || showChatRef.current) return
                setUnread(convs.reduce((s, c) => s + (c.unread ?? 0), 0))
            })
            .catch(() => { /* ignore — live ws events still increment */ })
        return () => { cancelled = true }
    }, [userId])

    useEffect(() => {
        if (!userId) return
        function onNewMessage(msg) {
            // The server only pushes to the recipient, so a self-echo shouldn't
            // happen — guard anyway. Stay silent while the chat panel is open:
            // the panel renders the message live and mirrors the badge, so a
            // sound/toast there would just be noise (same suppression the badge
            // already uses).
            if (msg?.senderId === userId) return
            if (showChatRef.current) return
            setUnread(u => u + 1)
            playNotify()
            const convId = msg?.conversationId ?? null
            showUserMsg({
                txt:     chatPreview(msg),
                type:    'chat',
                onClick: () => { setPendingConvId(convId); setShowChat(true) },
            })
        }
        chatWsService.on('new_message', onNewMessage)
        return () => chatWsService.off('new_message', onNewMessage)
    }, [userId])

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        if (params.get('broker') === 'connected') {
            window.history.replaceState({}, '', window.location.pathname)
            navigate('/profile')
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only OAuth redirect; navigate is stable
    }, [])

    return { unread, setUnread, showChat, setShowChat, pendingConvId, setPendingConvId }
}
