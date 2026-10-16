// ── Where a scan came from ─────────────────────────────────────────────────────
// Argus scans for the user, or on a board the Events radar handed it. The rule that follows, and
// the reason this is a module rather than an inline `if`: only the origins listed in
// savesToScansList are written to the Scans tab, and a new mode must opt in rather than inherit.
//
// Lives outside MainPage because the answer has to be the same everywhere it is asked. The pipeline
// service reads the same predicate for a second question with the same answer: whether the artifact
// it hands on carries a `ref` (persisted, addressable later) or only its items, inline for the
// length of the run. See docs/hand-offs.md.
//
// (Two further origins — an Atlas sleeve run and a Kairos discovery hand-off — were removed
// 2026-10-16: the sleeve run moved server-side and nothing sends a discovery request any more.)

export const ORIGIN = { USER: 'user', AETHER: 'aether' }

/**
 * Which origin this scan has. A radar board in force makes it a radar cut; otherwise the user's.
 *
 * AETHER is mid-pipeline traffic — the Events radar handed Argus a board rather than the user
 * walking in — and yet the list it produces IS the artifact the user came for. So it saves, like a
 * user scan, and is named apart from one because the next radar cut has to find it: the exclusion
 * rule reads only these.
 *
 * @param   {{radarActive?: boolean}} inbox
 * @returns {'user'|'aether'}
 */
export function scanOrigin({ radarActive = false } = {}) {
    return radarActive ? ORIGIN.AETHER : ORIGIN.USER
}

/**
 * Does a scan of this origin belong in the user's Scans tab? Their own, and a radar cut — which
 * is the daily list itself and the only record that it happened.
 * @param {string} origin  a value from ORIGIN
 */
export function savesToScansList(origin) {
    return origin === ORIGIN.USER || origin === ORIGIN.AETHER
}

/** The `source` a saved scan is stamped with. Null for an ordinary list — most of them. */
export function scanSourceFor(origin) {
    return origin === ORIGIN.AETHER ? 'aether' : null
}
