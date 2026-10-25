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
    it('is the Info column: its heading, and what it will hold', () => {
        render(<FloorInfo />)
        expect(screen.getByRole('complementary', { name: 'Info' })).toBeTruthy()
        expect(screen.getByRole('heading', { name: 'Info' })).toBeTruthy()
        expect(screen.getByText(/what is going on in the app, the chat and your lists/i)).toBeTruthy()
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
        expect(screen.getByText(/what is going on in the app/i)).toBeTruthy()
    })
})
