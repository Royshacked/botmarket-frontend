import { httpService } from '../http.service'

const BASE = 'api/portfolio'

export const portfolioService = { deleteChatState, completeReview, applyRebalance, getPendingReviews, getItems, listPortfolios }

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

// Apply an accepted review rebalance (the confirmed portfolio_update) to the live book.
async function applyRebalance(portfolioId, update) {
    return httpService.post(`${BASE}/${encodeURIComponent(portfolioId)}/rebalance`, { update })
}

// Deletes the BOOK's record (the client removes its ideas first) — the name is the old panel's: the chat that once
// lived on the record went in phase 9 (2026-10-20), the route kept its path.
async function deleteChatState(portfolioId) {
    return httpService.delete(`${BASE}/chat-state/${encodeURIComponent(portfolioId)}`)
}

async function completeReview(portfolioId, reviewCadence, outcome) {
    return httpService.post(`${BASE}/${encodeURIComponent(portfolioId)}/complete-review`, { reviewCadence, outcome })
}

