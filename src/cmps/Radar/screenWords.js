// Pythia's weekly industry screen in words (backend docs/design/industry-screener.md §4-§5). Pure.
//
// The backend computes the verdict — the bucket, whether to trade, the horizon — from the engine's
// numbers and Pythia's catalyst score. These helpers only say it: the regime line, a row's key reason,
// and the change since last week.

export const BUCKET_ORDER = ['swing_long', 'extended', 'swing_only', 'long_watch', 'avoid']

/** Short trade verdict and horizon chips. */
export const TRADE_LABEL = { yes: 'Trade', wait: 'Wait', no: 'No' }
export const HORIZON_LABEL = { swing_and_long: 'swing + long term', swing: 'swing', long: 'long term' }

/** The section heading for each bucket (the board text from the doc's §4 table). */
export const BUCKET_HEADING = {
    swing_long: 'Good now — swing and long term',
    extended:   'Good, but extended — wait for a pullback',
    swing_only: 'Good now for swing only',
    long_watch: 'Good for long term — not the moment yet',
    avoid:      'Not good now',
}

const pct = (v, d = 1) => (typeof v === 'number' ? `${(v * 100).toFixed(d)}%` : '—')

/** The market regime in one line, from the screen's `regime` document. */
export function regimeLine(regime) {
    if (!regime?.regime) return null
    const word = { green: 'Green', yellow: 'Yellow', red: 'Red' }[regime.regime] ?? regime.regime
    const parts = [
        `S&P 500 ${pct(regime.below_high)} below its 52-week high`,
        `${regime.above_ma200 ? 'above' : 'below'} its 200-day average${regime.ma200_rising ? ', which is rising' : ', which is falling'}`,
        `volatility ${regime.vol_elevated ? 'elevated' : 'normal'}`,
    ]
    const size = { green: 'full-size trading', yellow: 'reduced size', red: 'swing at minimum size or not at all' }[regime.regime]
    return { word, regime: regime.regime, text: `${parts.join(' · ')}${size ? ` — ${size}` : ''}` }
}

/**
 * The one-line reason a row sits where it does: its two scores, and the catalyst when there is a dated
 * one. Never a forecast.
 */
export function keyReason(row) {
    if (!row?.bucket) return Object.values(row?.na ?? {})[0] ?? 'Not scored this week'
    const parts = [`Quality ${row.quality}/10`, `Timing ${row.timing}/12`]
    if (row.q11 === 2 && row.event_date) parts.push(`catalyst ${row.event_date}`)
    if (row.red_downgrade) parts.push('downgraded: red market')
    if (row.scores?.q9 === 0) parts.push('extended')
    if (row.scores?.q12 === 'crowded') parts.push('crowded')
    return parts.join(' · ')
}

/** Rows grouped by bucket in board order; an unscored industry goes last. */
export function groupByBucket(rows = []) {
    const out = new Map(BUCKET_ORDER.map(b => [b, []]))
    out.set(null, [])
    for (const r of rows) (out.get(r.bucket ?? null) ?? out.get(null)).push(r)
    return [...out.entries()].filter(([, list]) => list.length)
}

/** What changed since the previous screen, for the summary bar. */
export function changesSince(screen) {
    const moved = (screen?.rows ?? []).filter(r => r.changed)
    return { count: moved.length, since: screen?.previous_asof ?? null }
}
