import { useRef, useEffect } from 'react'

/**
 * Auto-follow scrolling for a streaming chat transcript.
 *
 * Follows new output only while the user is parked at (or near) the bottom — if
 * they scroll up to read, their position is left untouched. Sending a message
 * (message count changes) re-engages follow.
 *
 * @param {Array}  messages
 * @param {object} [opts]
 * @param {function} [opts.onFinishStreaming]  called once when streaming ends (e.g. refocus input)
 * @returns {{ messagesRef, messagesEndRef, handleScroll }}
 */
export function useChatScroll(messages, { onFinishStreaming } = {}) {
    const messagesRef    = useRef(null)
    const messagesEndRef = useRef(null)
    const stickToBottom  = useRef(true)
    const prevCount      = useRef(0)
    const wasStreaming   = useRef(false)

    function isNearBottom() {
        const el = messagesRef.current
        if (!el) return true
        return el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }

    // The user scrolling is what decides whether we keep following the response.
    function handleScroll() { stickToBottom.current = isNearBottom() }

    useEffect(() => {
        const streaming    = messages.some(m => m.streaming)
        const countChanged = messages.length !== prevCount.current
        const justFinished = wasStreaming.current && !streaming

        prevCount.current    = messages.length
        wasStreaming.current = streaming

        // A new message (the user just sent) re-engages auto-follow.
        if (countChanged) stickToBottom.current = true
        if (stickToBottom.current) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        if (justFinished) onFinishStreaming?.()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages])

    return { messagesRef, messagesEndRef, handleScroll }
}
