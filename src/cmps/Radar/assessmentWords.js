// The words of Pythia's assessment board (backend docs/design/pythia-assessment.md). Pure.
//
// An assessment is a JUDGMENT, not a forecast: is the industry worth the other desks' attention — to trade,
// to invest in, to watch, or to avoid. The board says it in those words, with how far the price has gone,
// what caused the move, and the track record of every verdict graded against SPY.

// The verdict names the book (Roy, 2026-10-11; interesting_trade / interesting_invest before).
// No case last: quiet industries, kept on the board but below every verdict that asks for attention.
export const VERDICT_ORDER = ['swing', 'long_term', 'watch', 'avoid', 'no_case']
const LEGACY_VERDICT = { interesting_trade: 'swing', interesting_invest: 'long_term' }
/** A verdict as today's word — an assessment or a week written before 2026-10-11 still says the old one. */
export const verdictKey = (v) => LEGACY_VERDICT[v] ?? v
const LABEL = { swing: 'For swing', long_term: 'For long term', watch: 'Watch', avoid: 'Avoid', no_case: 'No case' }
export const VERDICT_LABEL = { ...LABEL, interesting_trade: LABEL.swing, interesting_invest: LABEL.long_term }
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
export function movedLine(moved, name = null) {
    if (!moved) return null
    // A theme's move is its direct links' (step 3).
    if (moved.kind === 'theme') {
        const direct = (moved.links ?? []).filter(l => l.order === 1).map(l => `${l.name} ${linkMoveLine(l) ?? 'n/a'}`)
        return direct.length ? `direct links: ${direct.join('; ')}` : null
    }
    const parts = []
    if (moved.ret_24m != null) parts.push(`24m ${signed(moved.ret_24m)} vs SPY ${signed(moved.spy_24m)}`)
    else if (moved.ret_12m != null) parts.push(`12m ${signed(moved.ret_12m)} vs SPY ${signed(moved.spy_12m)}`)
    // By size: what the hype flag reads (2026-10-11); the equal-weight line can be a few small names.
    if (moved.ret_24m != null && moved.ret_24m_vw != null) parts.push(`by size ${signed(moved.ret_24m_vw)}`)
    if (moved.ext_percentile != null) parts.push(`stretched: ${ordinal(Math.round(moved.ext_percentile * 100))} percentile`)
    // Priced on its parent's basket, which its siblings share — the move is the parent's, not its own.
    if (parts.length && moved.basket && name && moved.basket !== name) parts.push(`measured as ${moved.basket}`)
    return parts.join(' · ') || null
}

/** Assessments by verdict, best first, filtered by a search. → [[verdict, rows]] with only non-empty groups. */
export function groupByVerdict(rows, query = '') {
    const q = query.trim().toLowerCase()
    const groups = new Map(VERDICT_ORDER.map(v => [v, []]))
    for (const r of rows ?? []) {
        const s = r.subject ?? {}
        if (q && !`${s.name ?? ''} ${s.sector ?? ''}`.toLowerCase().includes(q)) continue
        if (groups.has(verdictKey(r.verdict))) groups.get(verdictKey(r.verdict)).push(r)
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
    // Every verdict the record holds, in board order — a call logged under the words before 2026-10-11 still
    // counts, under its new label, until the migration renames it.
    const rank = (v) => { const i = VERDICT_ORDER.indexOf(verdictKey(v)); return i < 0 ? VERDICT_ORDER.length : i }
    for (const v of Object.keys(record.by_verdict ?? {}).sort((a, b) => rank(a) - rank(b))) {
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

/**
 * Where the industry's companies put their money, in one line (facts from the engine, backend
 * industryData.moneyFacts): "Capex +50% (a year earlier +10%; 71% of companies raised it) · buybacks −17% ·
 * share count −1.2%". Null without money facts.
 */
export function moneyLine(money) {
    if (!money || money.capex_change == null) return null
    const parts = [`Capex ${signed(money.capex_change)}`
        + (money.capex_prev_change != null || money.capex_share_up != null
            ? ` (${[money.capex_prev_change != null ? `a year earlier ${signed(money.capex_prev_change)}` : null,
                money.capex_share_up != null ? `${Math.round(money.capex_share_up * 100)}% of companies raised it` : null].filter(Boolean).join('; ')})`
            : '')]
    if (money.buybacks_change != null) parts.push(`buybacks ${signed(money.buybacks_change)}`)
    if (money.acquisitions_change != null) parts.push(`acquisitions ${signed(money.acquisitions_change)}`)
    if (money.share_count_median_change != null) parts.push(`share count ${signed(money.share_count_median_change, 1)}`)
    return parts.join(' · ')
}

// ── the rest of the money: insiders, funds, government (backend step 8, pythia-money-flows.md) ──────────
// One line each, or null. Each carries its own reading, because each is easy to over-read: the insider cluster had
// no tested edge, funds' ownership is crowding not a lead, and contract dollars are a line's money, not revenue.

const usd = (v) => (typeof v === 'number' ? (Math.abs(v) >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(1)}M`) : '—')

export function flowLines(flows) {
    const i = flows?.insiders, f = flows?.funds, g = flows?.government
    return {
        insiders: i ? `${i.companies_buying} of ${i.n_companies} companies bought in 90 days`
            + (typeof i.vs_universe === 'number' ? ` (${i.vs_universe.toFixed(1)}× the market's rate)` : '')
            + `, ${usd(i.value)}${i.cluster ? ' — a cluster, awareness only: no tested edge' : ''}` : null,
        funds: f && f.share != null ? `${Math.round(f.share * 100)}% held by funds`
            + (typeof f.relative_share === 'number' ? ` (${f.relative_share.toFixed(2)}× the market)` : '')
            + (typeof f.percentile === 'number' && f.history_quarters ? `, ${Math.round(f.percentile * 100)}th percentile of ${f.history_quarters} quarters` : '')
            + (typeof f.flow_vs_universe === 'number' ? `; last quarter ${signed(f.flow_vs_universe, 1)} vs the market` : '')
            + ` — crowding, as of ${f.quarter}` : null,
        government: g && g.change != null ? `Contract money on its lines ${signed(g.change)} over a year (${usd(g.now)}; a year earlier ${signed(g.prev_change)}), to ${g.through}` : null,
    }
}

// ── themes (backend theme.service; pythia-assessment.md §3) ───────────────────

export const ORDER_LABEL = { 1: 'direct', 2: 'suppliers', 3: "suppliers' suppliers" }

/** A theme's links grouped by order, direct first → [[order, links]]. */
export function groupByOrder(links) {
    const out = new Map()
    for (const l of [...(links ?? [])].sort((a, b) => a.order - b.order)) {
        if (!out.has(l.order)) out.set(l.order, [])
        out.get(l.order).push(l)
    }
    return [...out.entries()]
}

/** One link's move, in words: "24m +200% over SPY · stretched: 90th percentile · hype". */
export function linkMoveLine(l) {
    if (!l) return null
    const parts = []
    if (l.excess_24m != null) parts.push(`24m ${signed(l.excess_24m)} over SPY`)
    else if (l.excess_12m != null) parts.push(`12m ${signed(l.excess_12m)} over SPY`)
    // By size — what the link's hype chip reads (code review 2026-10-11).
    if (l.excess_24m_vw != null) parts.push(`by size ${signed(l.excess_24m_vw)}`)
    if (l.ext_percentile != null) parts.push(`stretched: ${ordinal(Math.round(l.ext_percentile * 100))} percentile`)
    if (l.hype) parts.push('hype')
    return parts.join(' · ') || null
}

// ─── the week (backend pythia-assessment.md §8: the change scan and its assessments) ───

/** The market regime's word for the week line. */
export const REGIME_WORD = { green: 'Green', yellow: 'Yellow', red: 'Red' }

/**
 * The week in one line: "Week of the 2026-10-09 run: 163 industries and 2 themes scanned · 12 flagged · 10
 * assessed · 2 wait for next week". Null without a week; "running" while the server works on it.
 */
export function weekHeadline(week) {
    if (!week) return null
    const s = week.scanned ?? {}
    const n = (k) => s[k] ?? 0
    const scanned = `${n('industries')} industr${n('industries') === 1 ? 'y' : 'ies'}${n('themes') ? ` and ${n('themes')} theme${n('themes') === 1 ? '' : 's'}` : ''} scanned`
    const parts = [scanned, `${week.flagged?.length ?? 0} flagged`, `${week.results?.length ?? 0} assessed`]
    if (week.waiting_count) parts.push(`${week.waiting_count} wait for next week`)
    if (week.held_back?.length) parts.push(`${week.held_back.length} held back after two refusals`)
    const head = week.asof ? `Week of the ${week.asof} run` : 'This week'
    const state = { running: ' (running)', interrupted: ' (interrupted)', paused: ' (paused)' }[week.status] ?? ''
    return `${head}${state}: ${parts.join(' · ')}`
}

/** One assessed subject of the week, in words: "Semiconductors — Watch (was Avoid) · the hype flag turned on". */
export function weekResultLine(r, reasonText = {}) {
    if (!r) return null
    const verdict = r.verdict ? VERDICT_LABEL[r.verdict] ?? r.verdict : r.outcome === 'published' ? '—' : `not published (${r.outcome})`
    const was = r.previous_verdict && r.verdict && verdictKey(r.previous_verdict) !== verdictKey(r.verdict) ? ` (was ${VERDICT_LABEL[r.previous_verdict] ?? r.previous_verdict})` : ''
    const why = (r.reasons ?? []).map(k => reasonText[k] ?? k).join(', ')
    return `${r.name} — ${verdict}${was}${why ? ` · ${why}` : ''}`
}
