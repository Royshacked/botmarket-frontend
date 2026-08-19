/**
 * WHICH DESKS GET A FRESH SLATE when the user walks home to Axl.
 *
 * Two of the six panels are remounted on the way home (Argus, Atlas), so that re-entering them from
 * the hub starts a new conversation rather than dropping the user back into the last one. The other
 * four are toggled with `display:none` and keep their state.
 *
 * A DESK MID-TURN IS EXEMPT, and that is the whole of this rule. Walking away is not stopping — the
 * server keeps the turn running when the socket closes (api/_shared/sse.util.js: a closed connection
 * means only "nobody is watching") — so the answer is still coming. Remounting threw away the panel
 * that was going to receive it: the fetch survived, its component did not, and the reply landed in a
 * closure with nowhere to render. The four unkeyed desks never had this problem, which is why
 * "go back to Axl mid-answer and the reply is waiting for you" was true at Mentor and false at Argus.
 *
 * Pure, and separate from the page, because it is the one decision here worth being sure about: a
 * wrong answer silently discards work the user has already paid for.
 *
 * @param {object} keys  current per-desk keys, e.g. { scanner: 3, portfolio: 1 }
 * @param {object} busy  which desk tabs are mid-turn, e.g. { scanner: true }
 * @returns {object} the next keys — same object shape, bumped only where it is safe to
 */
export function nextResetKeys(keys = {}, busy = {}) {
    const next = {}
    for (const desk of Object.keys(keys)) {
        next[desk] = busy?.[desk] ? keys[desk] : (keys[desk] ?? 0) + 1
    }
    return next
}
