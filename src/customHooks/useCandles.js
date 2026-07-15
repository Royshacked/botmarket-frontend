import { useState, useEffect, useCallback } from 'react'
import { marketService } from '../services/market/market.service.remote'

// Owns OHLCV candle data for the price chart. Backs KLineCharts.
//
// Closed bars are immutable — only the forming (last) bar changes — so history is cheap to
// keep. This hook:
//   • caches candles per `symbol|interval` at MODULE level (shared across every chart
//     instance), so flipping back to a recent symbol renders instantly with no refetch;
//   • dedupes in-flight requests per key (concurrent mounts/pollers share one fetch);
//   • polls every ~15s to refresh the tail, pausing while the tab is hidden and catching up
//     on re-show;
//   • ignores stale responses after a symbol/interval switch (an `active` guard).
// The server already caches + collapses upstream FMP calls across all viewers, so the poll
// is bandwidth-flat regardless of how many charts are open.

const _cache    = new Map()   // 'SYMBOL|interval' -> { candles, at }
const _inflight = new Map()   // 'SYMBOL|interval' -> Promise<candles>
const FRESH_MS  = 12_000      // skip the initial network fetch if cache is younger than this

function keyOf(symbol, interval) {
    return symbol && interval ? `${String(symbol).toUpperCase()}|${interval}` : null
}

// One shared, deduped fetch per key; caches the result.
function fetchCandles(symbol, interval) {
    const key = keyOf(symbol, interval)
    if (!key) return Promise.resolve([])
    if (_inflight.has(key)) return _inflight.get(key)

    const p = marketService.getCandles(symbol, interval)
        .then(res => {
            const candles = Array.isArray(res?.candles) ? res.candles : []
            _cache.set(key, { candles, at: Date.now() })
            return candles
        })
        .finally(() => _inflight.delete(key))

    _inflight.set(key, p)
    return p
}

/**
 * @param {string} symbol
 * @param {string} interval
 * @param {{ pollMs?: number }} [opts]
 * @returns {{ candles: Array, loading: boolean, error: Error|null, refetch: () => void }}
 */
export function useCandles(symbol, interval, { pollMs = 15_000 } = {}) {
    const [candles, setCandles] = useState(() => _cache.get(keyOf(symbol, interval))?.candles || [])
    const [loading, setLoading] = useState(false)
    const [error,   setError]   = useState(null)
    const [nonce,   setNonce]   = useState(0)   // bumped by refetch() to force a network hit

    const refetch = useCallback(() => {
        const key = keyOf(symbol, interval)
        if (key) _cache.delete(key)             // force the next load past the freshness gate
        setNonce(n => n + 1)
    }, [symbol, interval])

    useEffect(() => {
        const key = keyOf(symbol, interval)
        if (!key) { setCandles([]); setLoading(false); setError(null); return }

        let active = true
        const cached = _cache.get(key)

        // Paint the cached series immediately on a switch; only show the spinner on a cold key.
        if (cached) { setCandles(cached.candles); setError(null) }
        else setLoading(true)

        async function load(isPoll) {
            if (!active) return
            if (isPoll && document.hidden) return   // don't poll a backgrounded tab
            try {
                const c = await fetchCandles(symbol, interval)
                if (!active) return                 // stale — symbol/interval changed mid-flight
                setCandles(c)
                setError(null)
            } catch (err) {
                if (active) setError(err)
            } finally {
                if (active && !isPoll) setLoading(false)
            }
        }

        // Initial load — skip the network if the cache is still fresh (instant switch-back).
        const fresh = cached && (Date.now() - cached.at < FRESH_MS)
        if (!fresh) load(false)
        else setLoading(false)

        const timer = setInterval(() => load(true), pollMs)
        const onVis = () => { if (!document.hidden) load(true) }   // refresh on re-show
        document.addEventListener('visibilitychange', onVis)

        return () => {
            active = false
            clearInterval(timer)
            document.removeEventListener('visibilitychange', onVis)
        }
    }, [symbol, interval, pollMs, nonce])

    return { candles, loading, error, refetch }
}
