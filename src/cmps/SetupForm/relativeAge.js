/**
 * How old a plan is, in the coarsest unit that is still honest.
 *
 * A shared setup is a snapshot of a moment. Drawn on Monday and opened on Friday, its levels may be
 * nowhere near price and the only person who can judge that is the one about to take it — so the
 * form says the age out loud rather than presenting the numbers as current.
 *
 * COARSE ON PURPOSE. "3 days ago" is the fact that matters; "3 days and 4 hours ago" implies a
 * precision about staleness that nobody has. Pure, and `now` is injected so it is testable.
 *
 * Its own module because it is shared between a component and its test, and the fast-refresh rule
 * wants a file to export components or helpers, not both.
 */
export function relativeAge(at, now = Date.now()) {
    const mins = Math.floor((now - Number(at)) / 60000)
    // Not finite (no timestamp) or negative (a clock ahead of ours) — neither is worth a claim.
    if (!Number.isFinite(mins) || mins < 2) return 'just now'
    if (mins < 60) return `${mins} minutes ago`

    const hours = Math.floor(mins / 60)
    if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`

    const days = Math.floor(hours / 24)
    return days === 1 ? 'yesterday' : `${days} days ago`
}
