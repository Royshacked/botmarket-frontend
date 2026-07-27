import { API_BASE } from './config.js'
import { postSSE, buildStreamHandlers } from './sse.util.js'

// The one way the client opens an agent stream.
//
// NB: imports carry explicit .js extensions. Vite resolves extensionless specifiers, but this
// module is also loaded by the bare `node --test` suite, which does not.
//
// Six agent services each had their own `sendStream`, and they were the same four lines with a
// different endpoint and a different body: build the URL, hand `opts` to buildStreamHandlers,
// forward `opts.signal`, call postSSE. Only the ENDPOINT and the BODY FIELDS ever differed, and
// those are the agent's own contract.
//
// Passing the whole `opts` bag to buildStreamHandlers is deliberate: callbacks (onToken, onDone,
// onError…) and request fields (model, signal…) arrive together from the panel, and the handler
// builder optional-chains whatever it doesn't find. Splitting them would make every caller sort
// its own props for no gain.

/**
 * Open an SSE stream against an agent's /stream endpoint.
 *
 * @param {string} base  the agent's API base, e.g. 'api/mentor'
 * @param {object} body  the request body — the agent's own contract
 * @param {object} opts  the callback bag (+ `signal`), passed straight to buildStreamHandlers
 * @returns {Promise<void>} resolves when the stream closes
 */
export function streamAgent(base, body, opts = {}) {
    return postSSE(
        `${API_BASE}/${base}/stream`,
        body,
        buildStreamHandlers(opts),
        { signal: opts.signal },
    )
}

/**
 * The browser's instant + IANA zone, sent with any request whose agent authors a time.
 *
 * An agent has no idea what timezone the user is in, so "enter at 16:40" or "good through Friday"
 * is ambiguous without this — it resolves the wall-clock against the USER's calendar and stores
 * the result as absolute UTC. Falls back to the instant alone when Intl is unavailable, which
 * makes the server ask rather than guess.
 */
export function clientTimeContext() {
    try {
        return { clientNow: Date.now(), clientTz: Intl.DateTimeFormat().resolvedOptions().timeZone || null }
    } catch {
        return { clientNow: Date.now() }
    }
}
