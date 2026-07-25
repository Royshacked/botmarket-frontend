// The ONE resolution read shared by every notification card. Top-level `status` (done | dismissed)
// is the source of truth; the legacy `payload.resolved` / `dismissed` fields are a fallback so
// pre-refactor history still collapses. Returns { resolved, status, outcome } — outcome drives the
// collapsed label. Kept in its own module so both the card shell and its tests import one rule.
export function readResolution(msg) {
    if (msg.status === 'done' || msg.status === 'dismissed') {
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
