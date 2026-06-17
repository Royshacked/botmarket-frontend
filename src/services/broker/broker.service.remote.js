import { httpService } from '../http.service'
import { API_BASE } from '../config'

const BASE = 'api/broker'

export const brokerService = {
    listConnections,
    getConnectUrl,
    getAccount,
    getPositions,
    closePosition,
    getTradingAccounts,
    setSelectedAccount,
    disconnect,
}

/**
 * Return connection status for all supported brokers.
 * @returns {Promise<Record<string, boolean>>}  e.g. { ctrader: true, ibkr: false }
 */
async function listConnections() {
    const res = await httpService.get(`${BASE}/connections`)
    return res.connections ?? {}
}

/**
 * Build the URL to start OAuth for a broker.
 * Navigating to this URL (not AJAX) starts the OAuth flow.
 * @param {'ctrader'|'ibkr'} brokerType
 * @returns {string}
 */
function getConnectUrl(brokerType) {
    return `${API_BASE}/${BASE}/connect/${brokerType}`
}

/**
 * @param {'ctrader'|'ibkr'} brokerType
 * @returns {Promise<object|null>}
 */
async function getAccount(brokerType) {
    const res = await httpService.get(`${BASE}/${brokerType}/account`)
    return res.account ?? null
}

/**
 * @param {'ctrader'|'ibkr'} brokerType
 * @returns {Promise<object[]>}
 */
async function getPositions(brokerType) {
    const res = await httpService.get(`${BASE}/${brokerType}/positions`)
    return Array.isArray(res.positions) ? res.positions : []
}

/**
 * Close an open position in full (on the broker's currently selected account).
 * @param {'ctrader'|'ibkr'} brokerType
 * @param {string} positionId
 * @returns {Promise<void>}
 */
async function closePosition(brokerType, positionId) {
    await httpService.delete(`${BASE}/${brokerType}/positions/${positionId}`)
}

/**
 * @param {'ctrader'|'ibkr'} brokerType
 * @returns {Promise<{ accounts: object[], selectedAccountId: string|null }>}
 */
async function getTradingAccounts(brokerType) {
    return httpService.get(`${BASE}/${brokerType}/trading-accounts`)
}

/**
 * @param {'ctrader'|'ibkr'} brokerType
 * @param {string} accountId
 * @returns {Promise<void>}
 */
async function setSelectedAccount(brokerType, accountId) {
    await httpService.patch(`${BASE}/connections/${brokerType}/account`, { accountId })
}

/**
 * @param {'ctrader'|'ibkr'} brokerType
 * @returns {Promise<void>}
 */
async function disconnect(brokerType) {
    await httpService.delete(`${BASE}/connections/${brokerType}`)
}
