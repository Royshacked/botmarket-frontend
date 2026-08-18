// What to SAY after accepting a review — the one place the three outcomes are turned into words.
//
// An accepted change now lands in one of three buckets, not two: applied, queued for the open
// (the market was shut — nothing executes off-hours, paper included), or failed. The toast used to
// be the flat string "Changes applied.", which was printed over a review where every single change
// silently did nothing. So the rule here is that the message never claims more than the result.
//
// Pure and separate from MainPage so it can be tested without rendering the app.

// Refusals worth naming. A scale-in or trim whose share count floors to zero is the common one —
// it reads as a bug ("I accepted it and nothing happened") unless the message says what happened.
const REASON_COPY = {
    add_too_small:  'too small to place',
    trim_too_small: 'too small to place',
    no_position:    'no open position',
    not_live:       'not in a position yet',
    already_held_use_add_to_item: 'already held',
    market_closed:  'market closed',
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/** "at 09:30" when we know when the venue reopens, otherwise the generic phrase. */
function openWhen(nextOpenMs) {
    if (!Number.isFinite(nextOpenMs)) return 'the open'
    const d = new Date(nextOpenMs)
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const today = new Date().toDateString() === d.toDateString()
    return today ? `the open (${time})` : `the open (${d.toLocaleDateString([], { weekday: 'short' })} ${time})`
}

/**
 * @param {object} result   the applyRebalance response
 * @param {{ pending?: boolean }} [opts]  pending = the book was never activated
 * @returns {string}
 */
export function reviewApplyMessage(result, { pending = false } = {}) {
    const applied  = Number(result?.applied) || 0
    const queued   = result?.deferredItems?.length ?? 0
    const failures = result?.failed ?? []

    const parts = []
    if (applied) parts.push(`${plural(applied, 'change', 'changes')} applied`)
    if (queued)  parts.push(`${applied ? queued : plural(queued, 'change', 'changes')} queued for ${openWhen(result?.nextOpenMs)}`)

    if (failures.length) {
        // Name the reason when they all share one; past that the count is the information and the
        // detail belongs in the list, not a toast.
        const reasons = [...new Set(failures.map(f => REASON_COPY[f.reason] ?? null))]
        const why     = reasons.length === 1 && reasons[0] ? ` (${reasons[0]})` : ''
        parts.push(`${plural(failures.length, 'change', 'changes')} couldn't be applied${why}`)
    }

    // No buckets at all — the server said ok without saying what it did (an older response shape).
    // Fall back to the previous wording rather than inventing a count.
    if (!parts.length) {
        return pending
            ? 'Changes applied — activate the book from your portfolio list when ready.'
            : 'Changes applied.'
    }

    const head = `${parts.join(' · ')}.`
    if (queued && !applied) return `${head} They're waiting in your queued list.`
    if (pending && applied) return `${head} Activate the book from your portfolio list when ready.`
    return head
}

/**
 * Did any accepted change land in the QUEUE rather than at a broker?
 *
 * The queued list is loaded, not pushed: it is fetched on mount, on Axl's market-open card, and
 * after the user executes or cancels a row — never when something is added to it. So an accept off
 * hours told the user "they're waiting in your queued list" and pointed them at a list that had
 * been fetched before the rows existed, and stayed empty until the next page load.
 *
 * Reading the same bucket the message reads (`deferredItems`) keeps the toast and the refresh from
 * disagreeing: whenever the words say queued, the list is re-read. A queue write that FAILED is not
 * here — it reports as failed, and there is no row to go and look at.
 *
 * @param {object} result   the applyRebalance response
 */
export function queuedAnything(result) {
    return (result?.deferredItems?.length ?? 0) > 0
}
