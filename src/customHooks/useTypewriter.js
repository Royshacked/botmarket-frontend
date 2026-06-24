import { useRef, useEffect, useCallback } from 'react'
import { PACE_DEFAULT } from './useTextPace.js'

/**
 * Smooth "typewriter" output for a streaming chat message.
 *
 * Tokens from the API go into a ref-backed queue (zero React overhead). A fixed
 * ~16ms timer reveals the queue at `paceCps` characters per second — a slower,
 * fractional rate is carried across ticks, so even a leisurely pace types out
 * one char at a time rather than stalling. `paceCps` is read live, so dragging
 * the pace slider mid-reply takes effect immediately.
 *
 * The model streams faster than reading pace, so a backlog builds during the
 * response. Rather than dumping it when the network finishes, `finish()` keeps
 * typing the remainder and only then swaps in the final message — so the reply
 * streams smoothly to its last character. A catch-up cap (~CATCHUP_SECONDS worth
 * of pace) keeps very long replies, or a backgrounded tab, from crawling.
 *
 * @param {function} setMessages  React state setter for the messages array
 * @param {number}   [paceCps]    reveal speed in chars/sec (from useTextPace)
 * @returns {{ enqueue:(t:string)=>void, start:()=>void, stop:()=>void,
 *            finish:(msg:object, onComplete?:(msgs:Array)=>void)=>void }}
 */
const TICK_MS         = 16   // ~60fps; pace is enforced via chars-per-tick, not interval
const CATCHUP_SECONDS = 6    // never let the backlog exceed this many seconds of pace

export function useTypewriter(setMessages, paceCps = PACE_DEFAULT) {
    const queueRef  = useRef('')
    const timerRef  = useRef(null)
    const finishRef = useRef(null)   // { msg, onComplete } once the stream is done
    const accRef    = useRef(0)      // carried fractional chars (for slow paces)
    const paceRef   = useRef(paceCps)

    useEffect(() => { paceRef.current = paceCps }, [paceCps])

    function tick() {
        const q = queueRef.current
        if (q.length) {
            const pace = paceRef.current
            accRef.current += pace * (TICK_MS / 1000)
            let n = Math.floor(accRef.current)
            accRef.current -= n
            // Catch-up: if the backlog grows past a few seconds of pace (long reply,
            // or the tab was backgrounded and the timer coalesced), accelerate so
            // the tail doesn't take forever — clearing the excess over ~1 second.
            const maxLag = Math.max(120, pace * CATCHUP_SECONDS)
            if (q.length > maxLag) {
                n = Math.max(n, Math.ceil((q.length - maxLag) / (1000 / TICK_MS)))
            }
            if (n < 1) return   // slow pace — reveal nothing this tick, carry the fraction
            const take  = Math.min(n, q.length)
            const chunk = q.slice(0, take)
            queueRef.current = q.slice(take)
            setMessages(prev => {
                const msgs = [...prev]
                const last = msgs[msgs.length - 1]
                if (!last?.streaming) return prev
                msgs[msgs.length - 1] = { ...last, content: last.content + chunk }
                return msgs
            })
            return
        }
        // Backlog drained. If the stream is done, swap in the authoritative final
        // message (drops the `streaming` flag) and stop the timer.
        accRef.current = 0
        const fin = finishRef.current
        if (fin) {
            finishRef.current = null
            clearInterval(timerRef.current)
            timerRef.current = null
            let finalized = null
            setMessages(prev => {
                const msgs = [...prev]
                const last = msgs[msgs.length - 1]
                if (last?.streaming) msgs[msgs.length - 1] = fin.msg
                finalized = msgs
                return msgs
            })
            fin.onComplete?.(finalized)
        }
    }

    const ensureTimer = () => {
        if (!timerRef.current) timerRef.current = setInterval(tick, TICK_MS)
    }

    const start = useCallback(() => { ensureTimer() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

    const enqueue = useCallback((text) => { queueRef.current += text }, [])

    // Stream finished cleanly: keep typing the rest of the queue, then set `msg`
    // (the final reply, without a `streaming` flag). onComplete receives the
    // finalized messages array — use it for persistence that needs the final text.
    const finish = useCallback((msg, onComplete) => {
        finishRef.current = { msg, onComplete }
        ensureTimer()
    }, [])  // eslint-disable-line react-hooks/exhaustive-deps

    // Hard stop (user pressed Stop, or an error): drop the timer and any backlog.
    // The caller sets the final/partial message itself.
    const stop = useCallback(() => {
        clearInterval(timerRef.current)
        timerRef.current  = null
        queueRef.current  = ''
        accRef.current    = 0
        finishRef.current = null
    }, [])

    // Stop the timer if the component unmounts mid-stream.
    useEffect(() => () => clearInterval(timerRef.current), [])

    return { enqueue, start, stop, finish }
}
