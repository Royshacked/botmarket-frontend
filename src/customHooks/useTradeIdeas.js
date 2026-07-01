import { useState, useCallback } from 'react'
import { tradeIdeasService } from '../services/tradeIdeas/tradeIdeas.service.remote.js'
import { useAutoRefresh } from './useAutoRefresh.js'

const POLL_INTERVAL_MS = 30_000

/**
 * Owns the trade-ideas list: initial load, periodic refresh, and the pure
 * server-sync mutations (status + field updates) that don't touch the build/edit
 * session. `setIdeas` and `loadIdeas` are exposed so the page's build/edit and
 * portfolio handlers can keep the list in sync after their own operations.
 *
 * @returns {{
 *   ideas: import('../types.js').Idea[],
 *   setIdeas: Function,
 *   loadIdeas: () => Promise<void>,
 *   handleStatusChange: (id: string, status: string) => Promise<void>,
 *   handleUpdateIdea: (id: string, patch: object) => Promise<void>,
 * }}
 */
export function useTradeIdeas() {
    const [ideas, setIdeas] = useState([])

    const loadIdeas = useCallback(async () => {
        try {
            const fetched = await tradeIdeasService.getIdeas()
            setIdeas(fetched)
        } catch (err) {
            console.error('[tradeIdeas] load failed', err)
        }
    }, [])

    useAutoRefresh(loadIdeas, POLL_INTERVAL_MS)

    async function handleStatusChange(id, status) {
        // Optimistic update — React controlled selects snap back without this
        setIdeas(prev => prev.map(idea => idea.id === id ? { ...idea, status } : idea))
        try {
            const res = await tradeIdeasService.updateIdea(id, { status })
            // Confirm with the server's returned document
            setIdeas(prev => prev.map(idea => idea.id === id ? res.idea : idea))
        } catch (err) {
            console.error('[tradeIdeas] status update failed', err)
            // Revert by reloading from server
            loadIdeas()
        }
    }

    async function handleUpdateIdea(id, patch) {
        try {
            const res = await tradeIdeasService.updateIdea(id, patch)
            setIdeas(prev => prev.map(idea => idea.id === id ? res.idea : idea))
        } catch (err) {
            console.error('[tradeIdeas] update failed', err)
        }
    }

    return { ideas, setIdeas, loadIdeas, handleStatusChange, handleUpdateIdea }
}
