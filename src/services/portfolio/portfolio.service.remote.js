import { httpService } from '../http.service'
import { streamAgent } from '../agentStream'

const BASE = 'api/portfolio'

export const portfolioService = { sendStream, saveChatState, getChatState, deleteChatState, completeReview, applyRebalance, getPendingReviews, getItems, listPortfolios }

// The user's books. [] on failure, the same posture every other list getter takes — a list surface
// degrades to empty and never throws into a render.
async function listPortfolios() {
    try {
        const data = await httpService.get(BASE)
        return Array.isArray(data?.portfolios) ? data.portfolios : []
    } catch { return [] }
}

// The book's holdings, read from the server. A portfolio has no document of its own, so this is
// its get-by-id — the twin of kairosService.getCall / mentorService.getSetup.
//
// THROWS on failure, unlike the list getters above. Every caller is opening the book to work on
// it, and a book that failed to load is not an empty book: seeding a review from a silent [] is
// what handed Atlas a holdings-less portfolio and produced item ids that matched nothing.
async function getItems(portfolioId) {
    const data = await httpService.get(`${BASE}/${encodeURIComponent(portfolioId)}/items`)
    return Array.isArray(data?.items) ? data.items : []
}

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
    const { mainAccountId = null, portfolioId = null, portfolioIdeas = [], threadId = null, reviewMode = false, mandate = null, adoptDraftId = null, model } = opts
    // `adoptDraftId` puts the turn in ADOPT mode: the server parses the user's own text into that
    // staged book before Atlas sees it, so a pasted holdings list becomes rows without the model ever
    // reading a number.
    await streamAgent(BASE, { messages, ideaAccounts, mainAccountId, portfolioId, portfolioIdeas, threadId, reviewMode, mandate, adoptDraftId, model }, opts)
}
