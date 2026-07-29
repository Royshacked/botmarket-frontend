import { useState, useEffect, useRef } from 'react'
import { stashKey, popupIdFromPath } from '../cmps/EntityCard/entityPopup.js'

/**
 * The receiving half of openEntityPopup: hydrate the entity this pop-out window is for.
 *
 * Three tiers, fastest first — the same ladder IdeaPage and CallPage each implemented by hand:
 *   1. `window.__entityData` injected by the opener → paints with no round-trip.
 *   2. the localStorage stash → survives a slow popup boot.
 *   3. `fetch(id)` → a pasted URL, a reopened window, or a stash that never landed.
 *
 * Tiers 1 and 2 are CONSUMED (deleted) once read, so a stale stash can never outlive the window it
 * was written for.
 *
 * @param {string}   kind    a POPUP_KINDS key
 * @param {Function} fetchFn (id) => Promise<Object|null> — the API fallback
 * @param {Object}   [opts]
 * @param {number}   [opts.pollMs]   re-fetch interval; a monitor writes to these docs while the
 *   window is open (a call's assessment journal, a setup's Talos timeline).
 * @param {string}   [opts.notFound] error copy when the fetch resolves empty.
 * @returns {{ id: string, entity: Object|null, error: string|null, setEntity: Function, refresh: Function }}
 */
export function useEntityPopup(kind, fetchFn, { pollMs = 0, notFound = 'Not found' } = {}) {
    const id = popupIdFromPath()
    const [entity, setEntity] = useState(null)
    const [error, setError]   = useState(null)

    const fetchRef = useRef(fetchFn)
    fetchRef.current = fetchFn

    // Tier 1 + 2 run once, synchronously with the mount effect, then the API takes over.
    useEffect(() => {
        const injected = window.__entityData
        if (injected?.kind === kind && injected.entity?.id === id) {
            setEntity(injected.entity)
            delete window.__entityData
            return
        }
        const cached = localStorage.getItem(stashKey(kind, id))
        if (cached) {
            localStorage.removeItem(stashKey(kind, id))
            try { setEntity(JSON.parse(cached)); return }
            catch { /* corrupt stash — fall through to the API */ }
        }
        let alive = true
        fetchRef.current(id)
            .then(found => { if (!alive) return; found ? setEntity(found) : setError(notFound) })
            .catch(() => { if (alive) setError(`Failed to load ${kind}`) })
        return () => { alive = false }
    }, [kind, id, notFound])

    // Tier 3 as a live feed. Silent on failure so a blip never replaces a painted window with an
    // error — the last good entity stays on screen.
    useEffect(() => {
        if (!pollMs) return
        let alive = true
        async function pull() {
            try {
                const fresh = await fetchRef.current(id)
                if (alive && fresh) setEntity(fresh)
            } catch { /* keep what's on screen */ }
        }
        pull()
        const timer = setInterval(pull, pollMs)
        return () => { alive = false; clearInterval(timer) }
    }, [id, pollMs])

    async function refresh() {
        try {
            const fresh = await fetchRef.current(id)
            if (fresh) setEntity(fresh)
        } catch (err) { console.error(`[${kind}-popup] refresh failed`, err) }
    }

    return { id, entity, error, setEntity, refresh }
}
