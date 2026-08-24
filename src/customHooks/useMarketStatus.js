import { useState, useEffect } from 'react'
import { marketService } from '../services/market/market.service.remote'

/**
 * Live market status for a SET of symbols (class-aware). One fetch per DISTINCT symbol —
 * the endpoint is a pure session-hours computation server-side, so a handful of them is
 * cheap. This is the shared mechanism; `useMarketStatus` below is the single-symbol view
 * of it (a group close needs every leg's venue, a single close needs one).
 *
 * @param {Array<{ symbol?: string, assetClass?: string }>} items
 * @returns {{ statuses: Record<string, object>, closedSymbols: string[] }}
 *          `statuses` holds only symbols whose status resolved — an unknown venue is
 *          never treated as closed (fail open: the broker is the real gate).
 */
export function useMarketStatuses(items = []) {
    // Distinct symbols, serialized so the effect re-runs on a real change of the SET —
    // callers pass a fresh array every render.
    const seen = new Set()
    const pairs = []
    for (const it of items) {
        const symbol = it?.symbol
        if (!symbol || seen.has(symbol)) continue
        seen.add(symbol)
        pairs.push({ symbol, assetClass: it?.assetClass ?? undefined })
    }
    const key = JSON.stringify(pairs)

    const [statuses, setStatuses] = useState({})

    useEffect(() => {
        const list = JSON.parse(key)
        if (!list.length) { setStatuses({}); return }
        let active = true
        Promise.all(list.map(({ symbol, assetClass }) =>
            marketService.getStatus(symbol, assetClass)
                .then(s => [symbol, s])
                .catch(() => [symbol, null]),
        )).then(entries => {
            if (!active) return
            setStatuses(Object.fromEntries(entries.filter(([, s]) => s != null)))
        })
        return () => { active = false }
    }, [key])

    const closedSymbols = Object.entries(statuses)
        .filter(([, s]) => s.open === false)
        .map(([symbol]) => symbol)

    return { statuses, closedSymbols }
}

/**
 * Live market status for one symbol (class-aware). Used to gate market orders —
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
    const { statuses } = useMarketStatuses(symbol ? [{ symbol, assetClass }] : [])
    const market = (symbol && statuses[symbol]) || null
    return { market, marketClosed: market != null && market.open === false }
}
