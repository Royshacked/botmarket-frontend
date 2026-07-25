import { httpService } from '../http.service'
import { API_BASE } from '../config'
import { postSSE, buildStreamHandlers } from '../sse.util'

const BASE = 'api/portfolio'

export const portfolioService = { sendStream, saveChatState, getChatState, deleteChatState, completeReview, applyRebalance, getPendingReviews }

// Portfolios whose review is due now (nextReviewAt <= now), scoped to the user. Drives the
// red edit-pencil on the portfolio list. Returns [] on failure (pencils just stay normal).
async function getPendingReviews() {
    try {
        const data = await httpService.get(`${BASE}/pending-reviews`)
        return data.reviews ?? []
    } catch { return [] }
}

async function saveChatState(portfolioId, messages, mandate = null, thesis = null, threadId = null, portfolioName = null) {
    return httpService.post(`${BASE}/chat-state`, {
        portfolioId, messages,
        ...(mandate ? { mandate } : {}), ...(thesis ? { thesis } : {}),
        ...(threadId ? { threadId } : {}), ...(portfolioName ? { portfolioName } : {}),
    })
}

// Apply an accepted review rebalance (the confirmed portfolio_update) to the live book.
async function applyRebalance(portfolioId, update) {
    return httpService.post(`${BASE}/${encodeURIComponent(portfolioId)}/rebalance`, { update })
}

async function getChatState(portfolioId) {
    try {
        const data = await httpService.get(`${BASE}/chat-state/${encodeURIComponent(portfolioId)}`)
        return data.chatState ?? null
    } catch { return null }
}

async function deleteChatState(portfolioId) {
    return httpService.delete(`${BASE}/chat-state/${encodeURIComponent(portfolioId)}`)
}

async function completeReview(portfolioId, reviewCadence, outcome) {
    return httpService.post(`${BASE}/${encodeURIComponent(portfolioId)}/complete-review`, { reviewCadence, outcome })
}

async function sendStream(messages, ideaAccounts = [], opts = {}) {
    const { mainAccountId = null, portfolioId = null, portfolioIdeas = [], threadId = null, reviewMode = false, mandate = null, model, reasoningEffort, routingMode, currentPhase, signal } = opts
    await postSSE(
        `${API_BASE}/${BASE}/stream`,
        { messages, ideaAccounts, mainAccountId, portfolioId, portfolioIdeas, threadId, reviewMode, mandate, model, reasoningEffort, routingMode, currentPhase },
        buildStreamHandlers(opts),
        { signal },
    )
}
