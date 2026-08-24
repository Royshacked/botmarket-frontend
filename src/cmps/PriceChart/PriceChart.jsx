import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import PropTypes from 'prop-types'
import { init, dispose, utils, registerOverlay, registerIndicator } from 'klinecharts'
import { marketService } from '../../services/market/market.service.remote'
import { toPeriod, isCurrentPeriod } from './chartPeriod.js'
import './PriceChart.scss'

// ── Custom klinecharts registrations (module-level: registries are global, register once) ──
// VWAP + ATR aren't klinecharts built-ins — same templates the backend headless renderer uses
// (botmarket-backend services/chartRender/klineRender.provider.js). Keep in sync.
let _registered = false
function registerChartExtras() {
    if (_registered) return
    _registered = true

    // Session-anchored VWAP (reset each UTC day), drawn on the candle pane's price axis.
    registerIndicator({
        name: 'VWAP', shortName: 'VWAP', series: 'price',
        figures: [{ key: 'vwap', title: 'VWAP: ', type: 'line' }],
        calc: (dataList) => {
            let cumPV = 0, cumV = 0, dayKey = null
            return dataList.map((k) => {
                const d = new Date(k.timestamp)
                const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
                if (key !== dayKey) { dayKey = key; cumPV = 0; cumV = 0 }
                const tp = (k.high + k.low + k.close) / 3
                const v  = k.volume || 0
                cumPV += tp * v; cumV += v
                return { vwap: cumV > 0 ? cumPV / cumV : k.close }
            })
        },
    })
    // ATR — mean True Range over N, own pane.
    registerIndicator({
        name: 'ATR', shortName: 'ATR', calcParams: [14],
        figures: [{ key: 'atr', title: 'ATR: ', type: 'line' }],
        calc: (dataList, { calcParams }) => {
            const n = calcParams[0] || 14
            const trs = []
            return dataList.map((k, i) => {
                const prev = dataList[i - 1]
                const tr = i === 0 ? k.high - k.low
                    : Math.max(k.high - k.low, Math.abs(k.high - prev.close), Math.abs(k.low - prev.close))
                trs.push(tr)
                if (trs.length < n) return {}
                return { atr: trs.slice(-n).reduce((a, b) => a + b, 0) / n }
            })
        },
    })
    // tradeLevel — a horizontal dashed line across the candle pane + a right-edge label pill.
    // Price comes from points[0].value; { color, label } ride on extendData.
    registerOverlay({
        name: 'tradeLevel',
        totalStep: 1,
        needDefaultPointFigure: false,
        needDefaultXAxisFigure: false,
        needDefaultYAxisFigure: false,
        createPointFigures: ({ overlay, coordinates, bounding }) => {
            const y = coordinates[0]?.y
            if (y == null) return []
            const { color = '#8ab8e8', label = '' } = overlay.extendData || {}
            return [
                { type: 'line', ignoreEvent: true, attrs: { coordinates: [{ x: 0, y }, { x: bounding.width, y }] }, styles: { color, size: 1, style: 'dashed' } },
                // Label pill on the LEFT edge (oldest bars) so it never covers the current candles /
                // last-price marker on the right.
                { type: 'text', ignoreEvent: true, attrs: { x: 2, y, text: label, align: 'left', baseline: 'middle' },
                  styles: { color: '#0a0f1a', backgroundColor: color, size: 10, family: 'monospace', paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2, borderRadius: 2 } },
            ]
        },
    })
}

// Semantic colors per level kind (bright enough to read on the dark chart pane in any theme).
const LEVEL_COLORS = {
    entry: '#8ab8e8', stop: '#ef5350', tp: '#4caf50',
    zone: '#c9a227', ref: '#7a9bc0', invalidation: '#e0902b', exit: '#9aa7b4',
}

// Distinct line colors so stacked indicators (e.g. EMA(20) vs EMA(50) vs VWAP on the candle pane)
// are told apart. Deliberately clear of the level colors (blue/red/green) so indicators don't read
// as entry/stop/tp lines.
const INDICATOR_PALETTE = ['#e0a63b', '#4aa3ff', '#c77dff', '#39d3c3', '#ff8fab', '#b5c400']

// Self-hosted price chart on KLineCharts v10, fed by our /api/market/candles (FMP-first).
// Replaces the old TradingView embed (which fetched its own data). Props are drop-in
// compatible: { symbol, interval }.
//
// v10 is DataLoader-driven — the chart PULLS bars via setDataLoader({ getBars, subscribeBar })
// rather than being handed a candle array. So this owns fetching directly (history + a 15s
// realtime poll); the server cache keeps that bandwidth-flat across viewers.

// Interval spelling, and whether a bar is still forming: ./chartPeriod.js

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

// The chart is theme-independent: its chrome (grid / axis / crosshair / tooltip) is a FIXED
// neutral palette and its pane is a fixed black (SCSS), so switching the app's theme color leaves
// the chart untouched. Only the candle direction colors and the mono font are read from tokens,
// and those are constant across themes — so there's no need to re-resolve on theme change.
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

    // Chart chrome is pinned to a FIXED neutral-on-black palette — the pane stays black (SCSS) and
    // the grid / axis / crosshair / tooltip never pick up the app's theme-color (accent) switches.
    // The chart is intentionally theme-independent; only the candle direction colors and mono font
    // below still track their (theme-constant) tokens.
    const GRID   = 'rgba(255, 255, 255, 0.05)'   // faint neutral gridlines
    const AXIS   = 'rgba(255, 255, 255, 0.18)'   // axis / tick / separator lines
    const AXTEXT = '#8b8b8b'                      // axis labels, last-price mark
    const CROSS  = 'rgba(255, 255, 255, 0.45)'   // crosshair lines
    const TIP    = '#e6e6e6'                      // crosshair / candle tooltip text
    const TIPBG  = '#141414'                      // crosshair label background
    // Candle up/down reuse the header session-dial colors (MarketClocks): in-session green /
    // closed-session red — one shared source (--mc-arc-open / --mc-arc-closed in _themes.scss),
    // constant across themes.
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
            // Always-on label so you can tell which indicator is which ("EMA(20)", "RSI(14)",
            // "VWAP") at the top-left of each pane — with its current value alongside.
            tooltip: {
                showRule: 'always',
                showType: 'standard',
                title:  { show: true, showName: true, showParams: true, color: AXTEXT, family: FONT, size: 11, weight: 'normal' },
                legend: { color: TIP, family: FONT, size: 11 },
            },
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

export const PriceChart = forwardRef(function PriceChart({ symbol = 'SPY', interval = 'D', levels = [], indicators = [], drawings = [] }, ref) {
    const containerRef = useRef(null)
    const chartRef     = useRef(null)
    const symbolRef    = useRef(symbol)     // read by the loader (which is registered once)
    const intervalRef  = useRef(interval)
    const precRef      = useRef(2)
    const indHandlesRef  = useRef({ overlayNames: [], paneIds: [] })  // created indicators, for reconcile
    const userDrawingIds = useRef([])                                  // IDs of user-drawn overlays (for undo/clear)

    useImperativeHandle(ref, () => ({
        // Activate an interactive drawing tool by KLineCharts overlay name.
        // Returns immediately; the chart waits for the user to click points on the canvas.
        activateTool: (toolType) => {
            const chart = chartRef.current
            if (!chart) return
            const id = chart.createOverlay({ name: toolType, groupId: 'user-drawings' })
            if (id != null) userDrawingIds.current.push(...(Array.isArray(id) ? id : [id]))
        },
        // Remove the most recently drawn overlay.
        undoLastDrawing: () => {
            const ids = userDrawingIds.current
            if (!ids.length) return
            chartRef.current?.removeOverlay({ id: ids.pop() })
        },
        // Remove all user-drawn overlays.
        clearAllDrawings: () => {
            chartRef.current?.removeOverlay({ groupId: 'user-drawings' })
            userDrawingIds.current = []
        },
    }))
    // `ready` flips once the first bars are loaded (overlays/indicators need the price scale first);
    // `precision` mirrors precRef so level labels redraw when the decimal count settles.
    const [ready, setReady]         = useState(false)
    const [precision, setPrecision] = useState(2)

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
        registerChartExtras()   // custom VWAP/ATR indicators + tradeLevel overlay (idempotent)
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

        // No theme observer: the chart's palette is fixed (black pane + neutral chrome), so it
        // deliberately does NOT follow the app's data-theme / data-design switches.

        let pollId = null
        let quoteId = null
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
                        setPrecision(prec)
                        chart.setSymbol({ ticker: symbolRef.current, pricePrecision: prec, volumePrecision: 0 })
                    }
                    if (candles.length) setReady(true)   // price scale exists → overlays can draw
                } catch {
                    callback([], false)
                }
            },
            // Realtime, two feeds (both skip a hidden tab):
            //  • Candles every 15s — but only to introduce a NEW bar (newer timestamp). It must not
            //    overwrite the current bar's close: the candle close lags the live price (esp. on
            //    daily/4h, where it's stale all session), and the quote feed below owns that.
            //  • Quote every 5s — patches the current bar's close/high/low from the real-time price
            //    so it actually ticks mid-bar. Null price (futures/index) → no patch, candle-only.
            subscribeBar: ({ callback }) => {
                clearInterval(pollId)
                clearInterval(quoteId)
                pollId = setInterval(async () => {
                    if (document.hidden) return
                    try {
                        const res = await marketService.getCandles(symbolRef.current, intervalRef.current)
                        const arr = res?.candles
                        if (!Array.isArray(arr) || !arr.length) return
                        const last = arr[arr.length - 1]
                        const cur  = latestBarRef.current
                        if (!cur || last.timestamp > cur.timestamp) {   // new bar only
                            callback(last)
                            latestBarRef.current = last
                            showLatest()
                        }
                    } catch { /* transient — next tick retries */ }
                }, 15_000)
                quoteId = setInterval(async () => {
                    if (document.hidden) return
                    const base = latestBarRef.current
                    if (!base) return
                    // Never tick a CLOSED candle (see isCurrentPeriod). Off-hours this simply stops
                    // repainting the last bar, which is what a finished session should look like.
                    if (!isCurrentPeriod(base, intervalRef.current)) return
                    try {
                        const q  = await marketService.getQuote(symbolRef.current)
                        const px = Number(q?.price)
                        if (!Number.isFinite(px) || px <= 0) return   // null (uncovered) → Number(null)=0; never patch to 0
                        const patched = { ...base, close: px, high: Math.max(base.high, px), low: Math.min(base.low, px) }
                        callback(patched)
                        latestBarRef.current = patched
                        showLatest()
                    } catch { /* transient — next tick retries */ }
                }, 5_000)
            },
            unsubscribeBar: () => { clearInterval(pollId); clearInterval(quoteId); pollId = null; quoteId = null },
        })

        const ro = new ResizeObserver(() => chart.resize())
        ro.observe(el)

        return () => {
            clearInterval(pollId)
            clearInterval(quoteId)
            ro.disconnect()
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

    // Stable content keys so the draw effects below run only when the levels/indicators actually
    // CHANGE — not on every parent re-render. The parents derive these arrays fresh each render
    // (e.g. IdeaDetail's positions.filter(), CallPage's 20s call poll), so keying on array identity
    // would tear down + rebuild the overlays/indicator panes needlessly (and flash the sub-pane).
    const levelsKey     = JSON.stringify(levels)
    const indicatorsKey = JSON.stringify(indicators)

    // Trade levels → horizontal tradeLevel overlays on the candle pane. Cleared + redrawn as a
    // group whenever the levels (or precision, for the label) change. Gated on `ready` so the
    // price scale exists. Labels format the price with the chart's live precision.
    useEffect(() => {
        const chart = chartRef.current
        if (!chart || !ready) return
        chart.removeOverlay({ groupId: 'trade-levels' })
        for (const lv of levels) {
            if (lv?.price == null) continue
            const color = LEVEL_COLORS[lv.kind] || LEVEL_COLORS.entry
            chart.createOverlay({
                name: 'tradeLevel',
                points: [{ value: lv.price }],
                extendData: { color, label: `${lv.label} ${fmtNum(lv.price, precision)}` },
                groupId: 'trade-levels',
                lock: true,
                paneId: 'candle_pane',
            })
        }
        return () => { chartRef.current?.removeOverlay({ groupId: 'trade-levels' }) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [levelsKey, ready, precision])

    // Prompt-driven drawings → programmatic overlays (e.g. horizontal price lines from Axl).
    // Only horizontal-style overlays with a `value` point make sense here — trendlines need bar
    // timestamps that the LLM can't reliably produce. Cleared + redrawn when drawings[] changes.
    const drawingsKey = JSON.stringify(drawings)
    useEffect(() => {
        const chart = chartRef.current
        if (!chart || !ready || !drawings.length) return
        chart.removeOverlay({ groupId: 'prompt-drawings' })
        for (const d of drawings) {
            if (!d?.type || !Array.isArray(d.points)) continue
            chart.createOverlay({ name: d.type, points: d.points, groupId: 'prompt-drawings', lock: true })
        }
        return () => { chartRef.current?.removeOverlay({ groupId: 'prompt-drawings' }) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drawingsKey, ready])

    // Relevant indicators → createIndicator (overlay ones share the candle pane; the rest get their
    // own sub-pane with a stable id so we can remove them on reconcile). VOL is excluded upstream
    // (the chart always shows a volume pane).
    useEffect(() => {
        const chart = chartRef.current
        if (!chart || !ready) return
        const prev = indHandlesRef.current
        prev.overlayNames.forEach(n => chart.removeIndicator({ paneId: 'candle_pane', name: n }))
        prev.paneIds.forEach(id => chart.removeIndicator({ paneId: id }))

        // VWAP is session-anchored → meaningless on daily+ charts (each bar is its own session), so
        // only draw it on intraday timeframes.
        const isIntraday = ['minute', 'hour'].includes(toPeriod(interval).type)
        const drawable = indicators.filter(d => d.name !== 'VWAP' || isIntraday)

        const overlayNames = [], paneIds = []
        drawable.forEach((d, i) => {
            // Give each indicator a distinct line color. `lines` covers single- and multi-line
            // indicators (EMA=1, BOLL=3); extra entries past an indicator's line count are ignored.
            const color = INDICATOR_PALETTE[i % INDICATOR_PALETTE.length]
            const styles = { lines: [{ color }, { color }, { color }] }
            if (d.overlay) {
                chart.createIndicator({ name: d.name, calcParams: d.calcParams, paneId: 'candle_pane', styles }, true)
                overlayNames.push(d.name)
            } else {
                const paneId = `ind-${i}-${d.name}`
                chart.createIndicator({ name: d.name, calcParams: d.calcParams, paneId, styles }, false)
                paneIds.push(paneId)
            }
        })
        indHandlesRef.current = { overlayNames, paneIds }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [indicatorsKey, ready, interval])

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
})

PriceChart.propTypes = {
    symbol:   PropTypes.string,
    interval: PropTypes.string,
    levels:   PropTypes.arrayOf(PropTypes.shape({
        kind:  PropTypes.string,
        price: PropTypes.number,
        label: PropTypes.string,
        side:  PropTypes.string,
    })),
    indicators: PropTypes.arrayOf(PropTypes.shape({
        name:       PropTypes.string,
        calcParams: PropTypes.array,
        overlay:    PropTypes.bool,
    })),
    // Prompt-driven overlays: { type: KLineCharts overlay name, points: [{value}] }
    drawings: PropTypes.arrayOf(PropTypes.shape({
        type:   PropTypes.string,
        points: PropTypes.array,
    })),
}
