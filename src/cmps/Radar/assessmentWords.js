// The words of Pythia's assessment board (backend docs/design/pythia-assessment.md). Pure.
//
// An assessment is a JUDGMENT, not a forecast: is the industry worth the other desks' attention — to trade,
// to invest in, to watch, or to avoid. The board says it in those words, with how far the price has gone,
// what caused the move, and the track record of every verdict graded against SPY.

export const VERDICT_ORDER = ['interesting_trade', 'interesting_invest', 'watch', 'avoid']
export const VERDICT_LABEL = {
    interesting_trade:  'Interesting to trade',
    interesting_invest: 'Interesting to invest',
    watch:              'Watch',
    avoid:              'Avoid',
}
export const INPUT_LABEL = { news: 'News', price: 'Price', money: 'Money', regime: 'Regime', geopolitics: 'Geopolitics' }
export const CAUSE_WORD = {
    news:        'news or an event',
    money:       'money arriving',
    regime:      'the macro backdrop',
    geopolitics: 'geopolitics',
    none:        'nothing nameable — the hype pattern',
    unverified:  'not verified — the research could not be done',
}

const signed = (v, d = 0) => (typeof v === 'number' ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(d)}%` : '—')

/** 1st, 2nd, 3rd, 11th, 21st. */
export function ordinal(n) {
    const t = n % 100
    if (t >= 11 && t <= 13) return `${n}th`
    return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`
}

/** How far it has moved, in one line: "24m +188% vs SPY +40% · stretched: 64th percentile". */
export function movedLine(moved) {
    if (!moved) return null
    const parts = []
    if (moved.ret_24m != null) parts.push(`24m ${signed(moved.ret_24m)} vs SPY ${signed(moved.spy_24m)}`)
    else if (moved.ret_12m != null) parts.push(`12m ${signed(moved.ret_12m)} vs SPY ${signed(moved.spy_12m)}`)
    if (moved.ext_percentile != null) parts.push(`stretched: ${ordinal(Math.round(moved.ext_percentile * 100))} percentile`)
    return parts.join(' · ') || null
}

/** Assessments by verdict, best first, filtered by a search. → [[verdict, rows]] with only non-empty groups. */
export function groupByVerdict(rows, query = '') {
    const q = query.trim().toLowerCase()
    const groups = new Map(VERDICT_ORDER.map(v => [v, []]))
    for (const r of rows ?? []) {
        const s = r.subject ?? {}
        if (q && !`${s.name ?? ''} ${s.sector ?? ''}`.toLowerCase().includes(q)) continue
        if (groups.has(r.verdict)) groups.get(r.verdict).push(r)
    }
    return [...groups.entries()].filter(([, list]) => list.length)
}

/**
 * The track record in plain words. → `{ headline, lines }`: one line per verdict with grades, "right"
 * meaning the basket beat SPY (lagged it, for avoid). Before any grade, says when the first one comes.
 */
export function recordWords(record) {
    const total = record?.total ?? 0
    if (!total) return { headline: 'No calls yet — every published verdict is logged and graded against SPY at 3 and 12 months.', lines: [] }
    const lines = []
    for (const v of VERDICT_ORDER) {
        const byH = record.by_verdict?.[v]
        if (!byH) continue
        for (const h of ['3m', '12m']) {
            const s = byH[h]
            if (!s) continue
            const right = s.right == null ? '' : `, right ${Math.round(s.right * 100)}%`
            lines.push(`${VERDICT_LABEL[v]} at ${h}: ${s.n} graded${right}, basket vs SPY ${signed(s.avg_vs_spy, 1)} on average`)
        }
    }
    const headline = `${total} call${total === 1 ? '' : 's'} logged, ${record.open ?? 0} still open`
        + (lines.length ? '' : ' — the first grades come three months after a call.')
    return { headline, lines }
}

/** Is it stale? An assessment past its expiry is shown as due for reassessment. */
export function isExpired(row, now = Date.now()) {
    return Boolean(row?.expires_at) && Date.parse(row.expires_at) < now
}
