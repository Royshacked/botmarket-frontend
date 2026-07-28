import { openChart } from './chartSurface.service.js'

/**
 * Build the SSE event→handler map shared by every streaming agent (idea /
 * scanner / portfolio) from a callback bag. Each stream only emits a subset of
 * these events; unmapped callbacks are simply never called (optional-chained),
 * so one builder safely covers all three. Centralises the event→field wiring so
 * adding a new SSE event is a one-line change here, not in three services.
 *
 * @param {object} cb  { onToken, onTicker, onAsset, onInterval, onChart, onOpenChart,
 *                       onPhase, onCoverage, onStatus, onReasoning, onDone, onError }
 * @returns {Object<string, function>}
 */
export function buildStreamHandlers(cb = {}) {
    return {
        token:     (d) => cb.onToken?.(d.text),
        ticker:    (d) => cb.onTicker?.(d.symbol),
        asset:     (d) => cb.onAsset?.(d.symbol),
        interval:  (d) => cb.onInterval?.(d.interval),
        chart:     (d) => cb.onChart?.(d),
        // The user asked an agent — any agent — to open a chart. Unlike every other entry here
        // this DEFAULTS to acting (the shared chart surface) instead of no-op'ing on a missing
        // callback: the chart is a workspace-level surface, not a property of whichever chat asked
        // for it, so a new agent needs no wiring on this side at all. A panel that wants it
        // elsewhere passes onOpenChart and takes over.
        chart_open: (d) => (cb.onOpenChart ?? openChart)(d),
        phase:     (d) => cb.onPhase?.(d.phase),
        // Mentor's progress signal. Unlike `phase` (one number, a step) this is the CUMULATIVE
        // set of dimensions read so far — order-free, because Mentor works by invariants, not steps.
        coverage:  (d) => cb.onCoverage?.(d.coverage),
        status:    (d) => cb.onStatus?.(d.tool),
        reasoning: (d) => cb.onReasoning?.(d.text),
        done:      (d) => cb.onDone?.(d),
        error:     (d) => cb.onError?.(d.message),
    }
}

/**
 * POST a JSON body to a Server-Sent-Events endpoint and dispatch each parsed
 * event to a handler map. Shared by every streaming service.
 *
 * Wire format: blocks separated by '\n\n', each with an optional `event: <name>`
 * line (defaults to 'message') and a `data: <json>` line.
 *
 * @param {string} url
 * @param {object} body                      JSON request body
 * @param {Object<string, function>} handlers  event name → (data) => void
 * @returns {Promise<void>}  resolves when the stream closes
 */
export async function postSSE(url, body, handlers = {}, { signal } = {}) {
    let res
    try {
        res = await fetch(url, {
            method:      'POST',
            credentials: 'include',
            headers:     { 'Content-Type': 'application/json' },
            body:        JSON.stringify(body),
            signal,
        })
    } catch (err) {
        // A user-initiated stop aborts the fetch — treat it as a clean end, not an error.
        if (err?.name === 'AbortError') return
        throw err
    }

    if (!res.ok) {
        let errMsg = 'Stream request failed'
        try { const j = await res.json(); errMsg = j.error || errMsg } catch { /* keep default errMsg */ }
        throw new Error(errMsg)
    }

    const reader  = res.body.getReader()
    const decoder = new TextDecoder()
    let pending   = ''

    for (;;) {
        let chunk
        try {
            chunk = await reader.read()
        } catch (err) {
            if (err?.name === 'AbortError') return   // stopped mid-stream — clean end
            throw err
        }
        const { done, value } = chunk
        if (done) break

        pending += decoder.decode(value, { stream: true })

        const blocks = pending.split('\n\n')
        pending = blocks.pop()   // last (possibly incomplete) block

        for (const block of blocks) {
            if (!block.trim()) continue

            let eventName = 'message'
            let dataStr   = ''
            for (const line of block.split('\n')) {
                if (line.startsWith('event: '))     eventName = line.slice(7).trim()
                else if (line.startsWith('data: ')) dataStr   = line.slice(6)
            }

            if (!dataStr) continue

            let data
            try { data = JSON.parse(dataStr) }
            catch { console.warn('[sse] bad JSON', dataStr); continue }

            handlers[eventName]?.(data)
        }
    }
}
