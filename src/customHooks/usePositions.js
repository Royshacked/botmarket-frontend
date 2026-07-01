import { useState, useCallback } from 'react'
import { brokerService } from '../services/broker/broker.service.remote.js'
import { useAutoRefresh } from './useAutoRefresh.js'

// Poll so open-position P&L stays live (paper marks + broker fills move continuously).
const POSITIONS_POLL_MS = 4000

/**
 * Loads the user's open positions across every connected broker and keeps them
 * refreshable. Each position is tagged with the broker it lives on and the
 * account number / currency of that broker's selected account, so the UI can
 * show them and close calls can be routed back to the right broker.
 *
 * @returns {{
 *   positions: object[],
 *   loading: boolean,
 *   refresh: () => Promise<void>,
 *   closePosition: (broker: string, positionId: string, accountId?: string) => Promise<void>,
 * }}
 */
export function usePositions() {
    const [positions, setPositions] = useState([])
    const [loading, setLoading]     = useState(false)

    const refresh = useCallback(async () => {
        setLoading(true)
        try {
            const connections = await brokerService.listConnections()
            // For each connected broker, fetch its account (for the account number /
            // currency) and its open positions in parallel, then tag each position.
            const lists = await Promise.all(
                Object.entries(connections)
                    .filter(([, connected]) => connected)
                    .map(async ([broker]) => {
                        try {
                            const rows = await brokerService.getPositions(broker)
                            if (!rows.length) return []
                            // Positions may span several accounts on one broker, so each
                            // row carries its own account meta (number / currency / id).
                            // Fall back to the broker's selected account only for rows
                            // that don't (e.g. brokers reporting a single account). This
                            // fetch is best-effort — never let it drop the positions.
                            let accountNo = null, currency = null
                            try {
                                const account = await brokerService.getAccount(broker)
                                accountNo = account?.login ?? account?.id ?? null
                                currency  = account?.currency ?? null
                            } catch { /* show positions without fallback meta */ }
                            return rows.map(p => ({
                                ...p,
                                broker,
                                accountNo: p.accountNo ?? accountNo,
                                currency:  p.currency  ?? currency,
                            }))
                        } catch {
                            return []
                        }
                    })
            )
            setPositions(lists.flat())
        } catch {
            setPositions([])
        } finally {
            setLoading(false)
        }
    }, [])

    useAutoRefresh(refresh, POSITIONS_POLL_MS)

    const closePosition = useCallback(async (broker, positionId, accountId) => {
        await brokerService.closePosition(broker, positionId, accountId)
        await refresh()
    }, [refresh])

    return { positions, loading, refresh, closePosition }
}
