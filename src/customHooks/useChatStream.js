import { useState, useRef, useEffect } from 'react'
import { useTextPace } from './useTextPace.js'
import { useTypewriter } from './useTypewriter.js'
import { makeStreamHandlers } from './useStreamStop.js'
import { newTurnId } from '../services/turn.service.js'
import { toolStatusLabel } from '../services/toolStatusLabels.js'
import { reasoningPulse, pruneSamples } from './reasoningPulse.js'

/**
 * The conversation reduced to role + content, minus the UI-only rows (the streaming
 * placeholder and phase headings). This is both what the AGENT is sent before `begin()` /
 * inside `finalizeResumeHistory()`, and what gets persisted as chat_state where the caller
 * needs no stricter guard — the same reduction, inlined ten times before this.
 *
 * NOT every message list reduces this way, and the variants that remain are deliberate,
 * not copies to fold in later:
 *   - KairosPanel's persistedMessages() is stricter (role + string content) because it
 *     writes chat_state, not a request payload.
 *   - ScannerPanel's handleGenerate chatLog KEEPS phase rows and `tickers` so reopening
 *     a saved list re-renders the conversation exactly.
 *
 * @param {object[]} messages
 * @returns {{ role: string, content: string }[]}
 */
export function toChatHistory(messages) {
    return messages
        // Chart rows carry an image, not text — sending one as a content-less assistant turn is
        // how a model request ends up malformed. They're display-only in every panel.
        .filter(m => !m.streaming && m.role !== 'phase' && m.type !== 'chart')
        .map(m => ({ role: m.role, content: m.content }))
}

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
 *     const history = toChatHistory(chat.messages)  // shared — see below
 *     const { signal, handlers } = chat.begin(text, {
 *       onDone: (data) => {                         // panel-specific completion
 *         chat.finishStreaming({ role: 'assistant', content: data.reply, ...extras })
 *         // ...side effects (setPendingPlan, analysisState, …)
 *       },
 *       // optional extra/override handlers (onTicker, onAsset, …; onChart is built in)
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
export function useChatStream({ threadPhases = false } = {}) {
    const [messages, setMessages]         = useState([])
    const [isLoading, setIsLoading]       = useState(false)
    const [streamStatus, setStreamStatus] = useState('')
    const [phase, setPhase]               = useState(null)

    const reasoningRef = useRef('')
    // Live reasoning ACTIVITY (0-1), distinct from the accumulated text: a flat "thinking…" reads the
    // same whether the model is mid chain-of-thought or stalled on a slow tool.
    const reasoningSamplesRef = useRef([])
    const [reasoningPulseValue, setReasoningPulseValue] = useState(null)

    // Read the samples on a slow timer while a turn is live. 5Hz is fast enough to read as live and
    // slow enough that a burst of deltas costs one render, not hundreds.
    useEffect(() => {
        if (!isLoading) { setReasoningPulseValue(null); return undefined }
        const id = setInterval(() => {
            const now = Date.now()
            setReasoningPulseValue(reasoningPulse(pruneSamples(reasoningSamplesRef.current, now), now))
        }, 200)
        return () => clearInterval(id)
    }, [isLoading])
    // The live chart THIS turn docked, if any — see finishStreaming, which turns it into the turn's
    // history record when the reply itself is wordless.
    const liveChartRef = useRef(null)
    const abortRef     = useRef(null)
    const deferRef     = useRef(false)
    const phaseRef     = useRef(null)
    phaseRef.current   = phase
    const messagesRef  = useRef([])   // live mirror so beginContinue can read the last bubble synchronously
    messagesRef.current = messages

    const { paceCps } = useTextPace()
    const { enqueue: enqueueToken, start: startDrain, stop: stopDrain, finish: finishDrain, drainQueue } = useTypewriter(setMessages, paceCps)
    // The id of the turn in flight, so Stop can name what to stop. Minted per send in begin().
    const turnRef = useRef(null)
    const { handleStop, freezeError } = makeStreamHandlers({ abortRef, stopDrain, setMessages, setIsLoading, turnRef })

    /**
     * Optimistically append the user turn + a streaming assistant placeholder,
     * reset per-send state, open an AbortController, and return its signal plus the
     * shared SSE handler bag. Spread `handlers` into the service call; pass
     * `extraHandlers` to add (onTicker/onAsset) or override (onDone — which every caller
     * supplies; onChart is handled here by default and only rarely needs overriding).
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
        reasoningSamplesRef.current = []
        liveChartRef.current = null   // per-turn: only THIS turn's chart may become its history note
        deferRef.current     = false
        startDrain()

        const ctrl = new AbortController()
        abortRef.current = ctrl
        // Sent with the request so the server can be told to stop THIS turn. Without it a turn still
        // streams; it just cannot be stopped once the connection is closed.
        turnRef.current = newTurnId()
        // Fixed baseline for this stream's phase-heading de-dup — mirrors the original
        // per-send closure capture (the model re-emits a phase tag every turn, so a
        // heading is only inserted when the phase differs from where this send started).
        const sendPhase = phaseRef.current
        // The turn id travels INSIDE the handlers bag on purpose. Every caller already spreads that bag
        // into the service's opts, and streamAgent reads `opts.turnId` from there — so all seven desks
        // gain a stoppable turn without a single call site changing. A field each service had to
        // remember to forward would have been forgotten by one of them, and the failure is silent: the
        // turn simply becomes unstoppable.
        const handlers = { ..._buildHandlers(sendPhase, extraHandlers), turnId: turnRef.current }
        return { signal: ctrl.signal, handlers, turnId: turnRef.current }
    }

    // ── Resume (▶) — shared across every agent chat ────────────────────────────────
    // A stopped assistant turn is resumable whether or not it captured any text — this is a
    // property of the stream state machine, so it lives here (not re-derived in each panel).
    // The button (ChatInputRow) shows ▶ whenever canResume && the input is empty.
    const lastMsg   = messages[messages.length - 1]
    const canResume = !isLoading && lastMsg?.role === 'assistant' && !!lastMsg?.stopped

    // The resumable partial for the current last message: real partial text (trailing whitespace
    // trimmed for a clean prefill), or '' when it was stopped before any token (→ regenerate).
    function resumeBase() {
        const last = messagesRef.current[messagesRef.current.length - 1]
        return (last?.content && last.content !== '_(stopped)_') ? last.content.replace(/\s+$/, '') : ''
    }

    // Prepare the model-facing history for a resume: drop the trailing stopped placeholder / empty
    // turn, then — only when continuing a real partial (base non-empty) — end the history with that
    // partial as the assistant prefill. An empty base leaves the history ending at the user turn so
    // the model regenerates. `history` is the panel's already-filtered+mapped [{role,content}] list.
    function finalizeResumeHistory(history, base) {
        const h = history.filter(m => m.content && m.content !== '_(stopped)_')
        if (base && h.length && h[h.length - 1].role === 'assistant') {
            h[h.length - 1] = { role: 'assistant', content: base }
        }
        return h
    }

    /**
     * Resume a stopped assistant reply. With a real partial it CONTINUES the same bubble in place
     * (prefill); stopped before any token it REGENERATES a fresh reply. Reopens the last assistant
     * bubble as the streaming target; the caller's onDone finishes with `base + continuation`
     * (base is '' for a regenerate). Returns null when the last bubble isn't a stopped reply.
     */
    function beginContinue(extraHandlers = {}) {
        const msgs = messagesRef.current
        const last = msgs[msgs.length - 1]
        if (!last || last.role !== 'assistant' || !last.stopped) return null
        // The resumable partial (trailing whitespace trimmed — Anthropic rejects a prefill that
        // ends in whitespace). Empty base = the reply was stopped before any token → REGENERATE:
        // reopen an empty bubble and let the model produce a fresh reply (no prefill).
        const base = resumeBase()

        // Reopen the frozen bubble for streaming; drop the stopped flag, keep the text.
        setMessages(prev => {
            const next = [...prev]
            const i = next.length - 1
            if (next[i]?.role === 'assistant') next[i] = { ...next[i], content: base, streaming: true, stopped: false }
            return next
        })
        setIsLoading(true)
        setStreamStatus('')
        reasoningRef.current = ''
        reasoningSamplesRef.current = []
        liveChartRef.current = null   // per-turn: only THIS turn's chart may become its history note
        deferRef.current     = false
        startDrain()

        const ctrl = new AbortController()
        abortRef.current = ctrl
        // Sent with the request so the server can be told to stop THIS turn. Without it a turn still
        // streams; it just cannot be stopped once the connection is closed.
        turnRef.current = newTurnId()
        const handlers = { ..._buildHandlers(phaseRef.current, extraHandlers), turnId: turnRef.current }
        return { signal: ctrl.signal, handlers, base, turnId: turnRef.current }
    }

    // Shared SSE handler bag for begin() and beginContinue(). `sendPhase` fixes the
    // phase-heading de-dup baseline for this stream; extraHandlers add/override
    // (onDone is always supplied by the caller).
    function _buildHandlers(sendPhase, extraHandlers) {
        return {
            onToken:  (t)    => { setStreamStatus(''); enqueueToken(t) },
            onStatus: (tool) => setStreamStatus(toolStatusLabel(tool)),
            // A chart the AGENT rendered and read (get_chart with show_to_user) — an inline row in
            // the thread, because it is evidence belonging to the turn that produced it. A chart the
            // USER asked for never arrives here: it docks at the bottom of the chat instead
            // (services/sse.util.js routes `live` payloads straight to the chart store).
            //
            // Handled HERE so every agent chat shows it identically, and because this hook is the one
            // place that knows WHERE the row goes: just BEFORE the streaming bubble, so the chart
            // reads as part of that turn and auto-scroll still lands on the text.
            // The turn docked a chart the user asked for. Nothing to render (the dock owns it), but
            // the turn must not end up looking like it never happened — see finishStreaming.
            onLiveChart: (data) => { liveChartRef.current = data },
            onChart: (data) => {
                if (!data?.imageBase64) return
                setMessages(prev => {
                    const msgs = [...prev]
                    const chartMsg = {
                        role:        'assistant',
                        type:        'chart',
                        symbol:      data.symbol,
                        timeframe:   data.timeframe,
                        imageBase64: data.imageBase64,
                    }
                    const lastIdx = msgs.length - 1
                    if (msgs[lastIdx]?.streaming) msgs.splice(lastIdx, 0, chartMsg)
                    else msgs.push(chartMsg)
                    return msgs
                })
            },
            onReasoning: (t) => {
                reasoningRef.current += t
                // Sample into a ref, never state: deltas arrive far faster than anything should
                // re-render. The ticker below reads this on a slow timer.
                reasoningSamplesRef.current.push({ t: Date.now(), n: t.length })
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
                // In threadPhases mode (Kairos runs all phases in ONE reply), if the current bubble
                // already holds text, freeze it as the previous phase's bubble and open a fresh
                // streaming bubble under the new heading — so each phase's content threads under its
                // own heading instead of all collapsing under the last one. Drain the typewriter
                // backlog first so the previous phase's un-typed tail lands in ITS bubble, not the next.
                const tail = threadPhases ? drainQueue() : ''
                setMessages(prev => {
                    const idx = prev.findIndex(m => m.streaming)
                    if (idx < 0) return prev
                    const next = [...prev]
                    const cur = next[idx]
                    const curContent = (cur.content || '') + tail
                    if (!threadPhases || curContent.trim() === '') {
                        // One-phase-per-turn (other agents) or no content yet → heading before the bubble.
                        if (tail) next[idx] = { ...cur, content: curContent }
                        next.splice(idx, 0, { role: 'phase', phase: p })
                        return next
                    }
                    next[idx] = { ...cur, content: curContent, streaming: false }
                    next.splice(idx + 1, 0,
                        { role: 'phase', phase: p },
                        { role: 'assistant', content: '', streaming: true },
                    )
                    return next
                })
            },
            onError: (message) => freezeError(message),
            ...extraHandlers,
        }
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

        // A turn that produced NO text leaves no visible bubble — the normal shape of "give SPY",
        // since agents are told not to narrate a chart and the chart itself is docked, not written.
        //
        // But it still needs a RECORD, or the turn never happened as far as the model is concerned:
        // the history would hold two user messages in a row, the server coalesces consecutive
        // same-role turns, and the next question arrives glued to the old one — which had Axl
        // answering "what does Radar do?" while re-charting the SPY from two turns back. So a
        // wordless turn that docked a chart keeps a HIDDEN assistant note saying what it showed.
        // That is also what lets "now the 4h" resolve: the model can see which chart is up.
        //
        // `content === undefined` is keep-accumulated mode (phase-threaded chats), NOT an empty
        // reply — the bubble already holds this phase's text. Reasoning keeps the bubble too: it has
        // something to show.
        if (typeof msg.content === 'string' && !msg.content.trim() && !msg.reasoning) {
            const chart = liveChartRef.current
            const note  = chart?.symbol
                ? { role: 'assistant', content: `Showed the ${chart.symbol} ${chart.timeframe ?? 'day'} chart.`, hidden: true }
                : null
            stopDrain()
            setMessages(prev => {
                if (!prev.at(-1)?.streaming) return prev
                const next = prev.slice(0, -1)
                return note ? [...next, note] : next
            })
            setIsLoading(false)
            return
        }

        finishDrain(msg, () => setIsLoading(false))
    }

    // Call in the send's finally: on error/abort the drain was hard-stopped so
    // onComplete won't fire — clear loading here. A clean finish deferred it.
    function endStream() {
        if (!deferRef.current) setIsLoading(false)
        setStreamStatus('')
    }

    // Continue failed (network/server error): put the reopened bubble back to its
    // stopped-but-continuable state instead of replacing it with an error string, so
    // the partial text and the Continue affordance survive the failure.
    function restoreStopped(base) {
        stopDrain()
        setMessages(prev => {
            const next = [...prev]
            const i = next.length - 1
            // Empty base (a failed regenerate) keeps the placeholder so the bubble stays a
            // resumable stopped turn rather than an empty box.
            if (next[i]?.role === 'assistant') next[i] = { role: 'assistant', content: base || '_(stopped)_', stopped: true }
            return next
        })
        setIsLoading(false)
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
        begin, beginContinue, finishStreaming, endStream, reset,
        handleStop, freezeError, restoreStopped, turnRef,
        canResume, resumeBase, finalizeResumeHistory,
        reasoningRef,
        reasoningPulse: reasoningPulseValue,
    }
}
