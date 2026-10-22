import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react'

vi.mock('../../services/hotlist/hotlist.service.remote.js', () => ({
    hotlistService: { getToday: vi.fn(), getBoard: vi.fn(), getOutcomes: vi.fn() },
}))

import { hotlistService } from '../../services/hotlist/hotlist.service.remote.js'
import { HotlistPanel, HOTLIST_PANEL_ID, WORKING_POLL_MS } from './HotlistPanel.jsx'
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

    // ─── The screener at work (Roy, 2026-10-22: "an indication in the UI that it is running") ───

    it('a row with saved closes gets its sparkline, with the room overhead in its label; a row without gets none', async () => {
        const spcx = { ...BOARD.rows[0], spark: [150, 151, 149, 152, 148] }
        hotlistService.getToday.mockResolvedValue({ day: '2026-10-21', latest: { ...BOARD, rows: [spcx, BOARD.rows[1]] }, checkpoints: [] })
        await mount()
        const chart = within(screen.getByText('SPCX').closest('tr')).getByRole('img')
        expect(chart.getAttribute('aria-label')).toBe('Last 5 sessions: +8.5% — room to 166.18')
        expect(chart.querySelector('.hot-spark__level')).toBeTruthy()
        expect(within(screen.getByText('TSLA').closest('tr')).queryByRole('img')).toBeNull()
    })

    it('the overnight pass shows as running, with its count, over the empty note', async () => {
        hotlistService.getToday.mockResolvedValue({ day: null, latest: null, checkpoints: [],
            working: { kind: 'overnight', day: '2026-10-21', started_at: Date.now(), done: 430, of: 1512 }, stats: null })
        await mount()
        expect(screen.getByRole('status').textContent).toMatch(/Preparing the screener’s stats from .*’s close — 430 of 1,512 names/)
        expect(screen.getByText(/No hotlist yet/)).toBeTruthy()
        expect(screen.queryByText(/Stats ready/)).toBeNull()
    })

    it('a checkpoint building its board shows over the board already up', async () => {
        hotlistService.getToday.mockResolvedValue({ day: '2026-10-21', latest: BOARD, checkpoints: [],
            working: { kind: 'board', checkpoint: 'eod', started_at: Date.now() } })
        await mount()
        expect(screen.getByRole('status').textContent).toMatch(/Building the 14:30 board/)
        expect(screen.getByText('SPCX')).toBeTruthy()
    })

    it('stats ready, no board yet: says how many names, and when the boards come', async () => {
        hotlistService.getToday.mockResolvedValue({ day: null, latest: null, checkpoints: [], working: null,
            stats: { day: '2026-10-21', status: 'done', written: 1432, finished_at: Date.now() } })
        await mount()
        expect(screen.getByText(/Stats ready: 1,432 names/)).toBeTruthy()
        expect(screen.queryByRole('status')).toBeNull()
    })

    it('while it works the panel looks again quietly, takes the first board, and stops once nothing runs', async () => {
        vi.useFakeTimers()
        try {
            hotlistService.getToday.mockResolvedValueOnce({ day: null, latest: null, checkpoints: [],
                working: { kind: 'board', checkpoint: 'premarket', started_at: Date.now() } })
            hotlistService.getToday.mockResolvedValue({ day: '2026-10-21', latest: BOARD, checkpoints: [{ id: BOARD.id, checkpoint: 'mid' }], working: null })
            await mount()
            expect(screen.getByText(/No hotlist yet/)).toBeTruthy()
            await act(async () => { vi.advanceTimersByTime(WORKING_POLL_MS) })
            await flush()
            expect(screen.queryByText('Loading…')).toBeNull()
            expect(screen.getByText('SPCX')).toBeTruthy()
            expect(screen.queryByRole('status')).toBeNull()
            await act(async () => { vi.advanceTimersByTime(WORKING_POLL_MS * 3) })
            expect(hotlistService.getToday).toHaveBeenCalledTimes(2)
        } finally {
            vi.useRealTimers()
        }
    })
})

// Today's list — the watchlist view (Roy, 2026-10-22).
const DAY_LIST = [
    { symbol: 'SPCX', name: 'SpaceX', price: 162.77, gap_pct: 10.14, rvol: 3.39, atr_pct: 5.2, status: 'in_play', first_seen: 'mid', seen: ['mid'],
      board: 'hb_2026-10-21_mid', cell_board: { mid: 'hb_2026-10-21_mid' }, quoted_at: Date.parse('2026-10-21T14:31:00Z'),
      catalyst: { material: true, type: 'drift', surprise: 'mixed', headline: 'SpaceX swings to profit' },
      cells: { mid: { grade: 'B', why: ['3.39× normal volume, above the open'], range: { level: 166.18, pct: 2.09, atr_mult: 0.45 } } },
      pick: { symbol: 'SPCX', column: 'mid', why: 'A real profit swing with room.', rank: 1 } },
    { symbol: 'DXC', price: 20.5, gap_pct: 0.4, pm_vol_pct: 0.8, atr_pct: 3.1, status: 'setting_up', first_seen: 'premarket', seen: ['premarket', 'mid'],
      board: 'hb_2026-10-21_mid', cell_board: { week: 'hb_2026-10-21_premarket' }, next_earnings: '2026-10-29',
      cells: { week: { grade: 'B', path: 'scheduled', exit_before: '2026-10-29', why: ['NR7 · RS +40.9 vs SPY (20d) · earnings in 7 days — a run-up: out before the report'], range: { level: 22, pct: 7.3, atr_mult: 2.3 } } } },
    { symbol: 'ACC', price: 55, gap_pct: 1.2, atr_pct: 2.6, status: 'building', first_seen: 'premarket', seen: ['premarket'],
      board: 'hb_2026-10-21_premarket', cell_board: { week: 'hb_2026-10-21_premarket' },
      cells: { week: { grade: 'A', path: 'accumulation', why: ['near the 20-day high · RS +5 vs SPY (20d) · volume 1.8× its 50-day pace (5d)'], range: { open_sky: true } } } },
]

describe('HotlistPanel — today\'s list', () => {
    beforeEach(() => {
        hotlistService.getToday.mockResolvedValue({ day: '2026-10-21', latest: BOARD, dayList: DAY_LIST, checkpoints: [
            { id: EARLIER.id, checkpoint: 'premarket' }, { id: BOARD.id, checkpoint: 'mid' }] })
    })
    const order = () => [...document.querySelectorAll('tr.hot-row')].map(tr => tr.dataset.symbol)

    it('opens on the day\'s list: every name once, its status and why in plain words, prices marked as of the checkpoint', async () => {
        await mount()
        expect(screen.getByRole('tab', { name: 'Today’s list' }).getAttribute('aria-selected')).toBe('true')
        expect(order()).toEqual(['SPCX', 'ACC', 'DXC'], 'in play, building, setting up')
        const dxc = screen.getByText('DXC').closest('tr')
        expect(within(dxc).getByText('Setting up')).toBeTruthy()
        expect(within(dxc).getByText(/earnings in 7 days — a run-up: out before the report/)).toBeTruthy()
        expect(within(dxc).getByText('E 10-29 · out before')).toBeTruthy()
        expect(within(dxc).getByText('since 08:00')).toBeTruthy()
        expect(screen.getByText(/Prices as of each name’s last checkpoint/)).toBeTruthy()
        expect(screen.getByText('Breadth is fine; the room is in SPCX.')).toBeTruthy()
    })

    it('the status filter narrows the list, with counts', async () => {
        await mount()
        fireEvent.click(screen.getByRole('button', { name: 'Building 1' }))
        expect(order()).toEqual(['ACC'])
        fireEvent.click(screen.getByRole('button', { name: 'All 3' }))
        expect(order()).toHaveLength(3)
    })

    it('a header sorts; a second click flips it', async () => {
        await mount()
        fireEvent.click(screen.getByRole('button', { name: 'Price' }))
        expect(order()).toEqual(['SPCX', 'ACC', 'DXC'])
        fireEvent.click(screen.getByRole('button', { name: /Price/ }))
        expect(order()).toEqual(['DXC', 'ACC', 'SPCX'])
        expect(screen.getByRole('button', { name: /Price/ }).closest('th').getAttribute('aria-sort')).toBe('ascending')
    })

    it('Build with Mentor references the board the best cell LIVES on, not the latest board', async () => {
        const onBuild = vi.fn()
        await mount({ onBuild })
        fireEvent.click(within(screen.getByText('DXC').closest('tr')).getByRole('button', { name: 'Build with Mentor' }))
        expect(onBuild).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'DXC' }), 'week', { id: 'hb_2026-10-21_premarket' })
        expect(screen.getByTestId('active').textContent).toBe('none')
    })

    it('Boards switches to one checkpoint\'s board, with its tabs', async () => {
        await mount()
        fireEvent.click(screen.getByRole('tab', { name: 'Boards' }))
        expect(screen.getByRole('tab', { name: '10:30' })).toBeTruthy()
        expect(screen.queryByText('DXC')).toBeNull()
        expect(screen.getByText('TSLA')).toBeTruthy()
    })
})
