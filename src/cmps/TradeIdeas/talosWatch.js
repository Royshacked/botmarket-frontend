import { isArmed, isUnarmed } from '../../services/entityStatus.js'

// The two facts the setup pop-out reads off Talos's state. The rest of what lived here — the tier
// cascade, the graded-condition join, the "almost" readiness word — went with the TalosWatch panel:
// every read now leaves a journal row carrying its own conditions (TalosJournal.jsx), and where
// Talos stands is the head of that journal (docs/design/talos-per-candle.md).

/**
 * Does the pre-entry stale-map ask apply? Past entry the position is the live surface and the
 * management card is what speaks, so the ask steps aside.
 */
export const showsWatch = (status) => isArmed(status) || isUnarmed(status)

/**
 * The timeframe the CHART should show: whatever Talos chose to look at next, falling back to the
 * rung the setup was drawn on. The user sees what the monitor sees — a setup authored on the 1hr
 * whose read climbed to the 4hr for structure should not be shown an hourly chart while its
 * journal talks about a four-hour close.
 */
export function watchTimeframe(setup) {
    return setup?.monitor_state?.timeframe || setup?.timeframe || 'day'
}
