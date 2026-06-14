import { API_BASE } from '../config'
import { postSSE } from '../sse.util'

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
 * @param {function} callbacks.onDone     - called with { reply, analysisState, tradeIdea? }
 * @param {function} callbacks.onError    - called with an error message string
 * @param {Array}    ideaAccounts
 */
async function sendPromptStream(userPrompt, analysisState = null, { onToken, onDone, onError, onAsset, onInterval } = {}, ideaAccounts = []) {
    await postSSE(
        `${API_BASE}/orchestrator/stream`,
        { userPrompt, analysisState, ideaAccounts },
        {
            token:    (d) => onToken?.(d.text),
            asset:    (d) => onAsset?.(d.symbol),
            interval: (d) => onInterval?.(d.interval),
            done:     (d) => onDone?.(d),
            error:    (d) => onError?.(d.message),
        },
    )
}
