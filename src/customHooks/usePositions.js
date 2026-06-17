import { useState, useEffect, useCallback } from 'react'
import { brokerService } from '../services/broker/broker.service.remote.js'

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
 *   closePosition: (broker: string, positionId: string) => Promise<void>,
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
                            // Account meta (number / currency) is best-effort — never
                            // let it drop the positions if it fails.
                            let accountNo = null, currency = null
                            try {
                                const account = await brokerService.getAccount(broker)
                                accountNo = account?.login ?? account?.id ?? null
                                currency  = account?.currency ?? null
                            } catch { /* show positions without account meta */ }
                            return rows.map(p => ({ ...p, broker, accountNo, currency }))
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

    useEffect(() => { refresh() }, [refresh])

    const closePosition = useCallback(async (broker, positionId) => {
        await brokerService.closePosition(broker, positionId)
        await refresh()
    }, [refresh])

    return { positions, loading, refresh, closePosition }
}
