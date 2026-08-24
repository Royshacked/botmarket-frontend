import { httpService } from '../http.service'

/**
 * Adopting a book the app didn't build (backend: docs/design/adopted-book.md).
 *
 * The shape of the flow, and why it is a DRAFT rather than one POST: a staged book is diagnosis. The
 * server prices the lines, reconciles them against what the bank says the account is worth, and hands
 * back the problems per row so the grid can point at them. Nothing is real until `commit`, which
 * refuses on any unresolved problem.
 *
 * `refresh` exists because a correction must land on the SAME draft: a second stage would mint a new
 * portfolioId and end up adopting two half-books.
 */

const BASE = 'api/portfolio/adopt'

export const adoptService = {
    stage, refresh, commit, discard, listStaged,
    correctHolding, removeHolding,
}

/**
 * Stage a book. Accepts raw pasted TEXT, explicit rows, or both — the server parses the paste
 * deterministically (the model never reads a number) and explicit rows win, because an edited row is
 * the user correcting exactly what the parser got wrong.
 * @returns {Promise<object>} the staged draft, problems and all
 */
async function stage({ bank, currency, statedTotal, freeCash, holdings, paste, mandate, name } = {}) {
    const res = await httpService.post(`${BASE}/draft`, {
        bank, currency, statedTotal, freeCash, holdings, paste, mandate, name,
    })
    return res.draft ?? null
}

/** Fold a correction, another paste, or a stated figure into an existing draft. */
async function refresh(draftId, { paste, statedTotal, freeCash, mandate } = {}) {
    const res = await httpService.patch(`${BASE}/draft/${encodeURIComponent(draftId)}`, {
        paste, statedTotal, freeCash, mandate,
    })
    return res.draft ?? null
}

/**
 * Adopt the staged book for real: account, positions at their historical cost and date, holdings,
 * ledger, mandate, then the review baseline. Rejects with the server's reason — `unreconciled` carries
 * `problems`, `partial_write` carries `failed` and can simply be RETRIED (every step is idempotent).
 */
async function commit(draftId) {
    return httpService.post(`${BASE}/${encodeURIComponent(draftId)}/commit`, {})
}

/** Throw a staged book away. Used by "start over", and after an edit that re-stages. */
async function discard(draftId) {
    return httpService.delete(`${BASE}/draft/${encodeURIComponent(draftId)}`)
}

/** Unspent drafts, so an interrupted intake is resumed rather than retyped. [] on failure. */
async function listStaged() {
    try {
        const res = await httpService.get(`${BASE}/drafts`)
        return Array.isArray(res.drafts) ? res.drafts : []
    } catch { return [] }
}

/**
 * Fix a mis-stated holding AFTER adoption. Not a trim: nothing happened in the market, we were simply
 * told the wrong number, so no P&L is booked.
 */
async function correctHolding(ideaId, { quantity, avgCost } = {}) {
    return httpService.patch(`${BASE}/holding/${encodeURIComponent(ideaId)}`, { quantity, avgCost })
}

/**
 * Remove a holding that was never really there — a line already sold, or a typo'd ticker. Marks the
 * position removed rather than closed, so no fictional exit is booked.
 */
async function removeHolding(ideaId) {
    return httpService.delete(`${BASE}/holding/${encodeURIComponent(ideaId)}`)
}
