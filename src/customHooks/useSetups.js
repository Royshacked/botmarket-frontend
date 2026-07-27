import { useState, useEffect, useCallback } from 'react'
import { mentorService, SETUPS_CHANGED } from '../services/mentor/mentor.service.remote'

/**
 * The user's `setup` entities (Mentor's artifact), kept in sync with the SETUPS_CHANGED broadcast.
 *
 * Mirrors useScans/useTradeIdeas. Setups are their own entity kind, so they are NOT in the ideas
 * list — `getIdeas` filters `kind:'idea'` — which is why they need their own loader rather than
 * riding along with it.
 */
export function useSetups() {
    const [setups,  setSetups]  = useState([])
    const [loading, setLoading] = useState(true)

    const refresh = useCallback(async () => {
        const rows = await mentorService.listSetups()
        setSetups(Array.isArray(rows) ? rows : [])
        setLoading(false)
    }, [])

    useEffect(() => {
        refresh()
        window.addEventListener(SETUPS_CHANGED, refresh)
        return () => window.removeEventListener(SETUPS_CHANGED, refresh)
    }, [refresh])

    return { setups, setupsLoading: loading, refreshSetups: refresh }
}
