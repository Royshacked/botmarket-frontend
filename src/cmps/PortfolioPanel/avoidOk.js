/**
 * Pythia rates an industry in this plan AVOID (backend step 7, services/industryLimits.service.js): the book is saved
 * only with the user's explicit OK, asked BEFORE anything is written or deleted — an Update replaces the book's ideas,
 * and a refusal after the delete would leave the book empty. The server checks the symbols itself; this is the ask.
 * The OK NAMES the symbols the user said yes to (code review 2026-10-11): a name turned AVOID after they were asked is
 * not covered by it. → the plan to save (carrying `avoid_ok: [symbols]`), or null when the user declined.
 * `confirm` is injectable for tests.
 */
export function confirmAvoid(plan, confirm = (msg) => window.confirm(msg)) {
    const avoid = plan?.limits?.avoid ?? []
    if (!avoid.length) return plan
    const what = avoid.map(a => `${a.asset} (${a.industry})`).join(', ')
    const ok = confirm(`Pythia rates the industry of ${what} AVOID — the house expects it to go wrong.\n\nSave the book with ${avoid.length === 1 ? 'it' : 'them'} anyway?`)
    return ok ? { ...plan, avoid_ok: avoid.map(a => a.asset) } : null
}

/**
 * The server refused a save for AVOID names the plan did not know about — a verdict turned after Atlas proposed it, or
 * the plan was sized while the verdicts could not be read (`409 avoid_needs_ok`, with the server's `avoid` list). Ask
 * about THOSE. → the plan to retry with, `null` when the user declined, or `undefined` when this was another error.
 */
export function avoidRetry(err, plan, confirm) {
    const data = err?.response?.data
    if (err?.response?.status !== 409 || data?.outcome !== 'avoid_needs_ok' || !Array.isArray(data.avoid)) return undefined
    const asked = confirmAvoid({ ...plan, limits: { ...(plan?.limits ?? {}), avoid: data.avoid } }, confirm)
    return asked ?? null
}

/**
 * The same ask on a review's Accept (and an edit's adds): the server marks each `add_item` in an AVOID industry
 * (`avoid: { industry }`) and drops any OK the model wrote, so only the user's yes HERE sets `item.avoid_ok`. A no
 * drops just those adds; the rest of the update still applies. → the update to send, or null when nothing is left.
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

/**
 * A rebalance came back with changes refused for an AVOID industry the card had not asked about (a verdict that turned
 * after the proposal — the server puts `avoid` on the refusal). Ask, and return only THOSE changes, marked with the
 * user's OK, to send again. → `{ retry, declined }`: `retry` null when there is nothing to retry.
 */
export function avoidRefusalRetry(update, failed, confirm = (msg) => window.confirm(msg)) {
    const refused = (failed ?? []).filter(f => f?.reason === 'avoid_industry' && Array.isArray(f.avoid) && f.avoid.length)
    if (!refused.length) return { retry: null, declined: false }
    const what = refused.flatMap(f => f.avoid).map(a => `${a.asset} (${a.industry})`).join(', ')
    if (!confirm(`Pythia now rates the industry of ${what} AVOID — the house expects it to go wrong.\n\nApply ${refused.length === 1 ? 'that change' : 'those changes'} anyway?`)) {
        return { retry: null, declined: true }
    }
    // A refused change is matched by its action and its holding (an add has no holding yet: its asset).
    const same = (f, c) => f.action === c.action && (f.itemId ? f.itemId === c.itemId : f.asset === c.item?.asset)
    const retry = (update?.changes ?? []).filter(c => refused.some(f => same(f, c)))
        .map(c => (c.action === 'add_item' ? { ...c, item: { ...c.item, avoid_ok: true } } : { ...c, avoid_ok: true }))
    return { retry: retry.length ? { ...update, changes: retry } : null, declined: false }
}
