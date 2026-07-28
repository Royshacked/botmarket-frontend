import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eventBus } from './event-bus.service.js'
import { buildStreamHandlers } from './sse.util.js'
import {
    openChart, closeChart, currentChart, normalizeChartRequest,
    CHART_OPEN, CHART_CLOSE,
} from './chartSurface.service.js'

// The chart surface: ONE chart, opened the same way by every agent. What's pinned here is the
// property that makes a new agent free — an agent's `chart_open` stream event reaches the surface
// with no panel wiring in between.

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

test('the chart_open stream event opens the surface with NO callback wired', () => {
    // This is the "new agent costs nothing" guarantee: its stream goes through the shared
    // handler builder, so its chart lands on the surface without a panel prop or a bubble.
    closeChart()
    const handlers = buildStreamHandlers({})
    handlers.chart_open({ ticker: 'msft', timeframe: '4hr' })
    assert.deepEqual([currentChart().ticker, currentChart().timeframe], ['MSFT', '4hr'])
})

test('a panel can still take the chart over by passing onOpenChart', () => {
    closeChart()
    const seen = []
    const handlers = buildStreamHandlers({ onOpenChart: d => seen.push(d) })
    handlers.chart_open({ ticker: 'AMD', timeframe: 'day' })
    assert.equal(seen.length, 1)
    assert.equal(currentChart(), null, 'the shared surface is not touched when overridden')
})

test('the image-chart event is untouched — an agents rendered analysis still goes to its chat', () => {
    // `chart` (a rendered PNG the agent looked at) and `chart_open` (the user asking to see the
    // live chart) are different things and must not collapse into one.
    const seen = []
    const handlers = buildStreamHandlers({ onChart: d => seen.push(d) })
    handlers.chart({ symbol: 'NVDA', imageBase64: 'x' })
    assert.deepEqual(seen, [{ symbol: 'NVDA', imageBase64: 'x' }])
})
