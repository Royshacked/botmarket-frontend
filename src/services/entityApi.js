import { httpService } from './http.service'

// ONE transport for every entity's REST surface — the frontend mirror of the backend's
// makeEntityCrud, and the last piece of per-kind plumbing on this side.
//
// It replaced four near-identical remote services (tradeIdeas, kairos, mentor, analyst) that each
// re-implemented the same four things: list-or-empty, get-or-null, delete, and a window broadcast
// so every open list refreshes after a write. `mentor` and `analyst` carried the same
// `_announceChange()` block verbatim.
//
// SHARE THE PIPE, NOT THE JUDGMENT. What a Generate posts, what an action verb means, whether a
// PATCH arms or disarms — those are the kind's own decisions and stay in its service. What lives
// here is the HTTP call, the failure posture, and the broadcast.
//
// The failure posture is deliberate and matches useEntityList:
//   • list → []    a list surface degrades to empty; it never throws into a render
//   • get  → null  the caller decides what a missing entity means
//   • writes THROW — a failed write must reach the user, never be swallowed into a silent no-op
//
/**
 * @param {string} base          e.g. 'api/setups'
 * @param {string} [changeEvent] window event fired after every write, so open lists reload
 * @param {string} [listKey]     unwrap the list from an envelope — `/api/trade-ideas` answers
 *   `{ ideas: [...] }` while the newer routes answer a bare array. A transport-shape difference,
 *   not a judgment, so it is configured here rather than re-implemented in the kind's service.
 */
export function makeEntityApi({ base, changeEvent = null, listKey = null }) {
    const url = (path = '') => `${base}${path}`
    const id_ = (id) => `${base}/${encodeURIComponent(id)}`

    /** Tell every mounted list to reload. No-op when the kind has no broadcast. */
    function announce() {
        if (changeEvent) window.dispatchEvent(new Event(changeEvent))
    }

    /** Run a write, then announce. Errors propagate — the caller surfaces them. */
    async function write(fn) {
        const res = await fn()
        announce()
        return res
    }

    return {
        base,
        changeEvent,
        announce,

        /** The kind's list. `params` become the query string. [] on failure. */
        async list(params = undefined) {
            try {
                const data = await httpService.get(url(), params)
                const rows = listKey ? data?.[listKey] : data
                return Array.isArray(rows) ? rows : []
            } catch { return [] }
        },

        /** One entity by id. null when it is missing or the fetch fails. */
        async get(id) {
            try { return await httpService.get(id_(id)) }
            catch { return null }
        },

        async remove(id)          { return write(() => httpService.delete(id_(id))) },
        async patch(id, body)     { return write(() => httpService.patch(id_(id), body)) },
        async put(id, body)       { return write(() => httpService.put(id_(id), body)) },

        /** POST to the collection (`path` empty) or to a sub-route (`/${id}/action`). */
        async post(path, body)    { return write(() => httpService.post(url(path), body)) },

        /** GET a sub-route that is not the list (a performance rollup, a summary). null on failure. */
        async getPath(path) {
            try { return await httpService.get(url(path)) }
            catch { return null }
        },
    }
}
