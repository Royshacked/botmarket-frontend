import { useState, useRef } from 'react'
import { useTextPace } from './useTextPace.js'
import { useTypewriter } from './useTypewriter.js'
import { makeStreamHandlers } from './useStreamStop.js'
import { toolStatusLabel } from '../services/toolStatusLabels.js'

/**
 * Shared streaming machinery for the three agent chats (idea / scanner /
 * portfolio). Owns the messages list, loading/status/phase state, the typewriter
 * drain, the abort wiring, and the delicate "keep Stop live until the drain
 * finishes" (deferLoading) dance — the parts that were copy-pasted three ways and
 * drifted. Each panel keeps its own request params and onDone tail.
 *
 * Usage:
 *   const chat = useChatStream()
 *   async function send(text) {
 *     if (!text || chat.isLoading) return
 *     const history = [...]                         // panel builds its own history
 *     const { signal, handlers } = chat.begin(text, {
 *       onDone: (data) => {                         // panel-specific completion
 *         chat.finishStreaming({ role: 'assistant', content: data.reply, ...extras })
 *         // ...side effects (setPendingPlan, analysisState, …)
 *       },
 *       // optional extra/override handlers (onTicker, onAsset, onChart, …)
 *     })
 *     try { await service.sendStream(history, { ...params, signal, ...handlers }) }
 *     catch { chat.freezeError() }
 *     finally { chat.endStream() }
 *   }
 *
 * @returns {{
 *   messages: object[], setMessages: Function,
 *   isLoading: boolean, streamStatus: string,
 *   phase: number|null, setPhase: Function,
 *   begin: (userText: string, extraHandlers?: object) => { signal: AbortSignal, handlers: object },
 *   finishStreaming: (finalMsg: object) => void,
 *   endStream: () => void,
 *   reset: () => void,
 *   handleStop: () => void,
 *   freezeError: (message?: string) => void,
 *   reasoningRef: React.MutableRefObject<string>,
 * }}
 */
export function useChatStream() {
    const [messages, setMessages]         = useState([])
    const [isLoading, setIsLoading]       = useState(false)
    const [streamStatus, setStreamStatus] = useState('')
    const [phase, setPhase]               = useState(null)

    const reasoningRef = useRef('')
    const abortRef     = useRef(null)
    const deferRef     = useRef(false)
    const phaseRef     = useRef(null)
    phaseRef.current   = phase

    const { paceCps } = useTextPace()
    const { enqueue: enqueueToken, start: startDrain, stop: stopDrain, finish: finishDrain } = useTypewriter(setMessages, paceCps)
    const { handleStop, freezeError } = makeStreamHandlers({ abortRef, stopDrain, setMessages, setIsLoading })

    /**
     * Optimistically append the user turn + a streaming assistant placeholder,
     * reset per-send state, open an AbortController, and return its signal plus the
     * shared SSE handler bag. Spread `handlers` into the service call; pass
     * `extraHandlers` to add (onTicker/onAsset/onChart) or override (onDone — which
     * every caller supplies).
     */
    function begin(userText, extraHandlers = {}) {
        setMessages(prev => [
            ...prev,
            { role: 'user', content: userText },
            { role: 'assistant', content: '', streaming: true },
        ])
        setIsLoading(true)
        setStreamStatus('')
        reasoningRef.current = ''
        deferRef.current     = false
        startDrain()

        const ctrl = new AbortController()
        abortRef.current = ctrl
        // Fixed baseline for this stream's phase-heading de-dup — mirrors the original
        // per-send closure capture (the model re-emits a phase tag every turn, so a
        // heading is only inserted when the phase differs from where this send started).
        const sendPhase = phaseRef.current

        const handlers = {
            onToken:  (t)    => { setStreamStatus(''); enqueueToken(t) },
            onStatus: (tool) => setStreamStatus(toolStatusLabel(tool)),
            onReasoning: (t) => {
                reasoningRef.current += t
                const acc = reasoningRef.current
                setMessages(prev => {
                    const idx = prev.findIndex(m => m.streaming)
                    if (idx < 0) return prev
                    const next = [...prev]
                    next[idx] = { ...next[idx], reasoning: acc }
                    return next
                })
            },
            onPhase: (p) => {
                if (!p) return
                const changed = p !== sendPhase
                setPhase(p)
                if (!changed) return
                setMessages(prev => {
                    const idx = prev.findIndex(m => m.streaming)
                    if (idx < 0) return prev
                    const next = [...prev]
                    next.splice(idx, 0, { role: 'phase', phase: p })
                    return next
                })
            },
            onError: (message) => freezeError(message),
            ...extraHandlers,
        }
        return { signal: ctrl.signal, handlers }
    }

    /**
     * Call from the caller's onDone once the final assistant message is built.
     * Visually finishes typing the backlog then swaps in `finalMsg` (no end-of-stream
     * dump), keeping isLoading true until the drain ends so Stop stays live.
     * Accumulated reasoning is attached automatically (finalMsg may override it).
     */
    function finishStreaming(finalMsg) {
        deferRef.current = true
        const msg = reasoningRef.current ? { reasoning: reasoningRef.current, ...finalMsg } : finalMsg
        finishDrain(msg, () => setIsLoading(false))
    }

    // Call in the send's finally: on error/abort the drain was hard-stopped so
    // onComplete won't fire — clear loading here. A clean finish deferred it.
    function endStream() {
        if (!deferRef.current) setIsLoading(false)
        setStreamStatus('')
    }

    // Clear the shared streaming state (panels clear their own extra state alongside).
    function reset() {
        setMessages([])
        setPhase(null)
        setStreamStatus('')
    }

    return {
        messages, setMessages,
        isLoading, streamStatus,
        phase, setPhase,
        begin, finishStreaming, endStream, reset,
        handleStop, freezeError,
        reasoningRef,
    }
}
