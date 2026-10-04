// How each Floor desk can be sorted — the options per desk, and ONE comparator for all of them.
//
// Same split as the rest of the column: the MECHANISM is shared (nulls last whichever way you
// sort, strings by locale, numbers by value, a stable sort so ties keep the order the server sent),
// and each desk supplies only its JUDGMENT — which fields are worth sorting by and which way each
// one naturally runs ("newest" starts descending, a symbol starts A→Z).
//
// The first option of every desk is `default`: the order the list already arrives in (server
// order, soonest-first for the calendar, lifecycle for trades). It takes no direction — "reverse
// the order the server chose" is not a question anyone asks — so the arrow is disabled on it.
//
// Grouped desks keep their groups. A trade list sorted by symbol is still Waiting / In position /
// Closed, alphabetical inside each (groupByLifecycle preserves input order, so sorting the flat list
// is enough). The calendar keeps its days for the same reason — "by symbol" means within the day,
// not a list that forgets when anything happens — which is what `within` is for.

const toMs = (v) => {
    if (v == null || v === '') return null
    if (typeof v === 'number') return Number.isFinite(v) ? v : null
    const t = Date.parse(v)
    return Number.isFinite(t) ? t : null
}
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const str = (v) => (v == null || v === '' ? null : String(v))
const rank = (order) => (v) => { const i = order.indexOf(v); return i < 0 ? null : i }

const RATING_RANK = rank(['strong_buy', 'buy', 'hold', 'sell', 'strong_sell'])
const IMPACT_RANK = rank(['high', 'medium', 'low'])
const EARN_RANK   = rank(['bmo', 'dmh', 'amc'])

// `dir` is the direction an option STARTS in when picked; the arrow flips it from there.
const DEFAULT = { key: 'default', label: 'Default' }

export const DESK_SORTS = {
    queued: [
        DEFAULT,
        { key: 'symbol',  label: 'Symbol',      dir: 'asc',  value: r => str(r.asset) },
        { key: 'ready',   label: 'Ready first', dir: 'asc',  value: r => (r.ready !== false ? 0 : 1) },
        { key: 'decided', label: 'Decided',     dir: 'desc', value: r => toMs(r.decidedAt) },
    ],
    trade: [
        DEFAULT,
        { key: 'symbol',    label: 'Symbol',    dir: 'asc',  value: s => str(s.asset ?? s.symbol) },
        { key: 'newest',    label: 'Created',   dir: 'desc', value: s => toMs(s.savedAt) },
        { key: 'direction', label: 'Direction', dir: 'asc',  value: s => str(s.direction) },
    ],
    // Sorted inside PortfolioRows, on the reconstructed BOOKS (portfoliosFromIdeas) — a book is
    // not a record the column receives. P&L needs the positions, hence the ctx.
    portfolio: [
        DEFAULT,
        { key: 'name',     label: 'Name',     dir: 'asc',  value: b => str(b.name) },
        { key: 'holdings', label: 'Holdings', dir: 'desc', value: b => b.ideas.length },
        { key: 'pnl',      label: 'P&L',      dir: 'desc', value: (b, ctx) => num(ctx?.pnlOf?.(b)?.pnl) },
    ],
    scans: [
        DEFAULT,
        { key: 'thesis',     label: 'Thesis',     dir: 'asc',  value: s => str(s.thesis) },
        { key: 'candidates', label: 'Candidates', dir: 'desc', value: s => s.candidates?.length ?? 0 },
        { key: 'newest',     label: 'Saved',      dir: 'desc', value: s => toMs(s.savedAt) },
    ],
    coverage: [
        DEFAULT,
        { key: 'symbol',  label: 'Symbol',  dir: 'asc',  value: c => str(c.symbol) },
        { key: 'rating',  label: 'Rating',  dir: 'asc',  value: c => RATING_RANK(c.rating) },
        { key: 'upside',  label: 'Upside',  dir: 'desc', value: c => num(c.gap?.pct) },
        { key: 'status',  label: 'Status',  dir: 'asc',  value: c => str(c.status) },
        { key: 'updated', label: 'Updated', dir: 'desc', value: c => toMs(c.updated_at) },
    ],
    research_queue: [
        DEFAULT,
        { key: 'symbol', label: 'Symbol', dir: 'asc',  value: i => str(i.symbol) },
        { key: 'source', label: 'Source', dir: 'asc',  value: i => str(i.source) },
        { key: 'status', label: 'Status', dir: 'asc',  value: i => str(i.status) },
        { key: 'added',  label: 'Added',  dir: 'desc', value: i => toMs(i.created_at) },
    ],
    aether: [
        DEFAULT,
        { key: 'date',     label: 'Event date', dir: 'desc', value: r => toMs(r.event_date || r.created_at) },
        { key: 'names',    label: 'Names',      dir: 'desc', value: r => r.candidates?.length ?? 0 },
        { key: 'category', label: 'Kind',       dir: 'asc',  value: r => str(r.event_category) },
        { key: 'subject',  label: 'Subject',    dir: 'asc',  value: r => str(r.subject || r.event) },
    ],
    earnings: [
        DEFAULT,
        { key: 'symbol', label: 'Symbol', dir: 'asc', value: e => str(e.symbol), within: e => e.date },
        { key: 'timing', label: 'Timing', dir: 'asc', value: e => EARN_RANK(String(e.time || '').toLowerCase()), within: e => e.date },
    ],
    fed: [
        DEFAULT,
        { key: 'time',   label: 'Time',   dir: 'asc', value: e => str(e.time),          within: e => e.date },
        { key: 'impact', label: 'Impact', dir: 'asc', value: e => IMPACT_RANK(e.impact), within: e => e.date },
    ],
    ipo: [
        DEFAULT,
        { key: 'symbol', label: 'Symbol', dir: 'asc',  value: e => str(e.symbol), within: e => e.date },
        { key: 'price',  label: 'Price',  dir: 'desc', value: e => num(e.price),  within: e => e.date },
    ],
}

/** The option a stored sort points at, or null for default / unknown (a renamed key falls back). */
export function sortOption(deskKey, sort) {
    if (!sort?.key || sort.key === 'default') return null
    return DESK_SORTS[deskKey]?.find(o => o.key === sort.key) ?? null
}

function compare(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return a - b
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * Sort a desk's rows. Never mutates `rows`; on `default` (or an unknown key) returns them as given.
 *
 * Empty values sink to the bottom in BOTH directions — a row with no P&L is not "the worst P&L",
 * and flipping the arrow should not float every blank to the top.
 *
 * @param {object[]} rows
 * @param {string}   deskKey  a DESK_SORTS key
 * @param {{key:string, dir?:'asc'|'desc'}} [sort]
 * @param {object}   [ctx]    extra inputs a value needs (portfolio P&L)
 */
export function sortRows(rows = [], deskKey, sort, ctx) {
    const opt = sortOption(deskKey, sort)
    if (!opt || !Array.isArray(rows)) return rows
    const sign = (sort.dir ?? opt.dir) === 'desc' ? -1 : 1
    const keyed = rows.map((row, i) => ({ row, i, v: opt.value(row, ctx) }))
    keyed.sort((x, y) => {
        if (opt.within) {
            const w = compare(opt.within(x.row) ?? '', opt.within(y.row) ?? '')
            if (w) return w
        }
        const xn = x.v == null, yn = y.v == null
        if (xn || yn) return xn === yn ? x.i - y.i : (xn ? 1 : -1)
        return sign * compare(x.v, y.v) || x.i - y.i
    })
    return keyed.map(k => k.row)
}
