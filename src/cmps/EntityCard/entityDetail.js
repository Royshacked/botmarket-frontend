// The in-app detail surface's URL, read and written in one place.
//
// EntityDetailHost renders whatever these two say is open, so the URL IS the state: a reload, a
// back gesture and a pasted link all agree by construction, and nothing is held in a ref that could
// disagree with the address bar.
//
// WHY A QUERY PARAM rather than the `/setup/:id` path the pop-out window uses: that path is how the
// service worker tells a pop-out from the app (pwa/rules isPopoutPath), and a phone navigating its
// ONLY window there would tell the worker the app is not open — a push would fire while the user is
// reading the very setup it is about. On `?setup=<id>` the pathname never changes.

/**
 * The kinds that have an IN-APP page (RootCmp mounts EntityDetailHost, which maps each to one).
 * `call` is not among them — its page went with Kairos — so `?call=…` opens nothing.
 *
 * It lives here rather than beside the opener because this module is the one both halves can
 * import: the opener pulls it in to decide where a click goes, and these URL helpers are pure, so
 * they can be tested under node:test with no DOM and no module graph behind them.
 */
export const INLINE_KINDS = ['idea', 'setup']

/**
 * Which entity a search string is showing, or null.
 *
 * One at a time: the first kind carrying an id wins, so a hand-written URL naming two opens the
 * first rather than racing two full-screen pages into the same corner.
 *
 * @param {string} search  `location.search`
 * @returns {{ kind: string, id: string }|null}
 */
export function detailFromSearch(search) {
    const params = new URLSearchParams(search ?? '')
    for (const kind of INLINE_KINDS) {
        const id = params.get(kind)
        if (id) return { kind, id }
    }
    return null
}

/**
 * The same search string with every detail param removed — the URL to replace the current one with
 * when there is no history entry of ours to step back over. Other params (`?chat=`, `?msg=` from a
 * push landing) are kept: closing a setup must not also close the conversation it was opened from.
 */
export function withoutDetail(search) {
    const params = new URLSearchParams(search ?? '')
    for (const kind of INLINE_KINDS) params.delete(kind)
    const q = params.toString()
    return q ? `?${q}` : ''
}

/** The search string that opens `kind`/`id`, preserving everything else already on the URL. */
export function withDetail(search, kind, id) {
    const params = new URLSearchParams(search ?? '')
    for (const k of INLINE_KINDS) params.delete(k)
    params.set(kind, id)
    return `?${params.toString()}`
}
