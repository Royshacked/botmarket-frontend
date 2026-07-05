import { API_BASE } from '../config'
import { postSSE, buildStreamHandlers } from '../sse.util'

export const userPromptService = {
    sendPromptStream,
    continuePromptStream,
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

/**
 * Resume a stopped reply: send the conversation as a `messages` array ending with
 * the partial assistant turn (and NO userPrompt), so the idea agent uses it verbatim
 * and the model continues that same assistant message (Anthropic prefill). The reply
 * that streams back is the continuation only — the caller prepends the partial.
 */
async function continuePromptStream(messages, analysisState = null, callbacks = {}, ideaAccounts = [], model, reasoningEffort, routingMode, currentPhase) {
    await postSSE(
        `${API_BASE}/api/idea/stream`,
        { messages, analysisState, ideaAccounts, model, reasoningEffort, routingMode, currentPhase },
        buildStreamHandlers(callbacks),
        { signal: callbacks.signal },
    )
}
