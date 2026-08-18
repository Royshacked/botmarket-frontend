// Pure shaping helpers for the Floor design trial. They live outside the component files so those
// export components only (react-refresh keeps fast-refresh working), and so the grouping rules can
// be tested without rendering anything — the same split tradeIdea.utils.js already uses.

import { summarizePositions, positionWorkspace, positionOwnerIdea, foldHoldingLegs } from '../TradeIdeas/tradeIdea.utils.js'

/**
 * Split positions into one group per account, first-seen order preserved, each with its summary —
 * and inside each account, split again into the PORTFOLIOS holding them plus the standalone rest.
 *
 * Keyed on broker + accountId, not accountId alone: two brokers can hand out the same account
 * number, and collapsing them would sum unrelated money into one row.
 *
 * The portfolio tier sits UNDER the account rather than above it because a book can span accounts:
 * the money lives in an account, so that stays the outer fact, and a book that spans two accounts
 * shows up as a row in each — carrying only the legs that account actually holds. `books` are
 * summarised the same way accounts are, so the middle row reads like the one above it.
 *
 * A position joins a book through its owning idea's `portfolioId` (positionOwnerIdea → the shared
 * brokerOrders join). With no `ideas` passed — or for an orphan broker position whose idea is gone —
 * every position lands in `loose` and the account renders exactly as it did before this tier existed.
 *
 * BOTH leg lists come with a folded twin — `rows` on a book, `looseRows` on the account — one entry
 * per HOLDING rather than per broker position (see foldHoldingLegs). A holding can stand behind
 * several positions: a scale-in on a hedging venue opens a sibling rather than growing the original,
 * so the book listed the same ticker twice, at two prices, neither of them what the user owns. The
 * raw `positions` / `loose` arrays stay exactly as they were, because summaries and the book's
 * close-all act on real legs.
 *
 * @param {object[]} positions
 * @param {object[]} [ideas]  loaded ideas; the position→portfolio link
 * @returns {Array<{key:string,accountNo:string,broker:string|null,workspace:string,positions:object[],books:Array<{key:string,portfolioId:string,name:string,positions:object[],rows:object[],summary:object}>,loose:object[],looseRows:object[],summary:object}>}
 */
export function positionsByAccount(positions = [], ideas = []) {
    const m = new Map()
    for (const p of positions) {
        const key = `${p.broker ?? '—'}:${p.accountId ?? '—'}`
        if (!m.has(key)) {
            m.set(key, {
                key,
                accountNo: p.accountNo ?? p.accountId ?? '—',
                broker:    p.broker ?? null,
                workspace: positionWorkspace(p),
                positions: [],
                books:     new Map(),
                loose:     [],
            })
        }
        const g = m.get(key)
        g.positions.push(p)

        const idea = positionOwnerIdea(p, ideas)
        const pfId = idea?.portfolioId
        if (!pfId) { g.loose.push(p); continue }
        if (!g.books.has(pfId)) {
            g.books.set(pfId, {
                // Account-scoped: the same book in two accounts is two rows, so one expand must not
                // open the other.
                key:         `${key}:${pfId}`,
                portfolioId: pfId,
                name:        idea.portfolioName || 'Portfolio',
                positions:   [],
            })
        }
        g.books.get(pfId).positions.push(p)
    }
    return [...m.values()].map(g => ({
        ...g,
        books: [...g.books.values()].map(b => ({
            ...b,
            rows:    foldHoldingLegs(b.positions, ideas),
            summary: summarizePositions(b.positions),
        })),
        looseRows: foldHoldingLegs(g.loose, ideas),
        summary:   summarizePositions(g.positions),
    }))
}

/**
 * Group already-sorted calendar items by their `date`, preserving order. The feeds arrive
 * soonest-first, so consecutive same-date items land in one group without a sort.
 *
 * @param {Array<{date:string}>} items
 * @returns {Array<{date:string,items:object[]}>}
 */
export function groupByDay(items = []) {
    const out = []
    for (const it of items) {
        const last = out[out.length - 1]
        if (last && last.date === it.date) last.items.push(it)
        else out.push({ date: it.date, items: [it] })
    }
    return out
}

/**
 * Calls and setups on one list.
 *
 * A Mentor setup ends in one
 * directional order in one name — so they interleave rather than living in separate tabs. `kind` is
 * what the row shows and what routes the click to the right pop-out.
 *
 * `status` is carried straight through so the shared groupByLifecycle() can bucket both kinds
 * without knowing which is which.
 *
 * @param {object[]} setups
 * @returns {Array<{kind:'setup',entity:object,id:string,ticker:string,direction:string,status:string}>}
 */
// `calls` was the first argument until Kairos was archived (2026-08-18). The row shape keeps its
// `kind` field rather than being flattened away — a second trade kind is the expected case here,
// and the Floor already renders from it.
export function tradeFloorItems(setups = []) {
    return [
        ...setups.map(s => ({ kind: 'setup', entity: s, id: s.id, ticker: s.asset ?? s.symbol, direction: s.direction, status: s.status })),
    ]
}
