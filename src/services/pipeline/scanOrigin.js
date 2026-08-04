// ── Where a scan came from ─────────────────────────────────────────────────────
// Argus scans in three modes — for the portfolio desk, for Kairos, and for the user — and the mode
// is not a flag it carries. It IS its inbox: a scan Argus ran because another desk handed it a
// brief (a sleeve mandate from Atlas, a discovery request from Kairos) is mid-pipeline traffic; a
// scan the user walked in and asked for is an artifact they keep.
//
// The rule that follows, and the reason this is a module rather than an inline `if`: only a USER
// scan is written to the Scans tab. Screening three sleeves for one book used to leave three sector
// lists among the user's saved lists — a record of the machinery, not of anything they asked for.
//
// Lives outside MainPage because the answer has to be the same everywhere it is asked. The pipeline
// service reads the same predicate for a second question with the same answer: whether the artifact
// it hands on carries a `ref` (persisted, addressable later) or only its items, inline for the
// length of the run. See docs/pipeline-service-design.md §1.

export const ORIGIN = { USER: 'user', PORTFOLIO: 'portfolio', KAIROS: 'kairos' }

/**
 * Which desk asked for this scan. Both flags false = nobody did, i.e. the user.
 *
 * Precedence when both are somehow set (they are cleared on entry to either hop, so this is a
 * belt-and-braces order rather than a real case): the sleeve run wins, because it is the one that
 * survives across several scans and would otherwise be mislabelled halfway through. It changes no
 * behaviour — neither origin is kept — only which desk the scan is attributed to.
 *
 * @param   {{sleeveRunActive?: boolean, handoffActive?: boolean}} inbox
 * @returns {'user'|'portfolio'|'kairos'}
 */
export function scanOrigin({ sleeveRunActive = false, handoffActive = false } = {}) {
    if (sleeveRunActive) return ORIGIN.PORTFOLIO
    if (handoffActive)   return ORIGIN.KAIROS
    return ORIGIN.USER
}

/**
 * Does a scan of this origin belong in the user's Scans tab? Only their own does.
 * @param {string} origin  a value from ORIGIN
 */
export function savesToScansList(origin) {
    return origin === ORIGIN.USER
}
