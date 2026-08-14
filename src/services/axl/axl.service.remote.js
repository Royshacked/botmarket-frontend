import { API_BASE } from '../config'
import { postSSE, buildStreamHandlers } from '../sse.util'

export const axlService = {
    streamAxl,
    streamBrief,
}

/**
 * Stream a turn from Axl via SSE. Same shape as the specialist services: `opts` carries both the
 * request params and the SSE handlers (spread from useChatStream's `begin`), so buildStreamHandlers
 * picks the handler keys and the body picks the params.
 *
 * ONE endpoint: the reply, any chart, and `route` (the desk Axl is handing the user to, or null)
 * all come back from this turn. The old `/route` call — a separate one-shot with no history — is
 * gone, along with the second Axl surface that existed to make up for it.
 *
 * @param {Array}  messages  full [{ role, content }] history to answer against
 * @param {object} opts      { model, signal, ...handlers }
 */
async function streamAxl(messages, opts = {}) {
    const { model, signal } = opts
    await postSSE(
        `${API_BASE}/api/axl/stream`,
        { messages, model },
        buildStreamHandlers(opts),
        { signal },
    )
}

/**
 * Stream today's market brief into the Axl thread. Not a turn — nothing is said to Axl and no model
 * runs on this call — but it arrives on the same SSE shape as one, so the panel drives it with the
 * handlers useChatStream already hands out: the waiting chip, the typewriter and Stop all work
 * without a second code path.
 *
 * No timeout to set: a stale brief is rewritten server-side (a live model turn with web searches
 * behind it), and an SSE connection simply stays open while that happens — which is the other half
 * of why this replaced the old POST, whose 30s default would abort a request whose work carried on.
 */
async function streamBrief(opts = {}) {
    await postSSE(
        `${API_BASE}/api/axl/brief/stream`,
        {},
        buildStreamHandlers(opts),
        { signal: opts.signal },
    )
}
