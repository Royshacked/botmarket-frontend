// ── The plan's pure half ───────────────────────────────────────────────────────
// Formatters SetupPlan.jsx renders with and the one-line gist the pop-out shows when the plan is
// folded. Kept out of the component file — a module exporting both breaks Fast Refresh.

import { isLivePosition, isTerminal } from '../../services/entityStatus.js'

export const fmtLevel = z => (z?.price == null ? '—' : `${z.price}`)

/**
 * An ENTRY in words — its price, or, since 2026-09-28, the TRIGGER it gets in on (a condition, filled
 * at market when true; botmarket-backend docs/design/mentor-flow-intent.md #7). `about` is roughly
 * where it would fill and is never an order, so it is shown with a tilde. null when it has neither.
 *
 * THE one reading of an entry, for every surface that prints one. Each used to format it as a
 * price only, and a trigger entry came out as "null" on the Lists card and "—" everywhere else —
 * the whole way in, hidden (driven live, 2026-10-01).
 */
export const entryText = z => {
    if (z?.price != null) return `${z.price}`
    if (!z?.trigger) return null
    return z.about != null ? `~${z.about} on trigger` : 'on trigger'
}
/** The same, for a slot that must print something. */
export const fmtEntry = z => entryText(z) ?? '—'
export const fmtR     = r => (r == null ? '—' : `${r > 0 ? '+' : ''}${r}R`)
export const scenarioName = (sc, i) => sc?.name?.trim() || `Way in ${i + 1}`

/**
 * The plan in one line, for the folded Scenarios section.
 *
 *   pre-entry, one way in     "entry 238.6 · stop 234.8 · target 246, 252 · 2.4R"
 *   pre-entry, several        "2 ways in · armed: Break and go"
 *   in position / closed      the live numbers: "in @ 238.7 · stop 237 · +1.2R", or the outcome
 */
export function planTail(setup) {
    const scenarios = Array.isArray(setup?.scenarios) ? setup.scenarios : []
    const ps = setup?.position_state
    if ((isLivePosition(setup?.status) || isTerminal(setup?.status)) && ps) {
        if (isTerminal(setup?.status) && ps.outcome) {
            return [ps.outcome.reason, fmtR(ps.outcome.r_multiple)].filter(Boolean).join(' · ')
        }
        const fill = ps.entry?.fill_price ?? ps.entry?.intended
        return [
            fill != null ? `in @ ${fill}` : null,
            ps.stop?.current != null ? `stop ${ps.stop.current}` : null,
            ps.metrics?.r_multiple_now != null ? fmtR(ps.metrics.r_multiple_now) : null,
        ].filter(Boolean).join(' · ')
    }
    if (!scenarios.length) return 'no scenarios'
    if (scenarios.length > 1) {
        const armed = scenarios.findIndex(sc => sc.id === setup.armed_scenario_id)
        return `${scenarios.length} ways in${armed >= 0 ? ` · armed: ${scenarioName(scenarios[armed], armed)}` : ''}`
    }
    const sc = scenarios[0]
    const list = (zs, fmt = fmtLevel) => (Array.isArray(zs) ? zs : []).map(fmt).join(', ')
    return [
        sc.entry_legs?.length ? `entry ${list(sc.entry_legs, fmtEntry)}` : null,
        sc.stop_legs?.length  ? `stop ${list(sc.stop_legs)}` : null,
        sc.target_legs?.length    ? `target ${list(sc.target_legs)}` : null,
        Number.isFinite(sc.rr) ? `${sc.rr}R` : null,
    ].filter(Boolean).join(' · ')
}
