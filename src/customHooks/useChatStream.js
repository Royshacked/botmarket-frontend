import { useState, useRef, useEffect } from 'react'
import { useTextPace } from './useTextPace.js'
import { useTypewriter } from './useTypewriter.js'
import { makeStreamHandlers } from './useStreamStop.js'
import { newTurnId } from '../services/turn.service.js'
import { toolStatusLabel } from '../services/toolStatusLabels.js'
import { reasoningPulse, pruneSamples } from './reasoningPulse.js'
import { appendReasoning } from '../services/reasoning.service.js'

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
 * The conversation a RESUMED turn is saved against: the history it was sent with, minus the
 * assistant prefill — because the completed reply replaces that prefill rather than following it.
 *
 * The four desks that offer ▶ each wrote `history.slice(0, -1)` for this, and that is only right on
 * one of the two resume paths. `finalizeResumeHistory` sends a trailing assistant prefill when
 * CONTINUING a partial, but a REGENERATE (stopped before any token) drops the `_(stopped)_`
 * placeholder outright, so its history ends at the USER's message — and slicing it off there deleted
 * the user's turn from the saved thread. On a first-turn regenerate that left a thread with no user
 * message in it at all, which is also the thread's title.
 *
 * Asking the history what it ends with is what makes one expression right on both paths.
 */
export function withoutPrefill(history) {
    const list = Array.isArray(history) ? history : []
    return list.at(-1)?.role === 'assistant' ? list.slice(0, -1) : list
}

/**
 * Shared streaming machinery for the three agent chats (idea / scanner /
 * portfolio). Owns the messages list, loading/status/phase state, the typewriter
 * drain, the abort wiring, and the delicate "keep Stop live until the drain
 * finishes" (deferLoading) dance — the parts that were copy-pasted three ways and
 * drifted. Each panel keeps its own request params and onDone tail.
 *
 * Usage — `run` owns the whole turn; the panel supplies only the request and the tail:
 *   const chat = useChatStream()
 *   async function send(text) {
 *     const history = toChatHistory(chat.messages)  // shared — see below
 *     history.push({ role: 'user', content: text })
 *     await chat.run(text, {
 *       log: '[scanner]',
 *       onDone: (data) => {                         // panel-specific completion
 *         chat.finishStreaming({ role: 'assistant', content: data.reply, ...extras })
 *         // ...side effects (setPendingPlan, analysisState, …)
 *       },
 *       send: ({ signal, handlers }) => service.sendStream(history, { ...params, signal, ...handlers }),
 *       // optional extra/override handlers via `handlers:` (onTicker, onAsset, …; onChart is built in)
 *     })
 *   }
 *
 * `begin` remains for the flows `run` cannot express (Scanner's resume, which starts from
 * `beginContinue`). Prefer `run`: the guard-try-catch-finally around it was written out at five
 * panels, and the half that matters is the one nobody notices — a missing `endStream()` in the
 * `finally` leaves Stop lit and the input dead with no error anywhere.
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
 *   reasoningRef: React.MutableRefObject<null|{source:string,text:string}[]>,
 * }}
 */
export function useChatStream({ threadPhases = false } = {}) {
    const [messages, setMessages]         = useState([])
    const [isLoading, setIsLoading]       = useState(false)
    const [streamStatus, setStreamStatus] = useState('')
    const [phase, setPhase]               = useState(null)

    // Reasoning is a list of SEGMENTS, not one string: two models think during a turn — the desk's
    // own, and the sidecar it consults for a bounded decision — and they must be distinguishable to
    // read at all. Segments keep the chronology (desk thinks → consults → resumes) that a flat
    // concatenation destroys, and a third source later is a new label rather than a new field.
    //
    // `null` when nothing has been thought, a NON-EMPTY array once anything has: every caller
    // already writes `...(reasoning ? { reasoning } : {})` and `!msg.reasoning`, and an empty array
    // is truthy — so `[]` as the empty value would have quietly given every wordless turn a blank
    // reasoning block. @type {React.MutableRefObject<null|{source:string,text:string}[]>}
    const reasoningRef = useRef(null)
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
    /**
     * `silent` runs a turn with NO user bubble — the reply appears on its own.
     *
     * For turns the user caused WITHOUT SAYING ANYTHING — a button that hands a desk something to
     * act on, where the instruction is composed on the server precisely so it is not attributed to
     * them. Showing a line they did not write, or storing one in their thread, is a claim about what
     * they said — and a fixed sentence sitting beside what they actually typed is a second voice
     * that can contradict them.
     *
     * NO CALLER TODAY. Its one user was Mentor's express setup form (deleted 2026-08-21, replaced by
     * an interview that IS the user talking). Kept because the next such button will want it, and
     * because the rule above is the expensive half to rediscover.
     *
     * The wire still carries a user turn; the API needs one. This is only about what is shown and
     * what is kept.
     */
    function begin(userText, extraHandlers = {}, { silent = false } = {}) {
        setMessages(prev => [
            ...prev,
            ...(silent ? [] : [{ role: 'user', content: userText }]),
            { role: 'assistant', content: '', streaming: true },
        ])
        setIsLoading(true)
        setStreamStatus('')
        reasoningRef.current = null
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
        reasoningRef.current = null
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
            onReasoning: (t, source = 'desk') => {
                reasoningRef.current = appendReasoning(reasoningRef.current, source, t)
                // Sample into a ref, never state: deltas arrive far faster than anything should
                // re-render. The ticker below reads this on a slow timer. The sidecar's thinking is
                // sampled too — a consult is the longest silence in a turn, and a pulse that went
                // flat through it would read as a stall exactly when the most work is happening.
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

    /**
     * ONE TURN, start to finish — the shape every desk panel had written out for itself.
     *
     * What it owns is the boring half, which is exactly the half that rots: the re-entrancy guard,
     * the abort wiring, and the `finally { endStream() }` that nobody notices is missing. Drop that
     * finally and nothing throws — the request completes, the reply renders, and the panel is simply
     * left with Stop lit and its input dead until a remount. There is no error to find.
     *
     * What stays with the panel is what the panel actually knows: WHICH request to make (`send`,
     * handed the signal and handlers to spread into its own service call) and WHAT to do with the
     * answer (`onDone`). Neither is mechanism and neither belongs here.
     *
     * @param {string} userText            the user's message, as typed
     * @param {object} spec
     * @param {(io: {signal: AbortSignal, handlers: object}) => Promise<any>} spec.send
     * @param {(data: any) => void} [spec.onDone]     the turn's completion tail
     * @param {object} [spec.handlers]                extra/override stream handlers
     * @param {() => void} [spec.onSettled]           runs after endStream, HOWEVER the turn ended —
     *   completed, failed, or aborted. For the panel-side bookkeeping that `onDone` cannot do
     *   because the error and abort paths never reach it (Scanner's stalled-sleeve detection is the
     *   case this exists for: a run cut short strands the sleeve exactly as a run that found nothing).
     * @param {() => void} [spec.onStopped]           THE TURN NEVER COMPLETED — stopped, aborted or
     *   failed, i.e. `onDone` did not run. The conversation the user is looking at still exists and
     *   is still theirs to come back to, so this is where a panel persists it. Keyed on onDone rather
     *   than on `send` resolving: a stream that ends without a `done` event left the panel with
     *   nothing either, and that is the same walk-out.
     *   (Distinct from `onSettled`, which fires HOWEVER the turn ended. Both are needed: one is
     *   bookkeeping for every ending, this one is the rule for the endings that saved nothing.)
     * @param {string} [spec.log]                     log tag for a failed turn
     * @param {string} [spec.errorMessage]            what the frozen bubble says (defaults to the
     *   generic "Error communicating with the server."). A desk the user knows by name can say so.
     * @returns {Promise<boolean>} true when the turn ran to completion
     */
    async function run(userText, { send, onDone, handlers: extra = {}, onSettled, onStopped, errorMessage, silent = false, log = '[chat]' } = {}) {
        // Re-entrancy: a second send while one is in flight would push a second user bubble and
        // orphan the first turn's abort controller. Guarded here rather than at five call sites.
        //
        // The empty-text half of that guard is about the INPUT BOX — pressing send on nothing must
        // do nothing. A `silent` turn has no text by construction (the instruction is composed
        // server-side and never attributed to the user), so applying it there would refuse every
        // one of them.
        if ((!userText && !silent) || isLoading || typeof send !== 'function') return false

        // Did this turn produce an answer? The panels' persistence hangs off onDone, so the honest
        // reading of "completed" is "onDone ran" — wrapped here, once, rather than asked for as a
        // flag each panel would have to remember to set.
        let completed = false
        const finish = onDone ? (data) => { completed = true; onDone(data) } : undefined
        const { signal, handlers } = begin(userText, { ...extra, ...(finish ? { onDone: finish } : {}) }, { silent })
        try {
            await send({ signal, handlers })
            return true
        } catch (err) {
            // Unconditional, exactly as the five panels had it — including on the abort a Stop
            // raises. That is safe rather than sloppy: freezeError only rewrites a message still
            // marked `streaming`, and handleStop has already cleared that flag, so on the stop path
            // it does nothing. (It does log, which is noise on a deliberate Stop. Left alone here —
            // this commit moves code, it does not change what the code does.)
            console.error(log, err)
            freezeError(errorMessage)
            return false
        } finally {
            endStream()
            // A turn that answered nothing still leaves a conversation behind — the user's message and
            // the turns before it — and walking out of a turn is the commonest way to leave a desk
            // unfinished. Persisting only from onDone meant precisely those walk-outs were the ones
            // that saved nothing: the desk badge had nothing to read, the lock had nothing to close,
            // and the chat the user came back to was React state behind a hidden tab, gone on reload.
            if (!completed) onStopped?.()
            onSettled?.()
        }
    }

    return {
        messages, setMessages,
        isLoading, streamStatus,
        phase, setPhase,
        run,
        begin, beginContinue, finishStreaming, endStream, reset,
        handleStop, freezeError, restoreStopped, turnRef,
        canResume, resumeBase, finalizeResumeHistory,
        reasoningRef,
        reasoningPulse: reasoningPulseValue,
    }
}
