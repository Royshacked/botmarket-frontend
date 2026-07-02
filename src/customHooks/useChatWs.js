import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { chatWsService } from '../services/chat/chatWs.service'
import { chatService } from '../services/chat/chat.service'

export function useChatWs(userId) {
    const navigate = useNavigate()
    const [unread, setUnread] = useState(0)
    const [showChat, setShowChat] = useState(false)
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
        function onNewMessage() {
            if (!showChatRef.current) setUnread(u => u + 1)
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

    return { unread, setUnread, showChat, setShowChat }
}
