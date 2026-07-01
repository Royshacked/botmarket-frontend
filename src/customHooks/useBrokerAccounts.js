import { useState, useEffect, useCallback } from 'react'
import { brokerService } from '../services/broker/broker.service.remote.js'

/**
 * Loads the user's connected broker trading accounts and tracks the current
 * selection. When exactly one account is selected it auto-becomes the "main"
 * account; clearing the selection clears main. With several selected, the
 * existing main is left as-is (the user picks it explicitly).
 *
 * Paper mode is global: the backend only reports the paper account as connected
 * while paper mode is ON, and it routes EVERY new idea to that account regardless
 * of which live accounts were selected. So when a paper account is present we
 * treat it as the only valid target — isolate it in the selector and pre-select
 * it — instead of letting the user tick a live account that would be ignored.
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
            const all = []
            for (const [broker, connected] of Object.entries(connections)) {
                if (!connected) continue
                const { accounts = [] } = await brokerService.getTradingAccounts(broker)
                accounts.forEach(a => all.push({ ...a, broker }))
            }

            const paper = all.filter(a => a.broker === 'paper')
            if (paper.length) {
                // Paper mode on → the paper account is the sole target; isolate + auto-select.
                setIsPaper(true)
                setAvailableAccounts(paper)
                setSelectedAccounts(paper.map(a => a.id))
                setMainAccountId(paper[0].id)
            } else {
                setIsPaper(false)
                setAvailableAccounts(all)
            }
        } catch (err) {
            console.error('[accounts] fetch failed', err)
        }
    }, [])

    useEffect(() => { refreshAccounts() }, [refreshAccounts])

    useEffect(() => {
        if (isPaper) return   // paper selection is managed by refreshAccounts
        if (selectedAccounts.length === 1) {
            setMainAccountId(selectedAccounts[0])
        } else if (selectedAccounts.length === 0) {
            setMainAccountId(null)
        }
        // length > 1: keep existing main as-is
    }, [selectedAccounts, isPaper])

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
