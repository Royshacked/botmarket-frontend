import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react'

vi.mock('../../services/hotlist/hotlist.service.remote.js', () => ({
    hotlistService: { getToday: vi.fn(), getBoard: vi.fn(), getOutcomes: vi.fn() },
}))

import { hotlistService } from '../../services/hotlist/hotlist.service.remote.js'
import { HotlistPanel, HOTLIST_PANEL_ID } from './HotlistPanel.jsx'
import { openPanel, closePanel, useActivePanel } from '../DetailPanel/detailPanel.store.js'

// The Hotlist panel (docs/design/daily-names.md §8; Roy, 2026-10-21): the screener's board with
// Argus's read on top, one row per name in play, a grade per column, and per row "Build with
// Mentor" / "Ask Argus" — one name at a time.

const BOARD = {
    id: 'hb_2026-10-21_mid', day: '2026-10-21', checkpoint: 'mid', status: 'done', columns: ['mid'],
    unverified: true, unverified_columns: ['mid'],
    regime: { breadth_above_sma20: 58, spy: { above_sma20: true } },
    argus: { summary: 'Breadth is fine; the room is in SPCX.', model: 'gpt-6-luna', picks: 1 },
    rows: [
        { symbol: 'SPCX', name: 'SpaceX', price: 162.77, gap_pct: 10.14, rvol: 3.39,
          catalyst: { material: true, type: 'drift', surprise: 'mixed', headline: 'SpaceX swings to profit' },
          cells: { mid: { grade: 'B', why: ['3.39× volume'], range: { level: 166.18, pct: 2.09, atr_mult: 0.45 } } },
          pick: { symbol: 'SPCX', column: 'mid', why: 'A real profit swing with room.', caution: 'Capex can cap it.', rank: 1 } },
        { symbol: 'TSLA', price: 450, gap_pct: 3.66, rvol: 1.31, catalyst: null,
          cells: { mid: { grade: 'C', range: { level: 451.4, pct: 0.31, atr_mult: 0.1 } } }, avoid: 'No catalyst, no room.' },
    ],
}
const EARLIER = { ...BOARD, id: 'hb_2026-10-21_premarket', checkpoint: 'premarket', columns: ['open', 'week'], argus: null,
    rows: [{ symbol: 'ABC', price: 104, gap_pct: 4, pm_vol_pct: 3, cells: { open: { grade: 'B', range: { pct: 1.9, atr_mult: 0.5 } }, week: { grade: null } } }] }

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })

function Probe() { return <span data-testid="active">{useActivePanel() ?? 'none'}</span> }

async function mount(props = {}) {
    const utils = render(<><HotlistPanel {...props} /><Probe /></>)
    act(() => openPanel(HOTLIST_PANEL_ID))
    await flush()
    return utils
}

beforeEach(() => {
    hotlistService.getToday.mockResolvedValue({ day: '2026-10-21', latest: BOARD, checkpoints: [
        { id: EARLIER.id, checkpoint: 'premarket' }, { id: BOARD.id, checkpoint: 'mid' }] })
    hotlistService.getBoard.mockResolvedValue(EARLIER)
})
afterEach(() => { cleanup(); act(() => closePanel()); vi.clearAllMocks() })

describe('HotlistPanel', () => {
    it('opens on the day\'s latest board: Argus\'s read on top, the regime, the unverified note', async () => {
        await mount()
        expect(screen.getByText('Breadth is fine; the room is in SPCX.')).toBeTruthy()
        expect(screen.getByText('Breadth 58%')).toBeTruthy()
        expect(screen.getByText(/SPY above its 20-day/)).toBeTruthy()
        expect(screen.getByText(/unverified/)).toBeTruthy()
        expect(screen.getByText(/not a target/)).toBeTruthy()
    })

    it('a row: Argus\'s star and note, the grade with its free range; a trap says avoid', async () => {
        await mount()
        expect(screen.getByTitle("Argus's pick #1").textContent).toBe('★1')
        expect(screen.getByText(/A real profit swing with room\./)).toBeTruthy()
        expect(screen.getByText(/Caution: Capex can cap it\./)).toBeTruthy()
        expect(screen.getByText('2.1% · 0.45× ATR')).toBeTruthy()
        expect(screen.getByText(/Argus — avoid:/)).toBeTruthy()
    })

    it('"Argus\'s picks only" narrows the board to the stars', async () => {
        await mount()
        fireEvent.click(screen.getByLabelText(/Argus’s picks only/))
        expect(screen.queryByText('TSLA')).toBeNull()
        expect(screen.getByText('SPCX')).toBeTruthy()
    })

    it('Build with Mentor hands the row, its column and the board on — and closes the panel first', async () => {
        const onBuild = vi.fn()
        await mount({ onBuild })
        const spcx = screen.getByText('SPCX').closest('tr')
        fireEvent.click(within(spcx).getByText('Build with Mentor'))
        expect(onBuild).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'SPCX' }), 'mid', expect.objectContaining({ id: BOARD.id }))
        expect(screen.getByTestId('active').textContent).toBe('none', 'Mentor is under the panel — the panel must be gone')
    })

    it('Ask Argus hands the row and its column on', async () => {
        const onAsk = vi.fn()
        await mount({ onAsk })
        fireEvent.click(within(screen.getByText('TSLA').closest('tr')).getByText('Ask Argus'))
        expect(onAsk).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'TSLA' }), 'mid', expect.anything())
    })

    it('the day\'s checkpoints switch the board', async () => {
        await mount()
        fireEvent.click(screen.getByRole('tab', { name: '08:00 pre-market' }))
        await flush()
        expect(hotlistService.getBoard).toHaveBeenCalledWith(EARLIER.id)
        expect(screen.getByText('ABC')).toBeTruthy()
        expect(screen.getByText('3.0%'), 'pre-market volume as % of a day').toBeTruthy()
    })

    it('a slow board read for a tab the user has left does not overwrite the one they switched to', async () => {
        const THIRD = { ...BOARD, id: 'hb_2026-10-21_eod', checkpoint: 'eod', columns: ['eod'], argus: null,
            rows: [{ symbol: 'LATE', price: 50, cells: { eod: { grade: 'A', range: { pct: 3, atr_mult: 1 } } } }] }
        hotlistService.getToday.mockResolvedValue({ day: '2026-10-21', latest: BOARD, checkpoints: [
            { id: EARLIER.id, checkpoint: 'premarket' }, { id: BOARD.id, checkpoint: 'mid' }, { id: THIRD.id, checkpoint: 'eod' }] })
        let release
        hotlistService.getBoard.mockImplementation(id => (id === EARLIER.id ? new Promise(r => { release = () => r(EARLIER) }) : Promise.resolve(THIRD)))
        await mount()
        fireEvent.click(screen.getByRole('tab', { name: '08:00 pre-market' }))
        fireEvent.click(screen.getByRole('tab', { name: '14:30' }))
        await flush()
        expect(screen.getByText('LATE')).toBeTruthy()
        await act(async () => { release(); await Promise.resolve() })
        expect(screen.getByText('LATE')).toBeTruthy()
        expect(screen.queryByText('ABC')).toBeNull()
    })

    it('an unknown SPY reading is not shown as "below"', async () => {
        hotlistService.getToday.mockResolvedValue({ day: '2026-10-21', latest: { ...BOARD, regime: { breadth_above_sma20: 58, spy: { above_sma20: null } } }, checkpoints: [] })
        await mount()
        expect(screen.queryByText(/SPY below/)).toBeNull()
        expect(screen.queryByText(/SPY above/)).toBeNull()
    })

    it('no board yet says when the boards come, not "nothing in play"', async () => {
        hotlistService.getToday.mockResolvedValue({ day: null, latest: null, checkpoints: [] })
        await mount()
        expect(screen.getByText(/No hotlist yet/)).toBeTruthy()
    })

    it('a failed read says so, with a retry', async () => {
        hotlistService.getToday.mockRejectedValueOnce(new Error('500'))
        await mount()
        expect(screen.getByText(/Couldn’t load the hotlist/)).toBeTruthy()
        fireEvent.click(screen.getByText('Try again'))
        await flush()
        expect(screen.getByText('Breadth is fine; the room is in SPCX.')).toBeTruthy()
    })
})
