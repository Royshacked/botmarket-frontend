import { httpService } from '../http.service'

const BASE = 'api/broker'

export const brokerService = {
    listConnections,
    getConnectUrl,
    getAccount,
    getPositions,
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
    const base = import.meta.env.PROD ? '' : 'http://localhost:3030'
    return `${base}/${BASE}/connect/${brokerType}`
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
