import { useState, useEffect } from 'react'
import { marketService } from '../services/market/market.service.remote'

/**
 * Live market status for a symbol (class-aware). Used to gate market orders —
 * a broker rejects them while the venue is closed (crypto is 24/7 → never closed).
 * Shared by OrderConfirmDialog and ClosePositionDialog, which had this effect
 * copy-pasted verbatim.
 *
 * @param {string} [symbol]
 * @param {string} [assetClass]  stamped class for accurate session hours; falls
 *                               back to a symbol heuristic server-side when absent
 * @returns {{ market: object|null, marketClosed: boolean }}
 *          marketClosed is only true once status is known AND open === false
 */
export function useMarketStatus(symbol, assetClass) {
    const [market, setMarket] = useState(null)

    useEffect(() => {
        if (!symbol) { setMarket(null); return }
        let active = true
        marketService.getStatus(symbol, assetClass)
            .then(s => { if (active) setMarket(s) })
            .catch(() => { if (active) setMarket(null) })
        return () => { active = false }
    }, [symbol, assetClass])

    return { market, marketClosed: market != null && market.open === false }
}
