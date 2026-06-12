import { httpService } from '../http.service'

export const marketService = {
    getStatus,
}

/**
 * @param {string} symbol
 * @returns {Promise<{ open: boolean, isCrypto: boolean, nextOpenMs: number|null }>}
 */
async function getStatus(symbol) {
    return httpService.get('market/status', { symbol })
}
