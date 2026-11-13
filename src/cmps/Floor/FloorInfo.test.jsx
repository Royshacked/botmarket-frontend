import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'

vi.mock('../PriceChart/ChartSurface.jsx', () => ({ ChartSurface: () => null }))

import { FloorInfo } from './FloorInfo.jsx'
import { HOTLIST_PANEL_ID } from './HotlistPanel.jsx'
import { openPanel, closePanel } from '../DetailPanel/detailPanel.store.js'

// The Floor's right column (Roy, 2026-10-23): INFO — what is going on in the app, chat and lists. Since 2026-10-24 it
// explains the Hotlist's table while the Hotlist is open.

afterEach(() => { cleanup(); act(() => closePanel()) })

describe('FloorInfo', () => {
    it('is the Info column: its heading, and with Axl one step — "Ask Axl" (Roy, 2026-11-13)', () => {
        render(<FloorInfo />)
        expect(screen.getByRole('complementary', { name: 'Info' })).toBeTruthy()
        expect(screen.getByRole('heading', { name: 'Info' })).toBeTruthy()
        expect(screen.getByRole('region', { name: 'Talking with Axl' })).toBeTruthy()
        expect(screen.getByText('Ask Axl')).toBeTruthy()
    })

    it('with Mentor in the chat it says how a risk-based build works; the Hotlist, when open, comes first', () => {
        render(<FloorInfo floor="mentor" />)
        expect(screen.getByRole('heading', { name: 'How the trader builds a trade' })).toBeTruthy()
        expect(screen.queryByText(/what is going on in the app/i)).toBeNull()
        act(() => openPanel(HOTLIST_PANEL_ID))
        expect(screen.getByRole('heading', { name: 'The Hotlist' })).toBeTruthy()
        expect(screen.queryByRole('heading', { name: 'How the trader builds a trade' })).toBeNull()
    })

    it('another desk in the chat does not get it', () => {
        render(<FloorInfo floor="axl" />)
        expect(screen.queryByRole('heading', { name: 'How the trader builds a trade' })).toBeNull()
    })

    it('opens on the DIAGRAM of the flow, the step the user is on marked; the long copy waits behind "More" (one-axl.md §6)', () => {
        const mentor = { draft: { asset: 'NVDA', build: { active: 'NVDA', names: [{ asset: 'NVDA', settled: { direction: 'long', horizon: 'swing' } }] } } }
        const { container } = render(<FloorInfo floor="mentor" agentState={{ mentor }} />)
        expect(screen.getByRole('region', { name: 'Building a trade' })).toBeTruthy()
        expect(container.querySelector('[aria-current="step"]').textContent).toMatch(/^3Levelsyou are here$/)
        expect(container.querySelectorAll('.flow-diagram__step--done')).toHaveLength(2)
        expect(container.querySelector('details.floor-info__more > summary').textContent).toBe('More')
        act(() => openPanel(HOTLIST_PANEL_ID))
        expect(screen.getByRole('region', { name: 'From the Hotlist' })).toBeTruthy()
        expect(container.querySelector('[aria-current="step"]').textContent).toMatch(/^1Pick a horizon/)   // what is on screen, from its start
    })

    it('an open list owns Info — over a trade in progress, Positions shows Positions, then the trade again on close (Roy, 2026-11-13)', () => {
        const mentor = { draft: { asset: 'NVDA', build: { active: 'NVDA', names: [{ asset: 'NVDA', settled: { direction: 'long' } }] } } }
        render(<FloorInfo floor="mentor" agentState={{ mentor }} />)
        expect(screen.getByRole('region', { name: 'Building a trade' })).toBeTruthy()
        act(() => openPanel('floor:positions'))
        expect(screen.getByRole('region', { name: 'Positions' })).toBeTruthy()
        expect(screen.queryByRole('region', { name: 'Building a trade' })).toBeNull()
        expect(screen.queryByRole('heading', { name: 'How the trader builds a trade' })).toBeNull()
        act(() => closePanel('floor:positions'))
        expect(screen.getByRole('region', { name: 'Building a trade' })).toBeTruthy()
    })
    it('explains the Hotlist table while the Hotlist is open — and goes back when it closes', () => {
        render(<FloorInfo />)
        act(() => openPanel(HOTLIST_PANEL_ID))
        expect(screen.getByRole('heading', { name: 'The Hotlist' })).toBeTruthy()
        for (const col of ['Last', 'ATR%', 'Earn', 'Result', 'Target']) expect(screen.getByText(col, { selector: 'dt' })).toBeTruthy()
        // This week is the run-up rule since 2026-10-25, and the day trades say they were archived.
        expect(screen.getByRole('heading', { name: 'This week — the run-up rule' })).toBeTruthy()
        expect(screen.getByRole('heading', { name: 'The day trades' })).toBeTruthy()
        expect(screen.getByText('Catalyst read', { selector: 'dt' })).toBeTruthy()
        act(() => closePanel(HOTLIST_PANEL_ID))
        expect(screen.queryByRole('heading', { name: 'The Hotlist' })).toBeNull()
        expect(screen.getByText('Ask Axl')).toBeTruthy()
    })
})
