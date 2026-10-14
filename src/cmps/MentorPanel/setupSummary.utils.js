// ── The worksheet's pure half ──────────────────────────────────────────────────
// Kept out of SetupSummary.jsx, where it lived until 2026-10-14 — a module exporting a component
// and a helper breaks Fast Refresh (the same reason setupPlan.utils exists).

import { fmtLeg } from '../TradeIdeas/setupPlan.utils.js'

// The worksheet folded onto one line, for the collapsed preview header. It sits beside the summary
// so the summary and its one-liner describe the setup in the same vocabulary — a way scenario is an
// entry scenario in both, and the entry level is formatted by the one shared fmtLeg.
//
// Says the things you check at a glance and could not otherwise see while folded: WHICH asset,
// which direction, and how many rival premises are drawn (the count is the surprising one — a
// second entry scenario is easy to forget you agreed to).
export function setupDigest(setup) {
    if (!setup?.asset) return ''
    const parts = [setup.asset]
    if (setup.direction) parts.push(setup.direction.toUpperCase())

    const scenarios = setup.scenarios ?? []
    if (scenarios.length === 1) {
        const entry = fmtLeg(scenarios[0].entry_legs?.[0])
        parts.push(entry ? 'entry ' + entry : '1 entry scenario')
    } else if (scenarios.length > 1) {
        parts.push(scenarios.length + ' entry scenarios')
    }
    return parts.join(' · ')
}
