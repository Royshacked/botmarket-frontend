// Pure shaping helpers for the Floor design trial. They live outside the component files so those
// export components only (react-refresh keeps fast-refresh working), and so the grouping rules can
// be tested without rendering anything — the same split tradeIdea.utils.js already uses.

import { summarizePositions, positionWorkspace } from '../TradeIdeas/tradeIdea.utils.js'

/**
 * Split positions into one group per account, first-seen order preserved, each with its summary.
 *
 * Keyed on broker + accountId, not accountId alone: two brokers can hand out the same account
 * number, and collapsing them would sum unrelated money into one row.
 *
 * @param {object[]} positions
 * @returns {Array<{key:string,accountNo:string,broker:string|null,workspace:string,positions:object[],summary:object}>}
 */
export function positionsByAccount(positions = []) {
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
            })
        }
        m.get(key).positions.push(p)
    }
    return [...m.values()].map(g => ({ ...g, summary: summarizePositions(g.positions) }))
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
 * They are the same desk's work in two methods — a Kairos call and a Mentor setup both end in one
 * directional order in one name — so they interleave rather than living in separate tabs. `kind` is
 * what the row shows and what routes the click to the right pop-out.
 *
 * `status` is carried straight through so the shared groupByLifecycle() can bucket both kinds
 * without knowing which is which.
 *
 * @param {object[]} calls
 * @param {object[]} setups
 * @returns {Array<{kind:'call'|'setup',entity:object,id:string,ticker:string,direction:string,status:string}>}
 */
export function tradeFloorItems(calls = [], setups = []) {
    return [
        ...calls.map(c  => ({ kind: 'call',  entity: c, id: c.id, ticker: c.asset ?? c.symbol, direction: c.direction, status: c.status })),
        ...setups.map(s => ({ kind: 'setup', entity: s, id: s.id, ticker: s.asset ?? s.symbol, direction: s.direction, status: s.status })),
    ]
}
