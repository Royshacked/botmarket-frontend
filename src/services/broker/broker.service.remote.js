import { httpService } from '../http.service'
import { API_BASE } from '../config'

const BASE = 'api/broker'

export const brokerService = {
    listConnections,
    getConnectUrl,
    getAccount,
    getPositions,
    closePosition,
    listOrders,
    placeOrder,
    amendOrder,
    cancelOrder,
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
 * Close an open position in full. Pass the position's own accountId so the close
 * routes to the account it lives on (a broker can hold positions across several
 * accounts); omit it to fall back to the broker's selected account.
 * @param {'ctrader'|'ibkr'} brokerType
 * @param {string} positionId
 * @param {string} [accountId]
 * @returns {Promise<void>}
 */
async function closePosition(brokerType, positionId, accountId) {
    const qs = accountId ? `?accountId=${encodeURIComponent(accountId)}` : ''
    await httpService.delete(`${BASE}/${brokerType}/positions/${positionId}${qs}`)
}

/**
 * List an account's working (pending) LIMIT/STOP orders — the "orders in the air".
 * @param {'ctrader'|'ibkr'} brokerType
 * @param {string} [accountId]
 * @returns {Promise<object[]>}
 */
async function listOrders(brokerType, accountId) {
    const qs = accountId ? `?accountId=${encodeURIComponent(accountId)}` : ''
    const res = await httpService.get(`${BASE}/${brokerType}/orders${qs}`)
    return Array.isArray(res.orders) ? res.orders : []
}

/**
 * Place a new working order (e.g. add a TP limit / stop level to a position).
 * @param {'ctrader'|'ibkr'} brokerType
 * @param {{ accountId?: string, symbol: string, direction: 'long'|'short',
 *           type: 'limit'|'stop', quantity: number, limitPrice?: number, stopPrice?: number }} order
 * @returns {Promise<object>}
 */
async function placeOrder(brokerType, order) {
    const res = await httpService.post(`${BASE}/${brokerType}/orders`, order)
    return res.order ?? res
}

/**
 * Change a working order's price (keeps its id).
 * @param {'ctrader'|'ibkr'} brokerType
 * @param {string} orderId
 * @param {{ accountId?: string, limitPrice?: number, stopPrice?: number }} fields
 * @returns {Promise<void>}
 */
async function amendOrder(brokerType, orderId, fields) {
    await httpService.patch(`${BASE}/${brokerType}/orders/${orderId}`, fields)
}

/**
 * Cancel a working order.
 * @param {'ctrader'|'ibkr'} brokerType
 * @param {string} orderId
 * @param {string} [accountId]
 * @returns {Promise<void>}
 */
async function cancelOrder(brokerType, orderId, accountId) {
    const qs = accountId ? `?accountId=${encodeURIComponent(accountId)}` : ''
    await httpService.delete(`${BASE}/${brokerType}/orders/${orderId}${qs}`)
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
