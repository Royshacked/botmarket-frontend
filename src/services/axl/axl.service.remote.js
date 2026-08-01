import { API_BASE } from '../config'
import { postSSE, buildStreamHandlers } from '../sse.util'
import { httpService } from '../http.service'

export const axlService = {
    streamAxl,
    requestBrief,
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

/**
 * Ask for today's market brief. The brief is POSTED into the social chat (it arrives over the WS
 * like any other bot message) — this call only returns whether that happened, so there is nothing
 * to render from the response.
 *
 * The long timeout is deliberate: a stale brief is rewritten on the server, which means a live
 * model turn with web searches behind it. The default 30s would abort the request while the work
 * carried on, and the user would see a failure for a brief that then quietly appeared.
 */
async function requestBrief() {
    return httpService.post('api/axl/brief', {}, { timeout: 180000 })
}
