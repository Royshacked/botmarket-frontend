import { API_BASE } from '../config'
import { postSSE, buildStreamHandlers } from '../sse.util'

export const userPromptService = {
    sendPromptStream,
}

/**
 * Stream a chat response via SSE.
 *
 * @param {string}   userPrompt
 * @param {object}   analysisState
 * @param {object}   callbacks
 * @param {function} callbacks.onToken    - called for each streamed text chunk
 * @param {function} callbacks.onAsset    - called with the active asset symbol
 * @param {function} callbacks.onInterval - called with the chart interval
 * @param {function} callbacks.onChart    - called with { symbol, timeframe, imageBase64 }
 * @param {function} callbacks.onDone     - called with { reply, analysisState, tradeIdea? }
 * @param {function} callbacks.onError    - called with an error message string
 * @param {Array}    ideaAccounts
 */
async function sendPromptStream(userPrompt, analysisState = null, callbacks = {}, ideaAccounts = [], model, reasoningEffort, routingMode, currentPhase) {
    await postSSE(
        `${API_BASE}/api/idea/stream`,
        { userPrompt, analysisState, ideaAccounts, model, reasoningEffort, routingMode, currentPhase },
        buildStreamHandlers(callbacks),
        { signal: callbacks.signal },
    )
}
