import { useRef, useEffect, useCallback } from 'react'

/**
 * Smooth "typewriter" output for a streaming chat message.
 *
 * Tokens from the API go into a ref-backed queue (zero React overhead). A 60ms
 * drain timer appends one character per tick to the last message — but only while
 * that message is still `streaming` — producing smooth output regardless of how
 * the network delivers chunks.
 *
 * @param {function} setMessages  React state setter for the messages array
 * @returns {{ enqueue: (text:string)=>void, start: ()=>void, stop: ()=>void }}
 */
export function useTypewriter(setMessages) {
    const queueRef = useRef('')
    const timerRef = useRef(null)

    const start = useCallback(() => {
        if (timerRef.current) return
        timerRef.current = setInterval(() => {
            const q = queueRef.current
            if (!q.length) return
            const chunk = q.slice(0, 1)
            queueRef.current = q.slice(1)
            setMessages(prev => {
                const msgs = [...prev]
                const last = msgs[msgs.length - 1]
                if (!last?.streaming) return prev
                msgs[msgs.length - 1] = { ...last, content: last.content + chunk }
                return msgs
            })
        }, 60)
    }, [setMessages])

    const stop = useCallback(() => {
        clearInterval(timerRef.current)
        timerRef.current = null
        queueRef.current = ''
    }, [])

    const enqueue = useCallback((text) => { queueRef.current += text }, [])

    // Stop the timer if the component unmounts mid-stream.
    useEffect(() => () => clearInterval(timerRef.current), [])

    return { enqueue, start, stop }
}
