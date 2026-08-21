import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, screen, act } from '@testing-library/react'
import { ChatChartDock } from './ChatChartDock.jsx'
import { openChart, closeChart, currentChart } from '../services/chartSurface.service.js'
import { buildStreamHandlers } from '../services/sse.util.js'

// KLineCharts wants a real canvas and PriceChart fetches its own candles — neither belongs in a unit
// test of the dock. Stand in for it, and assert the dock hands it the right symbol/interval.
vi.mock('./PriceChart/PriceChart.jsx', () => ({
    PriceChart: ({ symbol, interval }) => <div data-testid="price-chart" data-symbol={symbol} data-interval={interval} />,
}))

// The dock: the chart a user asked for, pinned above the input in every chat, with collapse + close.
// What's pinned here is the property that makes it free for a new agent — it takes NO props, so a
// surface gets a docked chart by rendering one tag, and the `chart` stream event reaches it with no
// panel wiring at all.

afterEach(() => { cleanup(); closeChart() })

describe('ChatChartDock', () => {
    it('renders nothing until a chart is asked for', () => {
        const { container } = render(<ChatChartDock />)
        expect(container.innerHTML).toBe('')
    })

    it('docks the live chart for the requested symbol and timeframe', () => {
        render(<ChatChartDock />)
        act(() => { openChart({ symbol: 'SPY', timeframe: 'day' }) })

        const chart = screen.getByTestId('price-chart')
        expect(chart.getAttribute('data-symbol')).toBe('SPY')
        expect(chart.getAttribute('data-interval')).toBe('day')
    })

    it('the `chart` stream event docks it with NO callback wired', () => {
        // This is the "a new agent costs nothing" guarantee: the live payload goes through the shared
        // handler builder into the store, so no panel passes a chart prop or a chart callback.
        render(<ChatChartDock />)
        act(() => { buildStreamHandlers({}).chart({ symbol: 'nvda', timeframe: '4hr', live: true }) })
        expect(screen.getByTestId('price-chart').getAttribute('data-symbol')).toBe('NVDA')
    })

    it("an agent's still image is NOT docked — it belongs to its turn in the thread", () => {
        const seen = []
        render(<ChatChartDock />)
        act(() => { buildStreamHandlers({ onChart: d => seen.push(d) }).chart({ symbol: 'NVDA', imageBase64: 'AAA' }) })

        expect(seen).toHaveLength(1)
        expect(currentChart()).toBe(null)
        expect(screen.queryByTestId('price-chart')).toBeNull()
    })

    it('collapse leaves a labelled bar, and restoring brings the same chart back', () => {
        render(<ChatChartDock />)
        act(() => { openChart({ symbol: 'SPY', timeframe: '1hr' }) })

        act(() => { screen.getByLabelText('Collapse the chart').click() })
        expect(screen.queryByTestId('price-chart')).toBeNull()
        expect(screen.getByText('SPY · 1HR')).toBeTruthy()
        expect(currentChart().ticker).toBe('SPY', 'collapsed is not closed — the chart is still docked')

        act(() => { screen.getByTitle('Show the chart').click() })
        expect(screen.getByTestId('price-chart').getAttribute('data-symbol')).toBe('SPY')
    })

    it('close empties the dock AND the shared store — not just this view', () => {
        render(<ChatChartDock />)
        act(() => { openChart({ symbol: 'SPY', timeframe: 'day' }) })
        act(() => { screen.getByLabelText('Close the chart').click() })

        expect(screen.queryByTestId('price-chart')).toBeNull()
        expect(currentChart()).toBe(null)
    })

    it('closing from the COLLAPSED bar works too', () => {
        render(<ChatChartDock />)
        act(() => { openChart({ symbol: 'SPY', timeframe: 'day' }) })
        act(() => { screen.getByLabelText('Collapse the chart').click() })
        act(() => { screen.getByLabelText('Close the chart').click() })

        expect(currentChart()).toBe(null)
        expect(screen.queryByText(/SPY/)).toBeNull()
    })

    it('a new request re-expands a collapsed dock — asking to see it means seeing it', () => {
        render(<ChatChartDock />)
        act(() => { openChart({ symbol: 'SPY', timeframe: 'day' }) })
        act(() => { screen.getByLabelText('Collapse the chart').click() })
        act(() => { openChart({ symbol: 'NVDA', timeframe: '4hr' }) })

        expect(screen.getByTestId('price-chart').getAttribute('data-symbol')).toBe('NVDA')
    })

    it('a request for what is ALREADY docked leaves a collapsed dock collapsed', () => {
        // Models do re-emit the chart tag while answering something else. Having the chart pop back
        // open on every such turn is worse than the stray request.
        render(<ChatChartDock />)
        act(() => { openChart({ symbol: 'SPY', timeframe: 'day' }) })
        act(() => { screen.getByLabelText('Collapse the chart').click() })
        act(() => { openChart({ symbol: 'SPY', timeframe: 'day' }) })

        expect(screen.queryByTestId('price-chart')).toBeNull()
        expect(screen.getByText('SPY · DAY')).toBeTruthy()
    })

    it('but re-asking after a CLOSE opens it again, even for the same view', () => {
        render(<ChatChartDock />)
        act(() => { openChart({ symbol: 'SPY', timeframe: 'day' }) })
        act(() => { screen.getByLabelText('Collapse the chart').click() })
        act(() => { screen.getByLabelText('Close the chart').click() })
        act(() => { openChart({ symbol: 'SPY', timeframe: 'day' }) })

        expect(screen.getByTestId('price-chart').getAttribute('data-symbol')).toBe('SPY')
    })

    // Collapsing swaps a big element for a small one in a different corner, so the fold is played by
    // a leftover frame — the chart is unmounted immediately (it must stop polling the moment you
    // hide it) and the empty frame shrinks in its place. It has to clean itself up.
    it('collapsing leaves a frame folding into the corner, and takes it away when it lands', () => {
        vi.useFakeTimers()
        try {
            render(<ChatChartDock />)
            act(() => { openChart({ symbol: 'SPY', timeframe: 'day' }) })
            act(() => { screen.getByLabelText('Collapse the chart').click() })

            expect(document.querySelector('.chat-chart-dock--folding')).toBeTruthy()
            expect(screen.queryByTestId('price-chart')).toBeNull()

            act(() => { vi.runAllTimers() })
            expect(document.querySelector('.chat-chart-dock--folding')).toBeNull()
            expect(screen.getByText('SPY · DAY')).toBeTruthy()
        } finally {
            vi.useRealTimers()
        }
    })

    // The fold outlives the click that started it, so a Close landing inside that window used to
    // leave a pending timer and a collapsed flag for the NEXT chart to inherit.
    it('closing mid-fold does not leave the next chart born collapsed', () => {
        vi.useFakeTimers()
        try {
            render(<ChatChartDock />)
            act(() => { openChart({ symbol: 'SPY', timeframe: 'day' }) })
            act(() => { screen.getByLabelText('Collapse the chart').click() })
            act(() => { screen.getByLabelText('Close the chart').click() })
            act(() => { openChart({ symbol: 'SPY', timeframe: 'day' }) })
            act(() => { vi.runAllTimers() })

            expect(screen.getByTestId('price-chart').getAttribute('data-symbol')).toBe('SPY')
            expect(document.querySelector('.chat-chart-dock--folding')).toBeNull()
        } finally {
            vi.useRealTimers()
        }
    })

    // ON A PHONE THE CHART COULD NOT BE CLOSED AT ALL. The toolbar's nine controls came to 438px as
    // flat siblings; a docked chart is 320-408px wide on a phone and the dock clips (overflow: hidden,
    // for the corner radius), so the strip overflowed and the LAST item was cut off entirely — Close,
    // at every common phone width. Worse, the ✕ still on screen was the drawing group's clear-all,
    // which does nothing on a chart nobody has drawn on, so it read as a dead button rather than a
    // missing one.
    //
    // The fix is which controls are allowed to run out of room, and that is STRUCTURAL: the drawing
    // tools live in a group that scrolls, and Hide/Close sit outside it and never shrink. jsdom has
    // no layout engine, so what is pinned here is that structure — put Close back inside the
    // scrolling group and the phone loses its close button again, silently and with every test green.
    it('keeps Close out of the group that is allowed to overflow', () => {
        render(<ChatChartDock />)
        act(() => { openChart({ symbol: 'SPY', timeframe: 'day' }) })

        const tools = document.querySelector('.chart-surface__tools')
        expect(tools).toBeTruthy()                                  // the group exists at all
        expect(tools.querySelector('.chart-surface__tool')).toBeTruthy()   // …and holds the drawing tools

        for (const label of ['Close the chart', 'Collapse the chart']) {
            expect(tools.contains(screen.getByLabelText(label))).toBe(false)
        }
    })

    it('a late mount picks up the already-docked chart instead of losing it', () => {
        // Switching agent tabs unmounts one dock and mounts another; the chart must survive the trip.
        act(() => { openChart({ symbol: 'SPY', timeframe: 'day' }) })
        render(<ChatChartDock />)
        expect(screen.getByTestId('price-chart').getAttribute('data-symbol')).toBe('SPY')
    })
})
