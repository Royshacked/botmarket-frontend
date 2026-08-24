import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
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
    manual_entry:       'Fill confirmation',
    manual_exit:        'Close confirmation',
    entry_confirm:      'Confirm entry',
    call_expiry:        'Call update',
    call_manage:        'Manage position',
    call_reentry:       'Re-entry?',
    setup_invalidation: 'Setup update',
    setup_manage:       'Manage position',
    coverage_event:     'Coverage update',
    tilt_event:         'Sector view changed',
    coverage_refreshed: 'Research refreshed',
    queue_ready:        'Market open',
}

// The pieces the preview toast renders: WHO it's from, WHAT it says, and — for a bot
// sender — the agent key + hue that tint its avatar. Bot senders resolve to their brand
// (Idea / Atlas / Argus / axl); human DMs use `senderName` (attached to the WS payload by
// the server) so the toast shows who it's from.
export function chatPreviewParts(msg) {
    const bot  = isBotId(msg?.senderId) ? (AGENTS[msg.senderId] ?? null) : null
    const who  = bot ? (bot.brand ?? null) : (msg?.senderName ?? null)
    const body = (msg?.content && String(msg.content).trim())
        ? String(msg.content).replace(/\s+/g, ' ').slice(0, 80)
        : (TYPE_LABELS[msg?.type] ?? 'New message')
    // agentKey is set only for a KNOWN bot — an unrecognised bot id falls through to the
    // initial-letter avatar rather than rendering an empty glyph slot.
    return { who, body, agentKey: bot ? msg.senderId : null, hue: bot?.hue ?? null }
}

// Flat one-liner form of the same preview. Still the toast's `txt` — it is what a
// screen reader and any non-chat surface read when the rich body isn't rendered.
export function chatPreview(msg) {
    const { who, body } = chatPreviewParts(msg)
    return who ? `💬 ${who}: ${body}` : `💬 ${body}`
}

export function useChatWs(userId) {
    const navigate = useNavigate()
    const [unread, setUnread] = useState(0)
    const [showChat, setShowChat] = useState(false)
    // Conversation (and specific message) to auto-open when the chat panel is launched
    // from a preview toast; null on a plain header-button open. pendingMsgId lets the
    // window scroll straight to the notification the user clicked.
    const [pendingConvId, setPendingConvId] = useState(null)
    const [pendingMsgId, setPendingMsgId]   = useState(null)
    const showChatRef = useRef(false)
    useEffect(() => { showChatRef.current = showChat }, [showChat])

    useEffect(() => {
        if (!userId) { chatWsService.disconnect(); return }
        chatWsService.connect()
        return () => chatWsService.disconnect()
    }, [userId])

    // Re-read the persisted unread total from the server. The badge can't live on WS pushes alone:
    // a WebSocket is a live pipe with no memory, so every message that lands while the socket is
    // down — the 3s reconnect window, a server restart, a sleeping laptop — is never pushed again.
    // A push-only badge therefore drifts DOWN and stays there, and only opening the chat (which
    // does this same REST read) revealed the true count. Mongo always had it; nothing asked.
    // Skipped while the panel is open: it owns the number then, and mirrors it via onUnreadChange.
    const userIdRef = useRef(userId)
    useEffect(() => { userIdRef.current = userId }, [userId])

    const refreshUnread = useCallback(() => {
        if (!userId || showChatRef.current) return   // the panel reads on the same events — don't double-fetch
        chatService.getConversations()
            .then(convs => {
                // Re-checked: the panel may have opened (or the user changed) mid-flight.
                if (showChatRef.current || userIdRef.current !== userId) return
                setUnread(convs.reduce((s, c) => s + (c.unread ?? 0), 0))
            })
            .catch(() => { /* ignore — live ws events still increment */ })
    }, [userId])

    // Seed on app open, then reconcile at every moment the client may have missed a push:
    // a (re)connected socket, the tab coming back to the foreground, the network returning.
    useEffect(() => {
        if (!userId) { setUnread(0); return }
        refreshUnread()

        function onVisible() { if (!document.hidden) refreshUnread() }
        chatWsService.on('connected', refreshUnread)
        document.addEventListener('visibilitychange', onVisible)
        window.addEventListener('online', refreshUnread)
        return () => {
            chatWsService.off('connected', refreshUnread)
            document.removeEventListener('visibilitychange', onVisible)
            window.removeEventListener('online', refreshUnread)
        }
    }, [userId, refreshUnread])

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
                preview: chatPreviewParts(msg),
                type:    'chat',
                onClick: () => { setPendingConvId(convId); setPendingMsgId(msg?.id ?? null); setShowChat(true) },
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

    return { unread, setUnread, showChat, setShowChat, pendingConvId, setPendingConvId, pendingMsgId, setPendingMsgId }
}
