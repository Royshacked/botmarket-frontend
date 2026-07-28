import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eventBus } from './event-bus.service.js'
import { buildStreamHandlers } from './sse.util.js'
import {
    openChart, closeChart, currentChart, normalizeChartRequest,
    CHART_OPEN, CHART_CLOSE,
} from './chartSurface.service.js'

// The chart surface: the module cell that makes "ONE chart in the app" true. ChatChartDock renders
// it, pinned at the bottom of whichever chat asked for it.
//
// Two kinds of writer: the `chart` stream event when a user asked an agent to see a chart, and direct
// `openChart()` calls from in-app UI. What's pinned here is the cell's contract (normalize,
// open/replace, close, last-request memory) and the routing rule that keeps the two chart kinds
// apart: a LIVE request docks; an agent's still IMAGE must not, because it belongs to its turn in
// the thread.

test('a request is normalized: ticker upper-cased, timeframe defaulted', () => {
    const r = normalizeChartRequest({ ticker: ' nvda ' })
    assert.equal(r.ticker, 'NVDA')
    assert.equal(r.timeframe, 'day')
})

test('symbol/interval are accepted as aliases — in-app callers speak PriceChart', () => {
    const r = normalizeChartRequest({ symbol: 'aapl', interval: '15min' })
    assert.deepEqual([r.ticker, r.timeframe], ['AAPL', '15min'])
})

test('no ticker → null, and opening one is a no-op rather than a blank chart', () => {
    assert.equal(normalizeChartRequest({ timeframe: '1hr' }), null)
    closeChart()
    let fired = 0
    const off = eventBus.on(CHART_OPEN, () => fired++)
    assert.equal(openChart({ timeframe: '1hr' }), null)
    off()
    assert.equal(fired, 0)
    assert.equal(currentChart(), null)
})

test('opening emits the event and parks the request for a late subscriber', () => {
    // A panel that mounts AFTER the event (a tab switch mid-stream) must still show the chart.
    closeChart()
    const seen = []
    const off = eventBus.on(CHART_OPEN, r => seen.push(r))
    openChart({ ticker: 'tsla', timeframe: '1hr', source: 'kairos' })
    off()
    assert.equal(seen.length, 1)
    assert.deepEqual([seen[0].ticker, seen[0].timeframe, seen[0].source], ['TSLA', '1hr', 'kairos'])
    assert.equal(currentChart().ticker, 'TSLA')
})

test('re-asking for the SAME chart still reads as a new request', () => {
    // Otherwise "show me NVDA again" after a close would look like nothing happened.
    closeChart()
    const a = openChart({ ticker: 'NVDA', timeframe: 'day' })
    closeChart()
    const b = openChart({ ticker: 'NVDA', timeframe: 'day' })
    assert.notEqual(a, b)
    assert.ok(b.at >= a.at)
})

test('closing clears the surface and tells subscribers', () => {
    openChart({ ticker: 'SPY' })
    let closed = 0
    const off = eventBus.on(CHART_CLOSE, () => closed++)
    closeChart()
    off()
    assert.equal(closed, 1)
    assert.equal(currentChart(), null)
})

test('a LIVE chart event docks with NO callback wired', () => {
    // The "a new agent costs nothing" guarantee, and the reason no panel owns chart state: the live
    // payload goes through the shared handler builder straight into this cell, which every chat's
    // dock is already subscribed to.
    closeChart()
    const handlers = buildStreamHandlers({})
    handlers.chart({ symbol: 'msft', timeframe: '4hr', live: true })
    assert.deepEqual([currentChart().ticker, currentChart().timeframe], ['MSFT', '4hr'])
})

test("an agent's still image goes to the thread, never the dock", () => {
    // The two kinds must not collapse into one. A get_chart image is evidence of what the model saw,
    // and docking it would both redraw it live and evict whatever chart the user was reading.
    closeChart()
    const seen = []
    const handlers = buildStreamHandlers({ onChart: d => seen.push(d) })

    handlers.chart({ symbol: 'NVDA', timeframe: 'day', imageBase64: 'x' })

    assert.deepEqual(seen, [{ symbol: 'NVDA', timeframe: 'day', imageBase64: 'x' }])
    assert.equal(currentChart(), null, 'the dock stays untouched')
})

test('a docked chart survives a panel switch, but only until it is closed', () => {
    // currentChart() is what seeds a freshly mounted dock (useChartSurface) — switching agent tabs
    // unmounts one dock and mounts another, and the chart must make the trip.
    closeChart()
    openChart({ symbol: 'SPY', timeframe: 'day' })
    assert.equal(currentChart().ticker, 'SPY')
    closeChart()
    assert.equal(currentChart(), null)
})
