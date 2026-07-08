import { httpService } from '../http.service'

/**
 * Manual (broker-less real-money) mode client.
 *
 * Accounts share the virtual-account store with paper, scoped by `mode=manual` on the
 * same /api/paper/accounts surface (no cost fields — manual reports real fills). The
 * lifecycle is driven by the two user confirmations: report the real entry fill
 * (price + size) and the real exit price. See docs/architecture/manual-mode.md.
 */

const ACCT  = 'api/paper/accounts'   // shared store, scoped by ?mode=manual / { mode:'manual' }
const IDEAS = 'api/trade-ideas'

export const manualService = {
    // accounts
    listAccounts,
    createAccount,
    updateAccount,
    deleteAccount,
    resetAccountById,
    // lifecycle confirmations
    confirmEntry,
    confirmExit,
    activatePortfolio,
    requestPortfolioExit,
}

// ─── Accounts (mode = manual) ───────────────────────────────────────────────────

/** @returns {Promise<object[]>} the user's manual accounts, each with live equity. */
async function listAccounts() {
    const res = await httpService.get(`${ACCT}?mode=manual`)
    return Array.isArray(res.accounts) ? res.accounts : []
}

/** Create a named manual account. @returns {Promise<object>} the new account state. */
async function createAccount({ name, startingBalance, currency } = {}) {
    return httpService.post(ACCT, { mode: 'manual', name, startingBalance, currency })
}

/** Rename a manual account (no cost settings — manual has none). @returns {Promise<object>} */
async function updateAccount(accountId, { name } = {}) {
    return httpService.patch(`${ACCT}/${encodeURIComponent(accountId)}`, { name })
}

/** Delete a manual account (rejects with 409 when it still holds an open position). */
async function deleteAccount(accountId) {
    return httpService.delete(`${ACCT}/${encodeURIComponent(accountId)}`)
}

/** Wipe one manual account's positions/equity and restore its balance. @returns {Promise<object>} */
async function resetAccountById(accountId, startingBalance) {
    return httpService.post(
        `${ACCT}/${encodeURIComponent(accountId)}/reset`,
        startingBalance != null ? { startingBalance } : {}
    )
}

// ─── Lifecycle confirmations ────────────────────────────────────────────────────

/** Report a real entry fill for a manual idea → opens the position. @returns {Promise<object|null>} updated idea */
async function confirmEntry(ideaId, { price, quantity } = {}) {
    const res = await httpService.post(`${IDEAS}/${ideaId}/manual-entry`, { price, quantity })
    return res.idea ?? null
}

/** Report a real exit fill for a manual idea → closes the position. @returns {Promise<object|null>} updated idea */
async function confirmExit(ideaId, { price } = {}) {
    const res = await httpService.post(`${IDEAS}/${ideaId}/manual-exit`, { price })
    return res.idea ?? null
}

/** Activate a manual portfolio → posts the N-leg entry FillCard. @returns {Promise<{legs:number}>} */
async function activatePortfolio(portfolioId) {
    return httpService.post(`${IDEAS}/portfolio/${encodeURIComponent(portfolioId)}/manual-activate`, {})
}

/** Request a manual portfolio exit → posts the N-leg exit FillCard. @returns {Promise<{legs:number}>} */
async function requestPortfolioExit(portfolioId) {
    return httpService.post(`${IDEAS}/portfolio/${encodeURIComponent(portfolioId)}/manual-exit`, {})
}
