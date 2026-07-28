import { useCallback } from 'react'
import { mentorService, SETUPS_CHANGED } from '../services/mentor/mentor.service.remote'
import { useEntityList } from './useEntityList.js'

// Poll cadence. Talos changes a setup server-side (armed → a zone trip → 'hit') with no client
// write to broadcast SETUPS_CHANGED, so the list has to look for itself. Matches the calls tab.
const POLL_MS = 20_000

/**
 * The user's `setup` entities (Mentor's artifact), kept in sync with the SETUPS_CHANGED broadcast.
 *
 * Setups are their own entity kind, so they are NOT in the ideas list — `getIdeas` filters out
 * anything that isn't an idea or a portfolio leg — which is why they need their own loader. The
 * loading MECHANISM is the shared useEntityList; only the fetch and its change signal are ours.
 */
export function useSetups() {
    const load = useCallback(() => mentorService.listSetups(), [])
    const { items, loading, refresh } = useEntityList({
        load, changeEvent: SETUPS_CHANGED, pollMs: POLL_MS, log: '[setups]',
    })
    return { setups: items, setupsLoading: loading, refreshSetups: refresh }
}
