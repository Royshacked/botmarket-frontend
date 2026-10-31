import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MentorTradeChart } from './MentorTradeChart.jsx'
import { tradeChartSetup } from './mentorSurface.utils.js'
import { currentChart, closeChart } from '../../services/chartSurface.service.js'

// Mentor's trade chart in the thread (2026-10-31): the plan's lines on a turn-tall chart once Generate lights.
// KLineCharts wants a real canvas and PriceChart fetches its own candles — the stub records what it was handed.
vi.mock('../PriceChart/PriceChart.jsx', () => ({
    PriceChart: ({ symbol, interval, levels }) => (
        <div data-testid="price-chart" data-symbol={symbol} data-interval={interval} data-levels={JSON.stringify(levels)} />
    ),
}))

const SCENARIO = {
    id: 's1', name: 'reversal',
    entry_legs:  [{ id: 'e1', price: 28.8, note: 'the level and below' }],
    stop_legs:   [{ id: 'x1', price: 26.9, note: 'under the sellers’ last swing' }],
    target_legs: [{ id: 't1', price: 31.6, note: 'start of the last fall' }],
}
const SETUP = { asset: 'NXST', direction: 'long', type: 'swing', trade_mode: 'thesis', timeframe: 'day', scenarios: [SCENARIO] }
const levelsOf = () => JSON.parse(screen.getByTestId('price-chart').dataset.levels)

afterEach(() => { cleanup(); closeChart() })

describe('MentorTradeChart', () => {
    it('draws the plan’s own entry, stop and target on the timeframe it is watched on', () => {
        render(<MentorTradeChart setup={SETUP} />)
        const chart = screen.getByTestId('price-chart')
        expect(chart.dataset.symbol).toBe('NXST')
        expect(chart.dataset.interval).toBe('day')
        expect(levelsOf().map(l => [l.kind, l.price])).toEqual(expect.arrayContaining([['stop', 26.9], ['tp', 31.6]]))
        expect(levelsOf().some(l => l.price === 28.8)).toBe(true)
    })

    it('nothing to draw → no chart (no ticker, or no priced leg)', () => {
        const { container, rerender } = render(<MentorTradeChart setup={{ ...SETUP, asset: '' }} />)
        expect(container.innerHTML).toBe('')
        rerender(<MentorTradeChart setup={{ ...SETUP, scenarios: [] }} />)
        expect(container.innerHTML).toBe('')
    })

    it('"Full chart" docks the workspace chart carrying the same lines', () => {
        render(<MentorTradeChart setup={SETUP} />)
        fireEvent.click(screen.getByText('Full chart'))
        const docked = currentChart()
        expect([docked.ticker, docked.timeframe, docked.source]).toEqual(['NXST', 'day', 'mentor'])
        expect(docked.levels).toEqual(levelsOf())
    })
})

describe('tradeChartSetup — when the chat draws the chart', () => {
    const mentor = (over = {}) => ({ draft: SETUP, view: { readiness: { ready: true, missing: [] } }, ...over })

    it('Generate lit, an account marked, no turn running → the draft', () => {
        expect(tradeChartSetup(mentor(), 1, false)).toBe(SETUP)
    })

    it('anything else → nothing', () => {
        expect(tradeChartSetup(mentor(), 1, true)).toBeNull()                                                   // a turn is running
        expect(tradeChartSetup(mentor(), 0, false)).toBeNull()                                                  // no account marked
        expect(tradeChartSetup(mentor({ view: { readiness: { ready: false, missing: ['a size'] } } }), 1, false)).toBeNull()
        expect(tradeChartSetup(mentor({ generated: { id: 'x' } }), 1, false)).toBeNull()                        // the Arm bar's turn
        expect(tradeChartSetup(mentor({ editing: { kind: 'setup', entityId: 's1' } }), 1, false)).toBeNull()    // an Update
        expect(tradeChartSetup(mentor({ draft: { ...SETUP, asset: '' } }), 1, false)).toBeNull()
        expect(tradeChartSetup(null, 1, false)).toBeNull()
    })

    it('the account the server lacked is marked now → lit, as the button is', () => {
        expect(tradeChartSetup(mentor({ view: { readiness: { ready: false, missing: ['trading account'] } } }), 1, false)).toBe(SETUP)
    })
})
