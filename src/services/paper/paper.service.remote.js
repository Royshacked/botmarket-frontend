import { httpService } from '../http.service'

const BASE = 'api/paper'

/**
 * Paper trading (simulation) client. Manages the user's N named simulated accounts —
 * config, live equity, costs, trade history, equity curve — plus the legacy global
 * mode toggle (still used by the header badge until the per-idea account picker retires
 * it). The paper BROKER itself (positions/orders) is served under api/broker/paper via
 * the normal brokerService.
 */
export const paperService = {
    // per-account (multi-account)
    listAccounts,
    createAccount,
    updateAccount,
    deleteAccount,
    resetAccountById,
    getAccountTrades,
    getAccountEquityCurve,
    // legacy single-account (transitional — header badge + default-account view)
    getState,
    setMode,
    updateSettings,
    reset,
    getTrades,
    getEquityCurve,
}

// ─── Per-account ──────────────────────────────────────────────────────────────

/** @returns {Promise<object[]>} the user's paper accounts, each with live equity. */
async function listAccounts() {
    const res = await httpService.get(`${BASE}/accounts`)
    return Array.isArray(res.accounts) ? res.accounts : []
}

/** Create a named paper account. @returns {Promise<object>} the new account state. */
async function createAccount({ name, startingBalance, currency } = {}) {
    return httpService.post(`${BASE}/accounts`, { name, startingBalance, currency })
}

/** Patch an account's name and/or cost/risk settings. @returns {Promise<object>} account state. */
async function updateAccount(accountId, { name, spreadBps, commissionPerTrade, maxLeverage } = {}) {
    return httpService.patch(`${BASE}/accounts/${encodeURIComponent(accountId)}`, { name, spreadBps, commissionPerTrade, maxLeverage })
}

/** Delete an account (rejects with 409 when it holds an open position / resting order). */
async function deleteAccount(accountId) {
    return httpService.delete(`${BASE}/accounts/${encodeURIComponent(accountId)}`)
}

/** Wipe one account's positions/orders/equity and restore its balance. @returns {Promise<object>} account state. */
async function resetAccountById(accountId, startingBalance) {
    return httpService.post(
        `${BASE}/accounts/${encodeURIComponent(accountId)}/reset`,
        startingBalance != null ? { startingBalance } : {}
    )
}

/** @returns {Promise<object[]>} one account's trade history. */
async function getAccountTrades(accountId, { status, limit } = {}) {
    const qs = new URLSearchParams()
    if (status) qs.set('status', status)
    if (limit != null) qs.set('limit', String(limit))
    const res = await httpService.get(`${BASE}/accounts/${encodeURIComponent(accountId)}/trades${qs.toString() ? `?${qs}` : ''}`)
    return Array.isArray(res.trades) ? res.trades : []
}

/** @returns {Promise<object[]>} one account's equity-curve points. */
async function getAccountEquityCurve(accountId, { fromMs } = {}) {
    const qs = fromMs != null ? `?fromMs=${fromMs}` : ''
    const res = await httpService.get(`${BASE}/accounts/${encodeURIComponent(accountId)}/equity-curve${qs}`)
    return Array.isArray(res.points) ? res.points : []
}

// ─── Legacy single-account (transitional) ──────────────────────────────────────

/** @returns {Promise<{ enabled:boolean, settings:object, account:object }>} */
async function getState() {
    return httpService.get(`${BASE}/state`)
}

/** Turn paper mode on/off. Returns the new state. */
async function setMode(enabled) {
    return httpService.put(`${BASE}/mode`, { enabled })
}

/** Patch cost settings ({ spreadBps?, commissionPerTrade? }) on the default account. Returns the new state. */
async function updateSettings(settings) {
    return httpService.put(`${BASE}/settings`, settings)
}

/** Wipe the default account's positions/orders and restore balance (optional new startingBalance). */
async function reset(startingBalance) {
    return httpService.post(`${BASE}/reset`, startingBalance != null ? { startingBalance } : {})
}

/** @returns {Promise<object[]>} paper trade history (default account scope) */
async function getTrades({ status, limit } = {}) {
    const qs = new URLSearchParams()
    if (status) qs.set('status', status)
    if (limit != null) qs.set('limit', String(limit))
    const res = await httpService.get(`${BASE}/trades${qs.toString() ? `?${qs}` : ''}`)
    return Array.isArray(res.trades) ? res.trades : []
}

/** @returns {Promise<object[]>} equity-curve points (default account scope) */
async function getEquityCurve({ fromMs } = {}) {
    const qs = fromMs != null ? `?fromMs=${fromMs}` : ''
    const res = await httpService.get(`${BASE}/equity-curve${qs}`)
    return Array.isArray(res.points) ? res.points : []
}
