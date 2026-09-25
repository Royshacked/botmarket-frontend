// ── The plan's pure half ───────────────────────────────────────────────────────
// Formatters SetupPlan.jsx renders with and the one-line gist the pop-out shows when the plan is
// folded. Kept out of the component file — a module exporting both breaks Fast Refresh.

import { isLivePosition, isTerminal } from '../../services/entityStatus.js'

export const fmtLevel = z => (z?.price == null ? '—' : `${z.price}`)
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
    const list = zs => (Array.isArray(zs) ? zs : []).map(fmtLevel).join(', ')
    return [
        sc.entry_legs?.length ? `entry ${list(sc.entry_legs)}` : null,
        sc.stop_legs?.length  ? `stop ${list(sc.stop_legs)}` : null,
        sc.target_legs?.length    ? `target ${list(sc.target_legs)}` : null,
        Number.isFinite(sc.rr) ? `${sc.rr}R` : null,
    ].filter(Boolean).join(' · ')
}
