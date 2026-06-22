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
