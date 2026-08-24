import { streamAgent, clientTimeContext } from '../agentStream'

// ⚠ ARCHIVED 2026-07-29 — this endpoint is no longer mounted. The Idea agent is superseded by
// Kairos (kairos.service.remote.js → /api/kairos, builds a `call`) and Mentor (/api/mentor,
// builds a `setup`); its backend monitor, Minos, is archived alongside it. Both functions below
// would now 404. Kept so MainPage's archived idea paths still resolve — see the ARCHIVED notes on
// handleEditIdea / handleSend there. To revive: re-mount /api/idea in the backend's server.js.
//
// The idea agent's endpoint. Mentor speaks to /api/mentor; this one predates it.
const BASE = 'api/idea'

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
async function sendPromptStream(userPrompt, analysisState = null, callbacks = {}, ideaAccounts = [], model, mainAccountId = null) {
    await streamAgent(BASE, { userPrompt, analysisState, ideaAccounts, mainAccountId, model, ...clientTimeContext() }, callbacks)
}

/**
 * Resume a stopped reply: send the conversation as a `messages` array ending with
 * the partial assistant turn (and NO userPrompt), so the idea agent uses it verbatim
 * and the model continues that same assistant message (Anthropic prefill). The reply
 * that streams back is the continuation only — the caller prepends the partial.
 */
async function continuePromptStream(messages, analysisState = null, callbacks = {}, ideaAccounts = [], model, mainAccountId = null) {
    await streamAgent(BASE, { messages, analysisState, ideaAccounts, mainAccountId, model, ...clientTimeContext() }, callbacks)
}
