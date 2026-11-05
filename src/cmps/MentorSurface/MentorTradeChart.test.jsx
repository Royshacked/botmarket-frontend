import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MentorTradeChart } from './MentorTradeChart.jsx'
import { tradeChartSetup, tradeChartReady } from './mentorSurface.utils.js'
import { currentChart, closeChart } from '../../services/chartSurface.service.js'

// Mentor's trade chart in the thread (2026-10-31): the plan's lines on a turn-tall chart once Generate lights.
// KLineCharts wants a real canvas and PriceChart fetches its own candles — the stub records what it was handed.
vi.mock('../PriceChart/PriceChart.jsx', () => ({
    PriceChart: ({ symbol, interval, levels, compact, fitBars }) => (
        <div data-testid="price-chart" data-symbol={symbol} data-interval={interval} data-levels={JSON.stringify(levels)} data-compact={String(!!compact)} data-fit={fitBars} />
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
        expect(chart.dataset.fit).toBe('120')                                    // zoomed out to the structure's window
        expect(levelsOf().map(l => [l.kind, l.price])).toEqual(expect.arrayContaining([['stop', 26.9], ['tp', 31.6]]))
        expect(levelsOf().some(l => l.price === 28.8)).toBe(true)
    })

    it('nothing to draw → no chart (no ticker, or no priced leg)', () => {
        const { container, rerender } = render(<MentorTradeChart setup={{ ...SETUP, asset: '' }} />)
        expect(container.innerHTML).toBe('')
        rerender(<MentorTradeChart setup={{ ...SETUP, scenarios: [] }} />)
        expect(container.innerHTML).toBe('')
    })

    it('is small in every measure (compact), and "Full chart" is its only control', () => {
        render(<MentorTradeChart setup={SETUP} />)
        expect(screen.getByTestId('price-chart').dataset.compact).toBe('true')
        expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(['Full chart'])
    })

    it('"Full chart" docks the workspace chart carrying the same lines, tagged so its Close reads Shrink', () => {
        render(<MentorTradeChart setup={SETUP} />)
        fireEvent.click(screen.getByText('Full chart'))
        const docked = currentChart()
        expect([docked.ticker, docked.timeframe, docked.source]).toEqual(['NXST', 'day', 'mentor-trade'])
        expect(docked.levels).toEqual(levelsOf())
        expect(docked.fitBars).toBe(120)                                         // the full size keeps the zoomed-out picture
    })
})

describe('MentorTradeChart — the docked full chart', () => {
    const moved = { ...SETUP, scenarios: [{ ...SCENARIO, stop_legs: [{ id: 'x1', price: 25 }] }] }

    it('follows the lines when the draft moves', () => {
        const { rerender } = render(<MentorTradeChart setup={SETUP} />)
        fireEvent.click(screen.getByText('Full chart'))
        rerender(<MentorTradeChart setup={moved} />)
        expect(currentChart().levels.some(l => l.kind === 'stop' && l.price === 25)).toBe(true)
    })

    it('does not open itself, and leaves another chart alone', () => {
        const { rerender } = render(<MentorTradeChart setup={SETUP} />)
        rerender(<MentorTradeChart setup={moved} />)
        expect(currentChart()).toBeNull()
    })
})

describe('tradeChartSetup — when the chat draws the chart', () => {
    const mentor = (over = {}) => ({ draft: SETUP, view: { readiness: { ready: true, missing: [] } }, ...over })

    it('Generate lit, an account marked, no turn running → the draft', () => {
        expect(tradeChartSetup(mentor(), 1, false)).toBe(SETUP)
    })

    it('a stop and a target, before Generate lights → the levels so far (Roy, 2026-11-05)', () => {
        const levels = { ...SETUP, scenarios: [{ ...SCENARIO, entry_legs: [] }] }
        const m = mentor({ draft: levels, view: { readiness: { ready: false, missing: ['entry price', 'quantity'] } } })
        expect(tradeChartSetup(m, 1, false)).toBe(levels)
        expect(tradeChartSetup(m, 0, false)).toBe(levels)                                                       // no account yet
        expect(tradeChartReady(m, 1)).toBe(false)
    })

    it('a stop or a target alone is not yet the levels', () => {
        const notReady = { view: { readiness: { ready: false, missing: ['target price'] } } }
        expect(tradeChartSetup(mentor({ ...notReady, draft: { ...SETUP, scenarios: [{ ...SCENARIO, target_legs: [] }] } }), 1, false)).toBeNull()
        expect(tradeChartSetup(mentor({ ...notReady, draft: { ...SETUP, scenarios: [{ ...SCENARIO, stop_legs: [{ price: null }] }] } }), 1, false)).toBeNull()
        expect(tradeChartSetup(mentor({ ...notReady, draft: { ...SETUP, scenarios: [{ ...SCENARIO, target_legs: [] }, { ...SCENARIO, stop_legs: [] }] } }), 1, false)).toBeNull()
    })

    it('the footer says which it is', () => {
        render(<MentorTradeChart setup={SETUP} ready={false} />)
        expect(screen.getByText('The levels so far.')).toBeTruthy()
        cleanup()
        render(<MentorTradeChart setup={SETUP} />)
        expect(screen.getByText('The plan as it will be generated.')).toBeTruthy()
    })

    it('anything else → nothing', () => {
        expect(tradeChartSetup(mentor(), 1, true)).toBeNull()                                                   // a turn is running
        expect(tradeChartSetup(mentor({ generated: { id: 'x' } }), 1, false)).toBeNull()                        // the Arm bar's turn
        expect(tradeChartSetup(mentor({ editing: { kind: 'setup', entityId: 's1' } }), 1, false)).toBeNull()    // an Update
        expect(tradeChartSetup(mentor({ draft: { ...SETUP, asset: '' } }), 1, false)).toBeNull()
        expect(tradeChartSetup(null, 1, false)).toBeNull()
    })

    it('the account the server lacked is marked now → lit, as the button is', () => {
        expect(tradeChartSetup(mentor({ view: { readiness: { ready: false, missing: ['trading account'] } } }), 1, false)).toBe(SETUP)
    })
})
