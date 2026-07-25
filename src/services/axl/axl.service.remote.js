import { API_BASE } from '../config'
import { postSSE, buildStreamHandlers } from '../sse.util'

export const axlService = {
    streamAxl,
    routeIntent,
}

/**
 * Stream a chat response from Axl (the 4th-agent concierge) via SSE. Same shape as
 * the specialist services: `opts` carries both the request params and the SSE
 * handlers (spread from useChatStream's `begin`), so buildStreamHandlers picks the
 * handler keys and the body picks the params.
 *
 * @param {Array}  messages  full [{ role, content }] history to answer against
 * @param {object} opts      { model, reasoningEffort, routingMode, signal, ...handlers }
 */
async function routeIntent(message, opts = {}) {
    const { signal } = opts
    await postSSE(
        `${API_BASE}/api/axl/route`,
        { message },
        buildStreamHandlers(opts),
        { signal },
    )
}

async function streamAxl(messages, opts = {}) {
    const { model, reasoningEffort, routingMode, signal } = opts
    await postSSE(
        `${API_BASE}/api/axl/stream`,
        { messages, model, reasoningEffort, routingMode },
        buildStreamHandlers(opts),
        { signal },
    )
}
