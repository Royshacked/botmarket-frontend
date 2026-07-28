import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * ONE loader for every owner-scoped entity list — setups, calls, coverage.
 *
 * The frontend mirror of the backend's entityCrud: fetching your setups and fetching your calls is
 * the same mechanism, so it lives once. WHAT to fetch and when it changes stay with the caller.
 *
 * It replaced three hand-rolled copies that had each solved the same problem differently, and two
 * of them got it wrong:
 *   • calls  — no loading state at all, so the tab rendered "No calls yet" during the first fetch.
 *   • setups — `loading` latched false after the first load but flipped nothing on later refreshes.
 *   • coverage — the only one that got it right (a ref so the spinner shows on the FIRST load only,
 *     never on a poll), which is the behaviour adopted here.
 * A poll must never blank a list the user is reading: `loading` is true only until the first
 * response, and a failed refresh keeps the last good items rather than emptying the surface.
 *
 * @param {Object}   cfg
 * @param {Function} cfg.load          () => Promise<T[]> — the remote list call.
 * @param {string}   [cfg.changeEvent] window event name broadcast by the service on a write.
 * @param {number}   [cfg.pollMs]      poll interval. Needed where a MONITOR changes state
 *   server-side without any client write to broadcast (a call going ready, Talos tripping a zone).
 * @param {string}   [cfg.log]         tag for load failures.
 * @returns {{ items: T[], loading: boolean, refresh: () => Promise<void>, setItems: Function }}
 */
export function useEntityList({ load, changeEvent = null, pollMs = 0, log = '[entityList]' }) {
    const [items, setItems]     = useState([])
    const [loading, setLoading] = useState(true)
    const loadedRef             = useRef(false)
    // The latest `load` without making it a dependency — an inline arrow would otherwise re-run
    // the whole effect (re-subscribing and restarting the timer) on every parent render.
    const loadRef               = useRef(load)
    loadRef.current = load

    const refresh = useCallback(async () => {
        try {
            const rows = await loadRef.current()
            setItems(Array.isArray(rows) ? rows : [])
            loadedRef.current = true
        } catch (err) {
            // Keep the last good list. A transient failure must not empty a surface mid-read.
            console.error(`${log} load failed`, err)
        } finally {
            // Only ever goes false. It starts true and drops after the first attempt (success OR
            // failure) — a poll never puts the surface back into a loading state.
            setLoading(false)
        }
    }, [log])

    useEffect(() => {
        refresh()
        if (changeEvent) window.addEventListener(changeEvent, refresh)
        const timer = pollMs > 0 ? setInterval(refresh, pollMs) : null
        return () => {
            if (changeEvent) window.removeEventListener(changeEvent, refresh)
            if (timer) clearInterval(timer)
        }
    }, [refresh, changeEvent, pollMs])

    return { items, loading, refresh, setItems }
}
