import { useState, useCallback, useRef } from 'react'
import { brokerService } from '../services/broker/broker.service.remote.js'
import { resolveWorkspace } from './useWorkspaceMode.js'
import { useAutoRefresh } from './useAutoRefresh.js'
import { useWindowEvent } from './useWindowEvent.js'

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
    // One slow broker (e.g. a stale cTrader session whose /positions hangs the full
    // 30s http timeout) can outlast the poll interval; skip a poll while one is still
    // in flight so those requests don't stack up and exhaust the connection pool.
    const inFlightRef = useRef(false)

    // `force` (a user action — e.g. just closed a position) bypasses the in-flight
    // guard so the UI updates promptly even while a slow poll is still running.
    const refresh = useCallback(async (force = false) => {
        if (inFlightRef.current && !force) return
        inFlightRef.current = true
        setLoading(true)
        try {
            const connections = await brokerService.listConnections()
            const connected = Object.entries(connections)
                .filter(([, isConn]) => isConn)
                .map(([broker]) => broker)

            // Scope positions to the active workspace (paper / manual / live). listConnections
            // does NOT gate live brokers by workspace — the live brokers stay connected, and
            // manual is connected whenever the user owns a manual account — so isolate here
            // (mirrors useBrokerAccounts) or another workspace's positions leak into the view.
            const ws = resolveWorkspace(connections.paper)
            const brokers = ws === 'paper'  ? ['paper']
                          : ws === 'manual' ? ['manual']
                          : connected.filter(b => b !== 'paper' && b !== 'manual')

            // Drop positions from brokers outside the active mode. The incremental
            // commit below only REPLACES slices for brokers it re-fetches, so after a
            // mode switch the previous mode's positions would otherwise linger.
            setPositions(prev => prev.filter(p => brokers.includes(p.broker)))

            // Fetch each broker in parallel but commit its positions to state AS IT
            // RESOLVES — replacing only that broker's slice — so a broker whose
            // /positions hangs can't block the others from rendering (a timing-out
            // cTrader used to starve fast paper / IBKR positions out of the list).
            await Promise.all(brokers.map(async (broker) => {
                let rows = []
                try {
                    const raw = await brokerService.getPositions(broker)
                    if (raw.length) {
                        // Positions may span several accounts on one broker, so each
                        // row carries its own account meta; fall back to the broker's
                        // selected account for rows that don't. Best-effort — never let
                        // this drop the positions.
                        let accountNo = null, currency = null
                        try {
                            const account = await brokerService.getAccount(broker)
                            accountNo = account?.login ?? account?.id ?? null
                            currency  = account?.currency ?? null
                        } catch { /* show positions without fallback meta */ }
                        rows = raw.map(p => ({
                            ...p,
                            broker,
                            accountNo: p.accountNo ?? accountNo,
                            currency:  p.currency  ?? currency,
                        }))
                    }
                } catch { rows = [] }
                setPositions(prev => [...prev.filter(p => p.broker !== broker), ...rows])
            }))
        } catch {
            setPositions([])
        } finally {
            setLoading(false)
            inFlightRef.current = false
        }
    }, [])

    useAutoRefresh(refresh, POSITIONS_POLL_MS)

    // Paper mode toggled from the profile → re-scope positions immediately instead of
    // waiting for the next poll, so they switch in lockstep with the account selector.
    // Stable handler (refresh is a []-dep callback) per useWindowEvent's contract.
    const handleModeChange = useCallback(() => refresh(true), [refresh])
    useWindowEvent('paper-mode-changed',     handleModeChange)
    useWindowEvent('workspace-mode-changed', handleModeChange)

    const closePosition = useCallback(async (broker, positionId, accountId) => {
        await brokerService.closePosition(broker, positionId, accountId)
        await refresh(true)
    }, [refresh])

    return { positions, loading, refresh, closePosition }
}
