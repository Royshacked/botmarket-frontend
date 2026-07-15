import { useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { init, dispose } from 'klinecharts'
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

// Price decimals inferred from recent closes (2–6) so equities show 2dp while forex / small-cap
// crypto aren't truncated. Sampled from the tail — cheap and representative.
function precisionOf(candles) {
    let max = 2
    for (const c of candles.slice(-40)) {
        const s = String(c.close)
        const dot = s.indexOf('.')
        if (dot >= 0) max = Math.max(max, s.length - dot - 1)
        if (max >= 6) break
    }
    return Math.min(max, 6)
}

// Dark theme — ports the old embed's tokens. The pane background lives on the container (SCSS)
// because the KLineCharts canvas is transparent.
const GRID = 'rgba(20, 60, 120, 0.12)', AXIS = 'rgba(20, 60, 120, 0.35)', AXTEXT = '#7a9bc0'
const CROSS = 'rgba(138, 184, 232, 0.55)', UP = '#4caf50', DOWN = '#ef5350'
const CHART_STYLES = {
    grid: { horizontal: { color: GRID }, vertical: { color: GRID } },
    candle: {
        bar: {
            upColor: UP, downColor: DOWN, noChangeColor: AXTEXT,
            upBorderColor: UP, downBorderColor: DOWN, noChangeBorderColor: AXTEXT,
            upWickColor: UP, downWickColor: DOWN, noChangeWickColor: AXTEXT,
        },
        priceMark: { last: { line: { color: AXTEXT }, text: { backgroundColor: AXTEXT } } },
        tooltip: { text: { color: '#c9dcf2' } },
    },
    indicator: { bars: [{ upColor: 'rgba(76,175,80,0.5)', downColor: 'rgba(239,83,80,0.5)', noChangeColor: AXTEXT }] },
    xAxis: { axisLine: { color: AXIS }, tickLine: { color: AXIS }, tickText: { color: AXTEXT } },
    yAxis: { axisLine: { color: AXIS }, tickLine: { color: AXIS }, tickText: { color: AXTEXT } },
    crosshair: {
        horizontal: { line: { color: CROSS }, text: { backgroundColor: '#071222', color: '#c9dcf2' } },
        vertical:   { line: { color: CROSS }, text: { backgroundColor: '#071222', color: '#c9dcf2' } },
    },
    separator: { color: AXIS },
}

export function PriceChart({ symbol = 'SPY', interval = 'D' }) {
    const containerRef = useRef(null)
    const chartRef     = useRef(null)
    const symbolRef    = useRef(symbol)     // read by the loader (which is registered once)
    const intervalRef  = useRef(interval)
    const precRef      = useRef(2)

    // Init once: chart + volume pane + data loader (history + 15s realtime) + ResizeObserver.
    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        const chart = init(el, {
            locale: 'en-US',   // klinecharts registers 'en-US'/'zh-CN' — 'en' is unregistered → tooltip i18n crash
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            styles: CHART_STYLES,
        })
        if (!chart) return
        chartRef.current = chart
        chart.createIndicator('VOL', false)   // volume sub-pane

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
                        if (Array.isArray(arr) && arr.length) callback(arr[arr.length - 1])
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

    return <div className="price-chart" ref={containerRef} />
}

PriceChart.propTypes = {
    symbol:   PropTypes.string,
    interval: PropTypes.string,
}
