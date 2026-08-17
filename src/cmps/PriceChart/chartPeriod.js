// Bar-period math for the price chart: what a timeframe spelling MEANS, and whether a given bar's
// period is still running. Pure, and in its own module so the chart component exports only the
// component (fast refresh) — and so the rules can be tested without mounting a chart.

// interval spelling -> klinecharts Period { type, span }. Covers app words, the old TV codes
// (M = month, D = day), and legacy daily/weekly/monthly — the same set the backend accepts.
const PERIOD_MAP = {
    '1min': { type: 'minute', span: 1 },  '1m': { type: 'minute', span: 1 },  '1':  { type: 'minute', span: 1 },
    '5min': { type: 'minute', span: 5 },  '5m': { type: 'minute', span: 5 },  '5':  { type: 'minute', span: 5 },
    '15min':{ type: 'minute', span: 15 }, '15m':{ type: 'minute', span: 15 }, '15': { type: 'minute', span: 15 },
    '30min':{ type: 'minute', span: 30 }, '30m':{ type: 'minute', span: 30 }, '30': { type: 'minute', span: 30 },
    '1hr':  { type: 'hour', span: 1 }, '1h': { type: 'hour', span: 1 }, '1hour': { type: 'hour', span: 1 }, '60':  { type: 'hour', span: 1 },
    '2hr':  { type: 'hour', span: 2 }, '2h': { type: 'hour', span: 2 }, '2hour': { type: 'hour', span: 2 }, '120': { type: 'hour', span: 2 },
    '4hr':  { type: 'hour', span: 4 }, '4h': { type: 'hour', span: 4 }, '4hour': { type: 'hour', span: 4 }, '240': { type: 'hour', span: 4 },
    'day':  { type: 'day', span: 1 }, '1d': { type: 'day', span: 1 }, 'daily':  { type: 'day', span: 1 }, 'd': { type: 'day', span: 1 },
    'week': { type: 'week', span: 1 }, '1w': { type: 'week', span: 1 }, 'weekly': { type: 'week', span: 1 }, 'w': { type: 'week', span: 1 },
    'month':{ type: 'month', span: 1 }, '1mo': { type: 'month', span: 1 }, 'monthly': { type: 'month', span: 1 }, 'm': { type: 'month', span: 1 },
}

export function toPeriod(interval) {
    return PERIOD_MAP[String(interval ?? '').trim().toLowerCase()] ?? { type: 'day', span: 1 }
}

const PERIOD_MS = { minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000, month: 31 * 86_400_000 }

/**
 * Is this bar's period still running? The guard on the chart's live-price patch.
 *
 * A bar whose period has ENDED is a closed candle, and painting the current price onto it does not
 * make the chart live — it falsifies a settled bar. That is not hypothetical: FMP's EOD feed
 * publishes the running day late, so EARLY IN A SESSION the daily series still ended on the
 * previous day and Friday's candle rendered with Monday's price. The backend now builds today's bar
 * (candleFetch.buildFormingBar), so the patch lands correctly by construction; this stays as the
 * guard, because "the last bar is the current one" is an assumption about a FEED, and the next feed
 * to break it should cost a missed tick rather than a rewritten candle.
 *
 * Deliberately generous — a month is treated as 31 days and DST makes a day 23 or 25 hours. It is
 * sized to catch a whole-period mismatch (Friday vs Monday), and a guard that refuses a legitimate
 * patch is the worse failure: the chart would silently stop ticking.
 */
export function isCurrentPeriod(bar, interval, now = Date.now()) {
    if (!bar || !Number.isFinite(bar.timestamp)) return false
    const { type, span } = toPeriod(interval)
    return bar.timestamp + (PERIOD_MS[type] ?? PERIOD_MS.day) * (span || 1) > now
}
