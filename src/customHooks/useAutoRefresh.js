import { useEffect } from 'react'

/**
 * Run `loader` once on mount and, when `intervalMs` is given, on a repeating
 * interval — clearing it on unmount. Collapses the fetch-on-mount(+poll) effect
 * that useBrokerAccounts / usePositions / useScans / usePaperMode / useTradeIdeas
 * / useCalendarEvents each hand-rolled.
 *
 * `loader` must be stable (wrap it in useCallback) — it's an effect dependency,
 * so an unstable reference would re-subscribe every render. The loader owns its
 * own data/loading state; this hook only drives *when* it runs.
 *
 * @param {() => void} loader
 * @param {number} [intervalMs]  omit for mount-only
 */
export function useAutoRefresh(loader, intervalMs) {
    useEffect(() => {
        loader()
        if (!intervalMs) return
        const id = setInterval(loader, intervalMs)
        return () => clearInterval(id)
    }, [loader, intervalMs])
}
