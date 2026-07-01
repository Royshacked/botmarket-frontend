import { httpService } from '../http.service'

const BASE = 'api/paper'

/**
 * Paper trading (simulation) client. The simulated account, equity, costs, mode toggle,
 * and trade history. The paper BROKER itself (positions/orders) is served under
 * api/broker/paper via the normal brokerService.
 */
export const paperService = {
    getState,
    setMode,
    updateSettings,
    reset,
    getTrades,
    getEquityCurve,
}

/** @returns {Promise<{ enabled:boolean, settings:object, account:object }>} */
async function getState() {
    return httpService.get(`${BASE}/state`)
}

/** Turn paper mode on/off. Returns the new state. */
async function setMode(enabled) {
    return httpService.put(`${BASE}/mode`, { enabled })
}

/** Patch cost settings ({ spreadBps?, commissionPerTrade? }). Returns the new state. */
async function updateSettings(settings) {
    return httpService.put(`${BASE}/settings`, settings)
}

/** Wipe positions/orders and restore balance (optional new startingBalance). */
async function reset(startingBalance) {
    return httpService.post(`${BASE}/reset`, startingBalance != null ? { startingBalance } : {})
}

/** @returns {Promise<object[]>} paper trade history */
async function getTrades({ status, limit } = {}) {
    const qs = new URLSearchParams()
    if (status) qs.set('status', status)
    if (limit != null) qs.set('limit', String(limit))
    const res = await httpService.get(`${BASE}/trades${qs.toString() ? `?${qs}` : ''}`)
    return Array.isArray(res.trades) ? res.trades : []
}

/** @returns {Promise<object[]>} equity-curve points */
async function getEquityCurve({ fromMs } = {}) {
    const qs = fromMs != null ? `?fromMs=${fromMs}` : ''
    const res = await httpService.get(`${BASE}/equity-curve${qs}`)
    return Array.isArray(res.points) ? res.points : []
}
