import { API_BASE } from '../config'
import { postSSE, buildStreamHandlers } from '../sse.util'

export const axlService = {
    streamAxl,
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
 * @param {object} opts      { model, reasoningEffort, routingMode, signal, ...handlers }
 */
async function streamAxl(messages, opts = {}) {
    const { model, reasoningEffort, routingMode, signal } = opts
    await postSSE(
        `${API_BASE}/api/axl/stream`,
        { messages, model, reasoningEffort, routingMode },
        buildStreamHandlers(opts),
        { signal },
    )
}
