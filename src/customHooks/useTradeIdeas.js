import { useState, useCallback } from 'react'
import { tradeIdeasService } from '../services/tradeIdeas/tradeIdeas.service.remote.js'
import { useAutoRefresh } from './useAutoRefresh.js'
import { useWindowEvent } from './useWindowEvent.js'

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
 *   loading: boolean,
 *   handleStatusChange: (id: string, status: string) => Promise<void>,
 *   handleUpdateIdea: (id: string, patch: object) => Promise<void>,
 * }}
 */
export function useTradeIdeas() {
    const [ideas, setIdeas] = useState([])
    // True only while re-fetching after a workspace switch, so the list can show a
    // loader — the silent 30s poll (loadIdeas) never flips it.
    const [loading, setLoading] = useState(false)
    // Arm-time pre-flight prompt: { idea, close } when activating an idea whose
    // entry level is already held (monitor won't fire) — null otherwise.
    const [preEntryPrompt, setPreEntryPrompt] = useState(null)

    // Returns the fetched list as well as storing it. A caller that needs to ACT on the fresh data
    // in the same tick cannot read it back from `ideas` or a ref — both only update on the next
    // render — so the array is handed straight back. (Used by the entry-confirm card route, which
    // has to resolve an idea the server just changed.) Returns null on failure, never throws.
    const loadIdeas = useCallback(async () => {
        try {
            const fetched = await tradeIdeasService.getIdeas()
            setIdeas(fetched)
            return fetched
        } catch (err) {
            console.error('[tradeIdeas] load failed', err)
            return null
        }
    }, [])

    useAutoRefresh(loadIdeas, POLL_INTERVAL_MS)

    // Switching workspace (live/paper/manual) re-scopes which ideas are relevant, so
    // pull a fresh list and surface a loader while it lands. Listen to the canonical
    // workspace-switch signal only (paper-mode-changed also fires on account CRUD, which
    // doesn't change the idea set) to avoid a redundant double fetch.
    const reloadForWorkspace = useCallback(async () => {
        setLoading(true)
        try { await loadIdeas() }
        finally { setLoading(false) }
    }, [loadIdeas])
    useWindowEvent('workspace-mode-changed', reloadForWorkspace)

    async function handleStatusChange(id, status) {
        // Optimistic update — React controlled selects snap back without this
        setIdeas(prev => prev.map(idea => idea.id === id ? { ...idea, status } : idea))
        try {
            const res = await tradeIdeasService.updateIdea(id, { status })
            // Confirm with the server's returned document
            setIdeas(prev => prev.map(idea => idea.id === id ? res.idea : idea))
            // Arm-time pre-flight: entry level already held → prompt Buy now / Edit / Reset
            if (res.preEntry?.alreadySatisfied) {
                setPreEntryPrompt({ idea: res.idea, close: res.preEntry.close })
            }
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

    return { ideas, setIdeas, loadIdeas, loading, handleStatusChange, handleUpdateIdea, preEntryPrompt, setPreEntryPrompt }
}
