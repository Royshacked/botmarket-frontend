import { httpService } from '../http.service'

export const marketService = {
    getStatus,
    getCandles,
}

/**
 * @param {string} symbol
 * @param {string} [assetClass] 'stock'|'etf'|'futures'|'forex'|'crypto' — when known,
 *                 drives the session; the server falls back to a symbol heuristic.
 * @returns {Promise<{ open: boolean, isCrypto: boolean, nextOpenMs: number|null }>}
 */
async function getStatus(symbol, assetClass) {
    return httpService.get('api/market/status', { symbol, ...(assetClass ? { assetClass } : {}) })
}

/**
 * OHLCV candles for the price chart (KLineCharts). FMP-first real-time intraday on the
 * server, cached there so 15s polling stays cheap.
 *
 * @param {string} symbol
 * @param {string} interval  app word ('5min','1hr','day'…), TV code ('5','D','M') or legacy
 * @param {{ from?: number, to?: number }} [range]  epoch ms bounds (optional history scroll)
 * @returns {Promise<{ symbol, interval, timeSpan, multiplier, candles: Array<{timestamp,open,high,low,close,volume}> }>}
 */
async function getCandles(symbol, interval, { from, to } = {}) {
    return httpService.get('api/market/candles', {
        symbol,
        interval,
        ...(from != null ? { from } : {}),
        ...(to != null ? { to } : {}),
    })
}
