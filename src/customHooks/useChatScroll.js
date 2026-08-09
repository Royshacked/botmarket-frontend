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
 * @param {*}        [opts.watch]  extra value to re-pin on when it changes (e.g. the
 *                                 tool-status chip, which isn't part of `messages`)
 * @returns {{ messagesRef, messagesEndRef, handleScroll }}
 */
export function useChatScroll(messages, { watch } = {}) {
    const messagesRef          = useRef(null)
    const messagesEndRef       = useRef(null)
    const stickToBottom        = useRef(true)
    const prevCount            = useRef(0)
    const programmaticScroll   = useRef(false)
    const programmaticTimerRef = useRef(null)

    function isNearBottom() {
        const el = messagesRef.current
        if (!el) return true
        return el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }

    // Only update stickToBottom from genuine user-initiated scrolls, not from
    // the scroll events that fire during a programmatic smooth-scroll animation.
    function handleScroll() {
        if (programmaticScroll.current) return
        stickToBottom.current = isNearBottom()
    }

    useEffect(() => {
        const countChanged = messages.length !== prevCount.current
        prevCount.current  = messages.length

        // A new message (the user just sent) re-engages auto-follow.
        if (countChanged) stickToBottom.current = true
        if (stickToBottom.current) {
            // While a message streams (same count, content growing) pin instantly
            // each frame — a 'smooth' animation restarts on every token and ends up
            // lurching. Reserve the smooth scroll for discrete jumps (new message).
            const behavior = countChanged ? 'smooth' : 'auto'
            if (behavior === 'smooth') {
                // Block handleScroll from disengaging follow during the smooth
                // animation — it fires intermediate events before reaching the bottom.
                clearTimeout(programmaticTimerRef.current)
                programmaticScroll.current = true
                programmaticTimerRef.current = setTimeout(() => {
                    programmaticScroll.current = false
                }, 500)
            }
            messagesEndRef.current?.scrollIntoView({ behavior })
        }
    }, [messages, watch])

    return { messagesRef, messagesEndRef, handleScroll }
}
