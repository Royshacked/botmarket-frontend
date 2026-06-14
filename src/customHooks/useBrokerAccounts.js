import { useState, useEffect } from 'react'
import { brokerService } from '../services/broker/broker.service.remote.js'

/**
 * Loads the user's connected broker trading accounts and tracks the current
 * selection. When exactly one account is selected it auto-becomes the "main"
 * account; clearing the selection clears main. With several selected, the
 * existing main is left as-is (the user picks it explicitly).
 *
 * @returns {{
 *   availableAccounts: import('../types.js').Account[],
 *   selectedAccounts: string[],
 *   setSelectedAccounts: Function,
 *   mainAccountId: string|null,
 *   setMainAccountId: Function,
 * }}
 */
export function useBrokerAccounts() {
    const [availableAccounts, setAvailableAccounts] = useState([])
    const [selectedAccounts, setSelectedAccounts]   = useState([])
    const [mainAccountId, setMainAccountId]         = useState(null)

    useEffect(() => {
        async function fetchAccounts() {
            try {
                const connections = await brokerService.listConnections()
                const all = []
                for (const [broker, connected] of Object.entries(connections)) {
                    if (!connected) continue
                    const { accounts = [] } = await brokerService.getTradingAccounts(broker)
                    accounts.forEach(a => all.push({ ...a, broker }))
                }
                setAvailableAccounts(all)
            } catch (err) {
                console.error('[accounts] fetch failed', err)
            }
        }
        fetchAccounts()
    }, [])

    useEffect(() => {
        if (selectedAccounts.length === 1) {
            setMainAccountId(selectedAccounts[0])
        } else if (selectedAccounts.length === 0) {
            setMainAccountId(null)
        }
        // length > 1: keep existing main as-is
    }, [selectedAccounts])

    return {
        availableAccounts,
        selectedAccounts,
        setSelectedAccounts,
        mainAccountId,
        setMainAccountId,
    }
}
