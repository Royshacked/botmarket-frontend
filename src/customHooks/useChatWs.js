import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { chatWsService } from '../services/chat/chatWs.service'

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
