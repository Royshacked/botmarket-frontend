// The ONE resolution read shared by every notification card. Top-level `status` (done | dismissed)
// is the source of truth; the legacy `payload.resolved` / `dismissed` fields are a fallback so
// pre-refactor history still collapses. Returns { resolved, status, outcome } — outcome drives the
// collapsed label. Kept in its own module so both the card shell and its tests import one rule.
export function readResolution(msg) {
    // `superseded` is terminal too — a fresher card about the same entity replaced this one, so it
    // must collapse rather than sit in the feed as a second live ask. Omitting it here would have
    // been silent and ugly: the backend retires the old card, the client keeps rendering it, and
    // the one-live-ask guarantee is lost exactly where it is visible.
    if (msg.status === 'done' || msg.status === 'dismissed' || msg.status === 'superseded') {
        return { resolved: true, status: msg.status, outcome: msg.resolveOutcome ?? null }
    }
    if (msg.payload?.resolved) {
        return { resolved: true, status: msg.payload.outcome === 'updated' ? 'done' : 'dismissed', outcome: msg.payload.outcome ?? null }
    }
    if (msg.dismissed) {
        return { resolved: true, status: 'dismissed', outcome: msg.dismissOutcome ?? null }
    }
    return { resolved: false, status: null, outcome: null }
}
