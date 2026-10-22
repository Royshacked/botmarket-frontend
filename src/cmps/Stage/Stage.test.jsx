import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

// The stage (docs/design/floor-stage.md; Roy, 2026-10-22): the right half of the chat column on the Floor. A list, an
// item opened from it, a desk's working surface, the chart — the most recent on top; closing it shows what was under it.

let handheld = false
vi.mock('../EntityCard/entityPopup.js', () => ({ isHandheld: () => handheld }))
// The live chart draws on a canvas — stand in for it; the stage only decides WHEN it shows.
vi.mock('../PriceChart/ChartSurface.jsx', () => ({
    ChartSurface: ({ ticker, onClose }) => <div className="chart-surface"><p>chart {ticker}</p><button type="button" onClick={onClose}>Close chart</button></div>,
}))

const { Stage } = await import('./Stage.jsx')
const { _resetStage, closeForHandOff } = await import('./stage.store.js')
const { DetailPanel } = await import('../DetailPanel/DetailPanel.jsx')
const { openPanel, closePanel } = await import('../DetailPanel/detailPanel.store.js')
const { openSurface, _resetSidePane } = await import('../SidePane/sidePane.store.js')
const { openChart, closeChart } = await import('../../services/chartSurface.service.js')

const Mentor = () => <p>mentor surface</p>
const surfaces = { mentor: Mentor }

function Floor() {
    return (
        <>
            <Stage session={{ floor: 'axl' }} surfaces={surfaces} />
            <DetailPanel id="floor:trade" title="Your trades" container compact>
                <p>the trades list</p>
                <button type="button" onClick={() => openPanel('setup:1')}>open the setup</button>
                <DetailPanel id="setup:1" title="NVDA setup"><p>the setup</p></DetailPanel>
            </DetailPanel>
        </>
    )
}

const top = () => [...document.querySelector('.stage').classList].find(c => c.startsWith('stage--'))

beforeEach(() => { handheld = false; _resetStage(); _resetSidePane(); closeChart() })
afterEach(() => { cleanup(); act(() => closePanel()) })

describe('Stage', () => {
    it('is empty — a placeholder — until something opens', () => {
        render(<Floor />)
        expect(top()).toBe('stage--empty')
        expect(screen.getByText(/Open a list from the strip/)).toBeTruthy()
    })

    it('list → its item → Mentor → a chart, each covering the last; closing steps back down the stack', () => {
        render(<Floor />)
        act(() => openPanel('floor:trade'))
        expect(top()).toBe('stage--panel')
        expect(screen.getByText('the trades list')).toBeTruthy()

        fireEvent.click(screen.getByRole('button', { name: 'open the setup' }))
        expect(screen.getByText('the setup')).toBeTruthy()

        act(() => openSurface('mentor'))
        expect(top()).toBe('stage--surface')
        expect(screen.getByText('mentor surface')).toBeTruthy()
        expect(screen.getByText('the setup'), 'the item stays mounted under Mentor').toBeTruthy()

        act(() => { openChart({ ticker: 'AAPL' }) })
        expect(top()).toBe('stage--chart')

        fireEvent.click(screen.getByRole('button', { name: 'Close chart' }))
        expect(top(), 'chart closed → back to Mentor').toBe('stage--surface')

        // Esc reaches the layer on screen (Mentor), not the item under it.
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(top(), 'Mentor closed → back to the item').toBe('stage--panel')
        expect(screen.getByText('the setup')).toBeTruthy()

        fireEvent.keyDown(document, { key: 'Escape' })
        expect(screen.getByText('the trades list'), 'the item closed → back to the list').toBeTruthy()
        expect(screen.queryByText('the setup')).toBeNull()

        fireEvent.keyDown(document, { key: 'Escape' })
        expect(top()).toBe('stage--empty')
    })

    it('a list opened while Mentor shows covers Mentor; Mentor coming back covers the list', () => {
        render(<Floor />)
        act(() => openSurface('mentor'))
        act(() => openPanel('floor:trade'))
        expect(top()).toBe('stage--panel')
        act(() => openSurface('mentor'))
        expect(top(), 'already open — nothing changes').toBe('stage--panel')
    })

    it('a chart asked for again comes back to the front', () => {
        render(<Floor />)
        act(() => { openChart({ ticker: 'AAPL' }) })
        act(() => openPanel('floor:trade'))
        expect(top()).toBe('stage--panel')
        act(() => { openChart({ ticker: 'AAPL' }) })
        expect(top()).toBe('stage--chart')
        expect(screen.getByText('chart AAPL')).toBeTruthy()
    })

    it('only the layer on top is shown; the rest stay mounted', () => {
        render(<Floor />)
        act(() => openPanel('floor:trade'))
        act(() => openSurface('mentor'))
        const css = document.querySelector('.stage')
        expect(css.querySelector('.stage__layer--panel .detail-panel')).toBeTruthy()
        expect(css.className).toContain('stage--surface')
    })

    it('Esc closes the chart when it is on top — and only then', () => {
        render(<Floor />)
        act(() => openPanel('floor:trade'))
        act(() => { openChart({ ticker: 'AAPL' }) })
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(top(), 'the chart closed, the list is back').toBe('stage--panel')
        expect(screen.getByText('the trades list')).toBeTruthy()
    })

    // Build with Mentor from a list: Mentor's surface covers the list, and closing it comes back to it (Roy, 2026-10-22).
    it('a hand-off from a list keeps the list under the desk it hands to', () => {
        render(<Floor />)
        act(() => openPanel('floor:trade'))
        act(() => { closeForHandOff(() => closePanel()); openSurface('mentor') })
        expect(top()).toBe('stage--surface')
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(top()).toBe('stage--panel')
        expect(screen.getByText('the trades list')).toBeTruthy()
    })

    it('without a stage (another design, a phone) a hand-off closes the panel, as before', () => {
        let closed = false
        closeForHandOff(() => { closed = true })
        expect(closed, 'nothing mounted → no stage → close').toBe(true)
        handheld = true
        render(<Floor />)
        closed = false
        closeForHandOff(() => { closed = true })
        expect(closed, 'a phone has no stage on screen').toBe(true)
    })

    it('a whole list takes the stage\'s width; an item keeps its reading measure', () => {
        render(<Floor />)
        act(() => openPanel('floor:trade'))
        expect(document.querySelector('.detail-panel').className).toContain('detail-panel--list')
        fireEvent.click(screen.getByRole('button', { name: 'open the setup' }))
        expect(document.querySelector('.detail-panel').className).not.toContain('detail-panel--list')
    })

    it('on a handheld the stage decides nothing — no layer is "covered"', () => {
        handheld = true
        render(<Floor />)
        act(() => openPanel('floor:trade'))
        act(() => openSurface('mentor'))
        // Both open as before (a page and a sheet), and Esc closes the last opened — the sheet.
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(screen.queryByText('mentor surface')).toBeNull()
        expect(screen.getByText('the trades list')).toBeTruthy()
    })
})

