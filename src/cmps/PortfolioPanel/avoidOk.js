/**
 * Pythia rates an industry in this plan AVOID (backend step 7, services/industryLimits.service.js): the book is saved
 * only with the user's explicit OK, asked BEFORE anything is written or deleted — an Update replaces the book's ideas,
 * and a refusal after the delete would leave the book empty. The server checks the symbols itself; this is the ask.
 * → the plan to save (carrying `avoid_ok`), or null when the user declined. `confirm` is injectable for tests.
 */
export function confirmAvoid(plan, confirm = (msg) => window.confirm(msg)) {
    const avoid = plan?.limits?.avoid ?? []
    if (!avoid.length) return plan
    const what = avoid.map(a => `${a.asset} (${a.industry})`).join(', ')
    const ok = confirm(`Pythia rates the industry of ${what} AVOID — the house expects it to go wrong.\n\nSave the book with ${avoid.length === 1 ? 'it' : 'them'} anyway?`)
    return ok ? { ...plan, avoid_ok: true } : null
}

/**
 * The same ask on a review's Accept: the server marks each `add_item` in an AVOID industry (`avoid: { industry }`)
 * and drops any OK the model wrote, so only the user's yes HERE sets `item.avoid_ok`. A no drops just those adds;
 * the rest of the update still applies. → the update to send, or null when nothing is left to apply.
 */
export function confirmAvoidAdds(update, confirm = (msg) => window.confirm(msg)) {
    const changes = update?.changes ?? []
    const flagged = changes.filter(c => c?.action === 'add_item' && c.avoid)
    if (!flagged.length) return update
    const what = flagged.map(c => `${c.item?.asset} (${c.avoid.industry})`).join(', ')
    const ok = confirm(`Pythia rates the industry of ${what} AVOID — the house expects it to go wrong.\n\nAdd ${flagged.length === 1 ? 'it' : 'them'} anyway? (Cancel applies the other changes without ${flagged.length === 1 ? 'it' : 'them'}.)`)
    const next = ok
        ? changes.map(c => (flagged.includes(c) ? { ...c, item: { ...c.item, avoid_ok: true } } : c))
        : changes.filter(c => !flagged.includes(c))
    return next.length ? { ...update, changes: next } : null
}
