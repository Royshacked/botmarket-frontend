import { useState, useEffect, useCallback } from 'react'
import { brokerService } from '../services/broker/broker.service.remote.js'
import { resolveWorkspace } from './useWorkspaceMode.js'
import { useAutoRefresh } from './useAutoRefresh.js'
import { useWindowEvent } from './useWindowEvent.js'

/**
 * Loads the user's connected broker trading accounts and tracks the current
 * selection. When exactly one account is selected it auto-becomes the "main"
 * account; clearing the selection clears main. With several selected, the
 * existing main is left as-is (the user picks it explicitly).
 *
 * Paper mode is the workspace switch: the backend reports paper as connected while
 * paper mode is ON and returns the user's NAMED paper accounts. A paper idea binds to
 * exactly ONE account, so in paper mode we isolate the selector to the paper accounts
 * and keep a SINGLE one selected (the prior pick if still valid, else the first) —
 * the user picks which named account this idea simulates on.
 *
 * @returns {{
 *   availableAccounts: import('../types.js').Account[],
 *   selectedAccounts: string[],
 *   setSelectedAccounts: Function,
 *   mainAccountId: string|null,
 *   setMainAccountId: Function,
 *   isPaper: boolean,
 *   refreshAccounts: Function,
 * }}
 */
export function useBrokerAccounts() {
    const [availableAccounts, setAvailableAccounts] = useState([])
    const [selectedAccounts, setSelectedAccounts]   = useState([])
    const [mainAccountId, setMainAccountId]         = useState(null)
    const [isPaper, setIsPaper]                     = useState(false)

    const refreshAccounts = useCallback(async () => {
        try {
            const connections = await brokerService.listConnections()
            const connected   = Object.entries(connections).filter(([, c]) => c).map(([b]) => b)
            const ws          = resolveWorkspace(connections.paper)

            // Isolate to the active workspace's accounts: a paper/manual idea binds to ONE
            // named virtual account; live shows the real brokers (paper+manual excluded).
            const brokers = ws === 'paper'  ? ['paper']
                          : ws === 'manual' ? ['manual']
                          : connected.filter(b => b !== 'paper' && b !== 'manual')

            const lists = await Promise.all(
                brokers.filter(b => connected.includes(b)).map(async (broker) => {
                    const { accounts = [] } = await brokerService.getTradingAccounts(broker)
                    return accounts.map(a => ({ ...a, broker }))
                })
            )
            const all = lists.flat()

            setIsPaper(ws === 'paper')
            setAvailableAccounts(all)

            if (ws === 'paper' || ws === 'manual') {
                // Virtual workspace → one account per idea: keep ONE selected (the prior
                // pick if it still exists, else the first). main follows via the effect.
                setSelectedAccounts(prev => {
                    const kept = prev.find(id => all.some(a => a.id === id))
                    return all.length ? [kept ?? all[0].id] : []
                })
            } else {
                // Drop any selected ids that no longer exist — e.g. a virtual id after
                // switching to the live workspace, or a disconnected account.
                setSelectedAccounts(prev => prev.filter(id => all.some(a => a.id === id)))
            }
        } catch (err) {
            console.error('[accounts] fetch failed', err)
        }
    }, [])

    useAutoRefresh(refreshAccounts)

    // Workspace is switched from the header/profile → re-fetch so the selector reflects the
    // active workspace's accounts live. Both events fire on a switch; either triggers a sync.
    useWindowEvent('paper-mode-changed',     refreshAccounts)
    useWindowEvent('workspace-mode-changed', refreshAccounts)

    useEffect(() => {
        // A single selection (always the case in paper mode) is the main account; an
        // empty selection clears it. With several live accounts selected, the user
        // stars the main explicitly, so leave it as-is.
        if (selectedAccounts.length === 1) {
            setMainAccountId(selectedAccounts[0])
        } else if (selectedAccounts.length === 0) {
            setMainAccountId(null)
        }
    }, [selectedAccounts])

    return {
        availableAccounts,
        selectedAccounts,
        setSelectedAccounts,
        mainAccountId,
        setMainAccountId,
        isPaper,
        refreshAccounts,
    }
}
