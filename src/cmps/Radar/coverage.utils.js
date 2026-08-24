// Pure reading helpers for a `coverage` doc. Kept out of the component files so those export
// components only (Fast Refresh), and so the rules below can be tested without rendering — the
// same split floor.utils.js and tradeIdea.utils.js already use.
//
// TWO surfaces render coverage — Radar/CoverageBook and Floor/FloorLists — so the next-revision
// read lives here rather than being written twice and drifting.

/**
 * When Prometheus is next scheduled to RE-MODEL this thesis — the expensive tier that re-runs the
 * valuation and restates the variant view, not the free daily gap re-read (`monitor.next_check_at`).
 *
 * The backend computes and stamps this every tick (coverage.remodel.js → remodelDecision):
 * the next dated catalyst + 1 day, else `last_remodel_at` + 90 days (the quarterly floor). It stamps
 * the LABEL beside it too (`monitor.next_remodel_reason` — "Q3 earnings" / 'catalyst' / 'quarterly
 * floor'), which we pass through rather than re-derive: which branch produced the date is the
 * monitor's judgment, and reading the catalyst list back here to guess would be a second copy of it.
 *
 * Returns null — render nothing — when:
 *   • the coverage is RETIRED. The monitor excludes those from due-selection outright, so a date on
 *     a retired thesis would promise a run that will never happen.
 *   • there is no stamp yet, or it doesn't parse. A never-modelled name with no anchor has no
 *     schedule, and inventing "soon" would be worse than saying nothing.
 *
 * @returns {{ iso:string, label:string, reason:string|null, due:boolean }|null}
 *   `due:true` = the scheduled date has passed and the monitor hasn't run it yet — it may be waiting
 *   on the 14-day cooldown or the 3-per-tick cap. We say "due", not a stale past date.
 *   `reason` is null on docs written before the monitor started stamping it, so treat it as optional
 *   decoration and never as the thing that makes the row worth rendering.
 */
export function nextRevision(coverage, nowMs = Date.now()) {
    if (coverage?.status === 'retired') return null
    const iso = coverage?.monitor?.next_remodel_at
    if (typeof iso !== 'string' || !iso) return null
    const ms = Date.parse(iso)
    if (!Number.isFinite(ms)) return null
    const raw    = coverage?.monitor?.next_remodel_reason
    const reason = (typeof raw === 'string' && raw.trim()) ? raw.trim() : null
    if (ms <= nowMs) return { iso, label: 'due', reason, due: true }
    return { iso, label: fmtRevisionDate(ms, nowMs), reason, due: false }
}

/**
 * Short date, year only when it isn't this one — the same shape ScanList uses for scan dates.
 *
 * Formatted in UTC, deliberately. The schedule is UTC-anchored end to end (`${date}T00:00:00.000Z`
 * plus a day, in coverage.remodel.js), so a stamp of exactly UTC midnight renders as the PREVIOUS
 * day for every user west of Greenwich — "Nov 2" against a catalyst dated Nov 2 and a re-model that
 * runs on the 3rd. There is no clock here to be local about: this is a calendar date, not an event
 * at an hour.
 */
function fmtRevisionDate(ms, nowMs) {
    const d = new Date(ms)
    const sameYear = d.getUTCFullYear() === new Date(nowMs).getUTCFullYear()
    return d.toLocaleDateString(undefined, {
        timeZone: 'UTC', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }),
    })
}

// The date is a FLOOR, not a promise: an edge-category change or an early target hit re-models the
// name sooner, and neither is on a calendar. The hint says so, so a user reading "Nov 3" doesn't
// take it as "nothing happens until then".
export const NEXT_REVISION_HINT =
    'Scheduled re-model. Prometheus may revise sooner if the edge changes shape or the target is hit early.'
