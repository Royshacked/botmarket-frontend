// Wording for the captured goal — kept out of ObjectiveChip.jsx so that file exports only a
// component (anything else there costs Fast Refresh, and nothing else in this repo does it).

/** '2026-08-06' → 'Aug 6'. Parsed as UTC so the date never slips a day west of Greenwich. */
export function formatDeadline(until) {
    if (typeof until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(until)) return null
    const d = new Date(`${until}T00:00:00Z`)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/**
 * The chip's parts, or null when there is nothing worth showing.
 * Pure, so the wording is testable without rendering the hub.
 *
 * `risk: null` is a meaningful result, not a missing one — the chip renders it as "risk not set"
 * because that blank is the number every desk needs before it sizes anything.
 */
export function formatObjective(objective) {
    if (!objective) return null
    const { target = {}, horizon = {}, risk = {}, symbol } = objective

    const targetText = target.pct != null
        ? `+${target.pct}%`
        : target.amount != null
            ? `+${target.amount.toLocaleString()}${target.currency ? ` ${target.currency}` : ''}`
            : null
    if (!targetText) return null

    const deadline = formatDeadline(horizon.until)
    const riskText = risk.maxDrawdownPct != null
        ? `risk ${risk.maxDrawdownPct}%`
        : risk.amount != null
            ? `risk ${risk.amount.toLocaleString()}`
            : null

    return {
        goal: deadline ? `${targetText} by ${deadline}` : targetText,
        risk: riskText,
        symbol: symbol ?? null,
    }
}
