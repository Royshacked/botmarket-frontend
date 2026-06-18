import { httpService } from '../http.service'

export const marketService = {
    getStatus,
}

/**
 * @param {string} symbol
 * @param {string} [assetClass] 'stock'|'etf'|'futures'|'forex'|'crypto' — when known,
 *                 drives the session; the server falls back to a symbol heuristic.
 * @returns {Promise<{ open: boolean, isCrypto: boolean, nextOpenMs: number|null }>}
 */
async function getStatus(symbol, assetClass) {
    return httpService.get('market/status', { symbol, ...(assetClass ? { assetClass } : {}) })
}
