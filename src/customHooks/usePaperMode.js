import { useState, useCallback } from 'react'
import { paperService } from '../services/paper/paper.service.remote.js'
import { useAutoRefresh } from './useAutoRefresh.js'
import { useWindowEvent } from './useWindowEvent.js'

/**
 * Tracks whether global paper (simulation) mode is on, for the header mode
 * indicator. Fetches once when a user is present and re-fetches whenever the
 * profile toggle dispatches the 'paper-mode-changed' event, so the badge stays
 * in sync without a reload.
 *
 * @param {string} [userId]  only fetch when logged in — an authed call while
 *                           logged out would trip the httpService 401 redirect.
 * @returns {boolean} isPaper
 */
export function usePaperMode(userId) {
    const [isPaper, setIsPaper] = useState(false)

    const refresh = useCallback(async () => {
        if (!userId) { setIsPaper(false); return }
        try {
            const st = await paperService.getState()
            setIsPaper(!!st?.enabled)
        } catch { /* paper API unavailable — leave as live */ }
    }, [userId])

    useAutoRefresh(refresh)
    useWindowEvent('paper-mode-changed', refresh)

    return isPaper
}
