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
