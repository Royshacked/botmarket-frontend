import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { init, dispose, utils } from 'klinecharts'
import { marketService } from '../../services/market/market.service.remote'
import './PriceChart.scss'

// Self-hosted price chart on KLineCharts v10, fed by our /api/market/candles (FMP-first).
// Replaces the old TradingView embed (which fetched its own data). Props are drop-in
// compatible: { symbol, interval }.
//
// v10 is DataLoader-driven — the chart PULLS bars via setDataLoader({ getBars, subscribeBar })
// rather than being handed a candle array. So this owns fetching directly (history + a 15s
// realtime poll); the server cache keeps that bandwidth-flat across viewers.

// interval spelling -> klinecharts Period { type, span }. Covers app words, the old TV codes
// (M = month, D = day), and legacy daily/weekly/monthly — the same set the backend accepts.
const PERIOD_MAP = {
    '1min': { type: 'minute', span: 1 },  '1':  { type: 'minute', span: 1 },
    '5min': { type: 'minute', span: 5 },  '5':  { type: 'minute', span: 5 },
    '15min':{ type: 'minute', span: 15 }, '15': { type: 'minute', span: 15 },
    '30min':{ type: 'minute', span: 30 }, '30': { type: 'minute', span: 30 },
    '1hr':  { type: 'hour', span: 1 }, '1hour': { type: 'hour', span: 1 }, '60':  { type: 'hour', span: 1 },
    '2hr':  { type: 'hour', span: 2 }, '2hour': { type: 'hour', span: 2 }, '120': { type: 'hour', span: 2 },
    '4hr':  { type: 'hour', span: 4 }, '4hour': { type: 'hour', span: 4 }, '240': { type: 'hour', span: 4 },
    'day':  { type: 'day', span: 1 }, 'daily':  { type: 'day', span: 1 }, 'd': { type: 'day', span: 1 },
    'week': { type: 'week', span: 1 }, 'weekly': { type: 'week', span: 1 }, 'w': { type: 'week', span: 1 },
    'month':{ type: 'month', span: 1 }, 'monthly': { type: 'month', span: 1 }, 'm': { type: 'month', span: 1 },
}
function toPeriod(interval) {
    return PERIOD_MAP[String(interval ?? '').trim().toLowerCase()] ?? { type: 'day', span: 1 }
}

// Price decimals for the axis/tooltip. FMP returns noisy floats (e.g. 324.08499), so a raw
// decimal count over-states precision — equities would render ~5dp. Cap the count by price
// magnitude (pricier instruments need fewer): AAPL 324 → 2dp, forex 1.0850 → 4dp, penny → 6dp.
function precisionOf(candles) {
    if (!candles.length) return 2
    const ref = Math.abs(Number(candles[candles.length - 1].close)) || 0
    const cap = ref >= 10 ? 2 : ref >= 1 ? 4 : 6   // equities 2dp; forex ~1.08 4dp; sub-$1 up to 6dp
    let dec = 2
    for (const c of candles.slice(-40)) {
        const s = String(c.close)
        const dot = s.indexOf('.')
        if (dot >= 0) dec = Math.max(dec, s.length - dot - 1)
        if (dec >= cap) break
    }
    return Math.min(dec, cap)
}

// Chart colors are pulled from the app's theme tokens (the CSS custom properties on :root) so the
// grid / axis / crosshair follow theme + accent switches. The KLineCharts canvas can't read CSS
// vars itself, so we resolve them to concrete colors at init and re-apply on theme change (see the
// MutationObserver below). The pane background lives on the container (SCSS, --bg-wash) because the
// canvas is transparent. Fallbacks are the old ocean tokens, in case a var is missing.
// Fade a #rrggbb token to an rgba() at the given alpha — the volume bars reuse the candle
// session colors but sit slightly translucent behind price. Non-hex input is returned as-is.
function fade(hex, alpha) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
    if (!m) return hex
    const [r, g, b] = [m[1], m[2], m[3]].map(h => parseInt(h, 16))
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Bottom-axis date labels: MM/DD, with a 2-digit year anchor only on Jan 1 (e.g. 01/01/26 among
// 12/28 / 01/08 ticks). Only the date axis ('xAxis' + the day/week 'YYYY-MM-DD' template) is
// reshaped — intraday time labels and the tooltip/crosshair timestamps delegate to klinecharts'
// default. dateTimeFormat is klinecharts' own timezone-aware Intl formatter, so parts stay correct.
function formatChartDate({ dateTimeFormat, timestamp, template, type }) {
    if (type === 'xAxis' && template === 'YYYY-MM-DD') {
        const p = {}
        for (const part of dateTimeFormat.formatToParts(new Date(timestamp))) p[part.type] = part.value
        const md = `${p.month}/${p.day}`
        return p.month === '01' && p.day === '01' ? `${md}/${String(p.year).slice(-2)}` : md
    }
    return utils.formatDate(dateTimeFormat, timestamp, template)
}

function readThemeStyles() {
    const cs = getComputedStyle(document.documentElement)
    const v = (name, fallback) => cs.getPropertyValue(name).trim() || fallback

    const GRID   = v('--glow',           'rgba(20, 60, 120, 0.12)')   // faint accent-tinted gridlines
    const AXIS   = v('--border',         'rgba(20, 60, 120, 0.35)')   // axis / tick / separator lines
    const AXTEXT = v('--text-secondary', '#7a9bc0')                   // axis labels, last-price mark
    const CROSS  = v('--border-strong',  'rgba(138, 184, 232, 0.55)') // crosshair lines
    const TIP    = v('--text-primary',   '#c9dcf2')                   // crosshair / candle tooltip text
    const TIPBG  = v('--bg-surface',     '#071222')                   // crosshair label background
    // Candle up/down reuse the header session-dial colors (MarketClocks): in-session green /
    // closed-session red — one shared source (--mc-arc-open / --mc-arc-closed in _themes.scss).
    const UP     = v('--mc-arc-open',    '#1c7a3e')
    const DOWN   = v('--mc-arc-closed',  '#5e1212')
    // All chart text/numbers use the app's mono stack (--font-mono) instead of klinecharts'
    // default Helvetica Neue, so axis, crosshair, price mark and tooltips match the app.
    const FONT   = v('--font-mono',      "'IBM Plex Mono', monospace")

    return {
        grid: { horizontal: { color: GRID }, vertical: { color: GRID } },
        candle: {
            bar: {
                upColor: UP, downColor: DOWN, noChangeColor: AXTEXT,
                upBorderColor: UP, downBorderColor: DOWN, noChangeBorderColor: AXTEXT,
                upWickColor: UP, downWickColor: DOWN, noChangeWickColor: AXTEXT,
            },
            // Last-price marker: solid line + price pill tinted the candle up/down session color at
            // reduced opacity, so it reads as a subtle overlay. In klinecharts the line AND the pill
            // background both take upColor/downColor (chosen by the last candle's direction) — there
            // is no separate line color, so fading these fades both together.
            priceMark: {
                last: {
                    upColor:       fade(UP, 0.7),
                    downColor:     fade(DOWN, 0.7),
                    noChangeColor: fade(AXTEXT, 0.7),
                    line: { style: 'solid' },
                    text: { family: FONT },
                },
            },
            // The ticker/TF/OHLC readout now lives in the DOM header (price-chart__header) so it
            // can't overlap the candles — so the built-in floating legend is turned off.
            tooltip: { showRule: 'none' },
        },
        // Volume bars: same in-session green / closed-session red as the candles, faded so they
        // sit behind price. Bumped past the old 0.5 since the session colors are already dark.
        // Its floating tooltip is off too — volume is shown in the DOM header alongside OHLC.
        indicator: {
            bars: [{ upColor: fade(UP, 0.65), downColor: fade(DOWN, 0.65), noChangeColor: AXTEXT }],
            tooltip: { showRule: 'none' },
        },
        xAxis: { axisLine: { color: AXIS }, tickLine: { color: AXIS }, tickText: { color: AXTEXT, family: FONT } },
        yAxis: { axisLine: { color: AXIS }, tickLine: { color: AXIS }, tickText: { color: AXTEXT, family: FONT } },
        crosshair: {
            horizontal: { line: { color: CROSS }, text: { backgroundColor: TIPBG, color: TIP, family: FONT } },
            vertical:   { line: { color: CROSS }, text: { backgroundColor: TIPBG, color: TIP, family: FONT } },
        },
        separator: { color: AXIS },
    }
}

// Price / volume formatting for the DOM header. Prices use the chart's live precision; volume
// folds into K/M/B like the old floating legend did.
function fmtNum(v, dp) {
    const n = Number(v)
    return Number.isFinite(n) ? n.toFixed(dp) : '—'
}
function fmtVol(v) {
    const n = Number(v)
    if (!Number.isFinite(n)) return '—'
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
    return String(Math.round(n))
}

export function PriceChart({ symbol = 'SPY', interval = 'D' }) {
    const containerRef = useRef(null)
    const chartRef     = useRef(null)
    const symbolRef    = useRef(symbol)     // read by the loader (which is registered once)
    const intervalRef  = useRef(interval)
    const precRef      = useRef(2)

    // Header OHLCV readout. `bar` is the candle shown in the header: the hovered bar while the
    // crosshair is over the chart, otherwise the latest bar. latestBarRef/hoveringRef let the
    // once-registered loader + crosshair callback update it without stale closures.
    const [bar, setBar]  = useState(null)
    const latestBarRef   = useRef(null)
    const hoveringRef    = useRef(false)
    const hoverIdxRef    = useRef(-1)       // skip re-renders while hovering the same bar
    // Show the latest bar in the header unless the crosshair is actively hovering one.
    const showLatest = () => { if (!hoveringRef.current) setBar(latestBarRef.current) }

    // Init once: chart + volume pane + data loader (history + 15s realtime) + ResizeObserver.
    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        const chart = init(el, {
            locale: 'en-US',   // klinecharts registers 'en-US'/'zh-CN' — 'en' is unregistered → tooltip i18n crash
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            styles: readThemeStyles(),
        })
        if (!chart) return
        chartRef.current = chart
        // Volume sub-pane. calcParams:[] drops the default MA5/10/20 average lines (VOL's default
        // is [5,10,20]) — regenerateFigures then keeps only the volume bars.
        chart.createIndicator({ name: 'VOL', calcParams: [] }, false)
        chart.setFormatter({ formatDate: formatChartDate })   // bottom axis MM/DD, year (yy) only on Jan 1

        // Header OHLCV tracks the crosshair: hovering a bar shows that bar; leaving the chart
        // falls back to the latest. onCrosshairChange only fires over a real bar, so the reset
        // to latest is done on mouseleave. klinecharts hands the subscriber the RAW crosshair
        // ({x,y,paneId}) — not the enriched one — so resolve the hovered bar from the pixel x via
        // convertFromPixel + getDataList (and still accept an enriched payload if a build sends one).
        const onCrosshair = (data) => {
            if (!data) return
            let kd = data.kLineData
            let idx = data.dataIndex
            if (!kd && typeof data.x === 'number') {
                idx = chart.convertFromPixel({ x: data.x, y: data.y ?? 0 })?.dataIndex
                const list = chart.getDataList()
                if (idx != null && list.length) kd = list[Math.max(0, Math.min(idx, list.length - 1))]
            }
            if (!kd || idx === hoverIdxRef.current) return
            hoveringRef.current = true
            hoverIdxRef.current = idx
            setBar(kd)
        }
        chart.subscribeAction('onCrosshairChange', onCrosshair)
        const onLeave = () => { hoveringRef.current = false; hoverIdxRef.current = -1; showLatest() }
        el.addEventListener('mouseleave', onLeave)

        // Re-resolve the theme tokens and re-apply when the palette changes. Both the theme
        // (data-theme) and the dev design-trial variant (data-design) live as attributes on
        // <html> and each remaps --border / --glow / --text-secondary / --bg-surface. Canvas
        // colors can't track CSS vars live, so we push fresh styles on each switch.
        const themeObserver = new MutationObserver(() => chart.setStyles(readThemeStyles()))
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-design'] })

        let pollId = null
        chart.setDataLoader({
            // History. v1 serves the server's default window; pagination (more:false) is a
            // later phase.
            getBars: async ({ type, callback }) => {
                if (type !== 'init') { callback([], false); return }
                try {
                    const res = await marketService.getCandles(symbolRef.current, intervalRef.current)
                    const candles = Array.isArray(res?.candles) ? res.candles : []
                    // Deliver first (never leave the chart empty), then refine price decimals —
                    // a changed precision re-runs getBars, which re-delivers with the right dp.
                    callback(candles, false)
                    latestBarRef.current = candles[candles.length - 1] ?? null
                    showLatest()
                    const prec = precisionOf(candles)
                    if (prec !== precRef.current) {
                        precRef.current = prec
                        chart.setSymbol({ ticker: symbolRef.current, pricePrecision: prec, volumePrecision: 0 })
                    }
                } catch {
                    callback([], false)
                }
            },
            // Realtime: poll the same endpoint every 15s and push the latest bar; skip a hidden tab.
            subscribeBar: ({ callback }) => {
                clearInterval(pollId)
                pollId = setInterval(async () => {
                    if (document.hidden) return
                    try {
                        const res = await marketService.getCandles(symbolRef.current, intervalRef.current)
                        const arr = res?.candles
                        if (Array.isArray(arr) && arr.length) {
                            callback(arr[arr.length - 1])
                            latestBarRef.current = arr[arr.length - 1]
                            showLatest()
                        }
                    } catch { /* transient — next tick retries */ }
                }, 15_000)
            },
            unsubscribeBar: () => { clearInterval(pollId); pollId = null },
        })

        const ro = new ResizeObserver(() => chart.resize())
        ro.observe(el)

        return () => {
            clearInterval(pollId)
            ro.disconnect()
            themeObserver.disconnect()
            chart.unsubscribeAction('onCrosshairChange', onCrosshair)
            el.removeEventListener('mouseleave', onLeave)
            dispose(el)
            chartRef.current = null
        }
    }, [])

    // Symbol / interval change → point the loader at the new series (triggers getBars 'init' +
    // re-subscribe). Refs are updated first so the once-registered loader reads current values.
    useEffect(() => {
        symbolRef.current = symbol
        intervalRef.current = interval
        const chart = chartRef.current
        if (!chart) return
        chart.setSymbol({ ticker: symbol, pricePrecision: precRef.current, volumePrecision: 0 })
        chart.setPeriod(toPeriod(interval))
    }, [symbol, interval])

    // Direction tint for the close: up when close ≥ open, down otherwise.
    const isUp = bar ? Number(bar.close) >= Number(bar.open) : true
    const dp = precRef.current

    return (
        <div className="price-chart">
            <div className="price-chart__header">
                <span className="price-chart__sym">{symbol}</span>
                <span className="price-chart__tf">{interval}</span>
                {bar && (
                    <span className="price-chart__ohlc">
                        <span><i>O</i>{fmtNum(bar.open, dp)}</span>
                        <span><i>H</i>{fmtNum(bar.high, dp)}</span>
                        <span><i>L</i>{fmtNum(bar.low, dp)}</span>
                        <span className={isUp ? 'is-up' : 'is-down'}><i>C</i>{fmtNum(bar.close, dp)}</span>
                        <span><i>Vol</i>{fmtVol(bar.volume)}</span>
                    </span>
                )}
            </div>
            <div className="price-chart__canvas" ref={containerRef} />
        </div>
    )
}

PriceChart.propTypes = {
    symbol:   PropTypes.string,
    interval: PropTypes.string,
}
