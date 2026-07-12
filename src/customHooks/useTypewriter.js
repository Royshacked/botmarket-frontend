import { useRef, useEffect, useCallback } from 'react'
import { PACE_DEFAULT } from './useTextPace.js'

/**
 * Smooth "typewriter" output for a streaming chat message.
 *
 * Tokens from the API go into a ref-backed queue (zero React overhead). A fixed
 * ~16ms timer reveals the queue at a constant `paceCps` characters per second (the
 * pace slider) — a slower, fractional rate is carried across ticks, so even a leisurely
 * pace types out one char at a time rather than stalling. `paceCps` is read live, so
 * dragging the slider mid-reply takes effect immediately.
 *
 * The model streams faster than the slider pace, so a backlog builds and keeps typing
 * at that same constant pace even after the network finishes — `finish()` types out
 * the remainder, then swaps in the final message. Uniform speed throughout, set purely
 * by the slider: no catch-up bursts, no fast-then-slow. The trade-off is that a long
 * reply at a slow pace keeps typing for a while after the model is done.
 *
 * @param {function} setMessages  React state setter for the messages array
 * @param {number}   [paceCps]    reveal speed in chars/sec (from useTextPace)
 * @returns {{ enqueue:(t:string)=>void, start:()=>void, stop:()=>void,
 *            finish:(msg:object, onComplete?:(msgs:Array)=>void)=>void }}
 */
const TICK_MS = 16    // ~60fps; pace is enforced via chars-per-tick, not interval

export function useTypewriter(setMessages, paceCps = PACE_DEFAULT) {
    const queueRef   = useRef('')
    const timerRef   = useRef(null)
    const finishRef  = useRef(null)   // { msg, onComplete } once the stream is done
    const accRef     = useRef(0)      // carried fractional chars (for slow paces)
    const paceRef    = useRef(paceCps)

    useEffect(() => { paceRef.current = paceCps }, [paceCps])

    function tick() {
        const q = queueRef.current
        if (q.length) {
            const pace = paceRef.current
            // Reveal at exactly the slider pace, start to finish — a constant speed with
            // no catch-up bursts. The model streams faster than this, so a backlog builds
            // and keeps typing at the slider pace even after the network finishes (handled
            // by finish() below). Uniform speed throughout: no fast-then-slow.
            accRef.current += pace * (TICK_MS / 1000)
            let n = Math.floor(accRef.current)
            accRef.current -= n
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
                // `msg.content === undefined` = keep-accumulated mode (phase-threaded chats): the
                // last bubble already holds this phase's streamed text, so just drop the streaming
                // flag + merge extras (reasoning) instead of swapping in a whole-reply content.
                if (last?.streaming) {
                    msgs[msgs.length - 1] = fin.msg.content === undefined
                        ? { ...last, ...fin.msg, streaming: false }
                        : fin.msg
                }
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

    // Reveal-and-clear the remaining backlog synchronously, returning it. Used at a phase boundary
    // to flush the previous phase's un-typed tail into its bubble before that bubble is frozen, so
    // pace-lag can't misattribute it to the next phase.
    const drainQueue = useCallback(() => {
        const q = queueRef.current
        queueRef.current = ''
        accRef.current   = 0
        return q
    }, [])

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

    return { enqueue, start, stop, finish, drainQueue }
}
