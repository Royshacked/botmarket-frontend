// The rules Atlas's surface draws by — pure, so each is tested on its own (unified-chat plan phase 8c). Moved from
// PortfolioPanel with their reasons; the panel is gone, the rules are the same.

import { planAccountRebind, isPostOrderStatus } from '../TradeIdeas/tradeIdea.utils.js'
import { reviewApplyMessage } from '../PortfolioPanel/reviewApply.js'

// The canned turn the "Review" button sends to start Atlas's review pass. Atlas then confirms "hold as-is" or
// proposes changes the user accepts or dismisses.
export const REVIEW_REQUEST = 'Run my scheduled portfolio review now: assess performance and each holding against our thesis and mandate, then either confirm we hold as-is or propose specific changes (rebalance, trim, add, exit, or swap).'

// Turns the empty surface offers — the user's words, sent to Atlas.
export const OPENINGS = [
    'Build me a long-term growth portfolio',
    'I want a dividend income portfolio',
]
export const ADOPT_OPENING = 'I already hold a portfolio at my bank — I want you to manage it.'

/** The holdings a book's ideas carry — its legs are ideas with its portfolioId. */
export const bookIdeas = (ideas, portfolioId) =>
    portfolioId ? (Array.isArray(ideas) ? ideas : []).filter(i => i?.portfolioId === portfolioId) : []

/**
 * What the build summary lists: the plan on the table when there is one (authoritative — assets, sizes, name), else
 * the book being edited as it stands. `{ name, items: [{ asset, quantity }] }`.
 */
export function buildSummary(plan, book = []) {
    if (plan?.ideas?.length) {
        return { name: plan.name ?? null, items: plan.ideas.map(i => ({ asset: i.asset, quantity: i.quantity ?? null })) }
    }
    return { name: book[0]?.portfolioName ?? null, items: book.map(i => ({ asset: i.asset, quantity: i.quantity ?? null })) }
}

/**
 * Can this plan be saved? Every holding needs a share count, and the counts come from a size: no size → Atlas must
 * ask for one; a size with no counts → the prices could not be fetched. `{ ready, hasSize }`.
 */
export function planStatus(plan) {
    if (!plan) return { ready: false, hasSize: false }
    const ideas = plan.ideas ?? []
    return {
        ready:   ideas.length > 0 && ideas.every(i => Number(i.quantity) > 0),
        hasSize: Number(plan.positionSize) > 0,
    }
}

/**
 * An edit with no new plan still has something to save when the marked accounts differ from the ones the book's
 * re-pointable legs carry (Update pushes them — planAccountRebind decides which legs may take them).
 */
export function accountsMoved(book, accountIds, mainAccountId = null) {
    const rebind = planAccountRebind(book, accountIds, mainAccountId)
    if (!rebind) return false
    const same = (a, b) => a.length === b.length && a.every(x => b.includes(x))
    return rebind.targets.some(i => !same(Array.isArray(i.accounts) ? i.accounts : [], rebind.accounts)
        || (i.mainAccountId ?? null) !== rebind.mainAccountId)
}

/** A book with nothing placed yet — an accepted change there edits the plan, and the book still needs activating. */
export const bookPending = (book) => !book.some(i => isPostOrderStatus(i.status))

/**
 * The AVOID ask (backend step 7). The server refused with the names; the user is asked about THOSE. On a proposal a
 * no applies the rest without them (`dropAvoid`); on a book a no saves nothing.
 */
export function avoidQuestion(avoid, { proposal = false } = {}) {
    const what = (avoid ?? []).map(a => (a.industry ? `${a.asset} (${a.industry})` : a.asset)).join(', ')
    const them = avoid?.length === 1 ? 'it' : 'them'
    return proposal
        ? `Pythia rates the industry of ${what} AVOID — the house expects it to go wrong.\n\nApply ${them} anyway? (Cancel applies the other changes without ${them}.)`
        : `Pythia rates the industry of ${what} AVOID — the house expects it to go wrong.\n\nSave the book with ${them} anyway?`
}

/** "Technology (growth) and Energy sleeves" — the sleeves Atlas sent to be sourced this turn. */
export function sleeveLine(requests) {
    const names = (requests ?? []).filter(r => r?.sector).map(r => `${r.sector}${r.lens ? ` (${r.lens})` : ''}`)
    if (!names.length) return null
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
    return `${list} ${names.length === 1 ? 'sleeve' : 'sleeves'} sent to Argus and Prometheus — a card brings you back to the build once the research is in.`
}

const when = (ms) => (Number.isFinite(ms) ? new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' }) : null)
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/**
 * What a press did, in words — never more than the result says (reviewApply's rule).
 * @param {string} action  the press
 * @param {object} result  its result ({ portfolio, failed, left, rebound, rebalance, held, nextReviewAt })
 * @param {{ name?: string|null, pending?: boolean }} [ctx]
 */
export function pressReport(action, result = {}, { name = null, pending = false } = {}) {
    const book = name ? `${name}` : 'The book'
    if (action === 'generate') {
        const saved = result.portfolio?.ideas?.length ?? 0
        const failed = result.failed?.length ?? 0
        return `${book} is saved — ${plural(saved, 'holding', 'holdings')}${failed ? `, ${failed} could not be` : ''}. Activate it from your portfolio list when ready.`
    }
    if (action === 'update') {
        const left = result.left ?? []
        if (left.length) return `The new plan is saved, but ${plural(left.length, 'old holding', 'old holdings')} could not be removed (${left.map(i => i.asset ?? i.id).join(', ')}) — remove ${left.length === 1 ? 'it' : 'them'} by hand.`
        if (result.rebound === 0) return 'Nothing to change — the holdings already carry those accounts, or have orders placed.'
        if (result.rebound != null) return `${book} is updated — the marked accounts are on ${plural(result.rebound, 'holding', 'holdings')}.`
        return `${book} is updated.`
    }
    if (action === 'accept') {
        if (result.held) return `Reviewed — holding as is.${when(result.nextReviewAt) ? ` Next review ${when(result.nextReviewAt)}.` : ''}`
        return reviewApplyMessage(result.rebalance, { pending })
    }
    if (action === 'dismiss') return `Review dismissed.${when(result.nextReviewAt) ? ` Next review ${when(result.nextReviewAt)}.` : ''}`
    return null
}

/** A refusal in words: the server's, with the per-change reasons it sends back, or how many positions are live. */
export function refusalText(out) {
    const failed = out?.extra?.failed
    const reasons = Array.isArray(failed) ? [...new Set(failed.map(f => f?.reason).filter(Boolean))] : []
    const live = Number.isInteger(out?.extra?.live) && out.extra.live > 0 ? ` (${plural(out.extra.live, 'position', 'positions')} live)` : ''
    return `${out?.message ?? 'That did not go through'}${reasons.length ? ` (${reasons.join(', ')})` : ''}${live}`
}

/**
 * One proposed change, in words — what Accept will do (moved from MainPage's rebalance dialog). A holding is a
 * portfolio_item, so the vocabulary is `_item`. `assetOf(itemId)` names a held line.
 */
export function describeChange(change, assetOf = (id) => id ?? '—') {
    const pct  = (n) => `${Math.round((Number(n) || 0) * 100)}%`
    const id   = change?.itemId
    const spec = change?.item
    const target = change?.targetAllocationRatio != null ? ` → target ${pct(change.targetAllocationRatio)}` : ''
    switch (change?.action) {
        case 'exit_item':   return `Exit ${assetOf(id)}${change.reason ? ` — ${change.reason}` : ''}`
        case 'trim_item':   return `Trim ${assetOf(id)} by ${pct(change.reduceFraction)}${target}`
        case 'add_to_item': return `Add to ${assetOf(id)}: +${pct(change.addFraction)}${target}`
        case 'add_item':    return `Add ${spec?.asset ?? '?'} (${spec?.direction ?? 'long'}${spec?.allocationRatio != null ? `, target ${pct(spec.allocationRatio)}` : ''})${change.avoid ? ` — Pythia rates ${change.avoid.industry} AVOID` : ''}`
        case 'update_item': return `Update ${assetOf(id)}: ${Object.keys(change.patch ?? {}).join(', ') || 'fields'}`
        case 'remove_item': return `Remove ${assetOf(id)} (pending)`
        default:            return String(change?.action ?? 'change')
    }
}
