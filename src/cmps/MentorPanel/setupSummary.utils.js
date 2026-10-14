// ── The worksheet's pure half ──────────────────────────────────────────────────
// Kept out of SetupSummary.jsx, where it lived until 2026-10-14 — a module exporting a component
// and a helper breaks Fast Refresh (the same reason setupPlan.utils exists).

import { entryText } from '../TradeIdeas/setupPlan.utils.js'

// The worksheet folded onto one line, for the collapsed preview header. It sits beside the summary
// so the summary and its one-liner describe the setup in the same vocabulary — a way scenario is an
// entry scenario in both, and the entry is read by THE one reading of an entry, entryText, as the
// scenario block below it is. It used the price-only fmtLeg until 2026-10-14, so a TRIGGER entry
// folded to "1 entry scenario" while the open block said "~117.2 on trigger".
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
        const entry = entryText(scenarios[0].entry_legs?.[0])
        parts.push(entry ? 'entry ' + entry : '1 entry scenario')
    } else if (scenarios.length > 1) {
        parts.push(scenarios.length + ' entry scenarios')
    }
    return parts.join(' · ')
}
