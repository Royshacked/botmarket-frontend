import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react'

// The live chart draws on a canvas — stand in for it; the panel only decides WHEN it shows, and on what.
vi.mock('../PriceChart/ChartSurface.jsx', () => ({
    ChartSurface: ({ ticker, timeframe, onClose }) => <div className="chart-surface"><p>chart {ticker} {timeframe}</p><button type="button" onClick={onClose}>Close chart</button></div>,
}))

vi.mock('../../services/hotlist/hotlist.service.remote.js', () => ({
    hotlistService: { getToday: vi.fn(), getBoard: vi.fn(), getOutcomes: vi.fn(), getReads: vi.fn(), requestRead: vi.fn(), getBook: vi.fn() },
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
    hotlistService.getReads.mockResolvedValue([])
    hotlistService.getOutcomes.mockResolvedValue({})
    hotlistService.getBook.mockResolvedValue(null)
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

    it('opens on the day\'s list: one line per name — numbers in columns, the words only when opened', async () => {
        await mount()
        expect(screen.getByRole('tab', { name: 'Today’s list' }).getAttribute('aria-selected')).toBe('true')
        expect(order()).toEqual(['SPCX', 'ACC', 'DXC'], 'in play, building, setting up')
        const dxc = screen.getByText('DXC').closest('tr')
        const cells = [...dxc.querySelectorAll('td')].map(td => td.textContent)
        expect(cells.slice(3)).toEqual(['20.50', '+0.4%', '0.8%', '3.1%', 'Setting', 'This week B', '7.3% 2.30×', '10-29!', '—'], 'the result: none on a row the server sent without one')
        expect(screen.queryByText(/earnings in 7 days/)).toBeNull()
        expect(screen.getByText(/Prices as of each name’s last checkpoint/)).toBeTruthy()
        expect(screen.getByText('Breadth is fine; the room is in SPCX.')).toBeTruthy()
    })

    it('a click on the row opens its detail: the reason, the run-up warning, when it was listed — one row at a time', async () => {
        await mount()
        fireEvent.click(screen.getByText('DXC').closest('tr').querySelector('td:nth-child(4)'))
        expect(screen.getByText(/earnings in 7 days — a run-up: out before the report/)).toBeTruthy()
        expect(screen.getByText(/a run-up into the report: be out before it/)).toBeTruthy()
        expect(screen.getByText(/listed at 08:00, 10:30/)).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Hide DXC details' }).getAttribute('aria-expanded')).toBe('true')
        fireEvent.click(screen.getByRole('button', { name: 'Show SPCX details' }))
        expect(screen.queryByText(/earnings in 7 days/)).toBeNull()
        expect(screen.getByText(/A real profit swing with room\./)).toBeTruthy()
    })

    // Roy, 2026-10-22: a symbol on the hotlist shows its DAILY chart — in the window, which covers the chat.
    it('with no caller handler, a symbol opens its daily chart in the window; Back returns to the list', async () => {
        await mount()
        fireEvent.click(screen.getByRole('button', { name: 'DXC' }))
        expect(screen.getByText('chart DXC day')).toBeTruthy()
        expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('DXC · daily')
        expect(screen.queryByRole('button', { name: 'SPCX' }), 'the table gave way to the chart').toBeNull()
        fireEvent.click(screen.getByRole('button', { name: '‹ Back to the list' }))
        expect(screen.getByRole('button', { name: 'SPCX' })).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'SPCX' }))
        fireEvent.click(screen.getByRole('button', { name: 'Close chart' }))
        expect(screen.queryByText(/^chart /), 'the chart own Close goes back too').toBeNull()
    })

    it('the symbol opens the chart, not the detail', async () => {
        const onSymbolClick = vi.fn()
        await mount({ onSymbolClick })
        fireEvent.click(screen.getByRole('button', { name: 'DXC' }))
        expect(onSymbolClick).toHaveBeenCalledWith('DXC')
        expect(screen.queryByText(/earnings in 7 days/)).toBeNull()
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
        fireEvent.click(screen.getByRole('button', { name: 'Last' }))
        expect(order()).toEqual(['SPCX', 'ACC', 'DXC'])
        fireEvent.click(screen.getByRole('button', { name: /Last/ }))
        expect(order()).toEqual(['DXC', 'ACC', 'SPCX'])
        expect(screen.getByRole('button', { name: /Last/ }).closest('th').getAttribute('aria-sort')).toBe('ascending')
        fireEvent.click(screen.getByRole('button', { name: 'ATR%' }))
        expect(order()).toEqual(['SPCX', 'DXC', 'ACC'])
    })

    it('Build with Mentor references the board the best cell LIVES on, not the latest board', async () => {
        const onBuild = vi.fn()
        await mount({ onBuild })
        fireEvent.click(screen.getByRole('button', { name: 'Show DXC details' }))
        fireEvent.click(within(document.getElementById('hot-detail-DXC')).getByRole('button', { name: 'Build with Mentor' }))
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

// A list per horizon, and Prometheus's catalyst targets on This week (docs/design/horizon-chains.md §1, §3; 2026-10-23).
describe('HotlistPanel — a list per horizon', () => {
    const H_LIST = [
        { symbol: 'OPN', price: 10, status: 'in_play', cells: { open: { grade: 'A', range: { pct: 2, atr_mult: 0.5 } } }, picks: { open: { why: 'the open trade', rank: 1 } } },
        { symbol: 'WK2', price: 20, status: 'setting_up', cells: { week: { grade: 'A', range: { open_sky: true } } }, picks: { week: { why: 'second week pick', rank: 2 } } },
        { symbol: 'WK1', price: 30, status: 'building', cells: { week: { grade: 'C', range: { pct: 4, atr_mult: 1, level: 31 } } }, picks: { week: { why: 'first week pick', caution: 'thin', rank: 1 } } },
        { symbol: 'WK3', price: 40, status: 'setting_up', cells: { week: { grade: 'B', range: { pct: 6, atr_mult: 2, level: 42 } } } },
    ]
    const READ = { id: 'cr_WK1', symbol: 'WK1', status: 'active', verdict: 'credible', set_at: '2026-10-23T13:30:00Z', valid_until: '2026-11-06T13:30:00Z',
        read: 'A real contract, two thirds still open.', news_driven: true, event_risk: ['Q3 report 2026-10-29 — out before it'], kill: ['the contract is cut'],
        target: { value: 31.5, low: 30.9, high: 32.1, open_pct: 5, worth_pct: 8, moved_pct: 3, priced_share: 0.38 } }

    beforeEach(() => {
        hotlistService.getToday.mockResolvedValue({ day: '2026-10-23', latest: { ...BOARD, argus: null }, dayList: H_LIST, checkpoints: [] })
        hotlistService.getReads.mockResolvedValue([READ])
    })
    const order = () => [...document.querySelectorAll('tr.hot-row')].map(tr => tr.dataset.symbol)

    it('a tab per horizon with its count; a horizon lists its names, Argus\'s picks for it first in his order', async () => {
        await mount()
        const tabs = within(screen.getByRole('group', { name: 'Horizon' })).getAllByRole('button').map(t => t.textContent)
        expect(tabs).toEqual(['All 4', 'Open 1', 'Mid-day 0', 'Into close 0', 'Tomorrow 0', 'This week 3', 'Swing 0', 'Long term 0'])
        expect(screen.getByRole('button', { name: 'Mid-day 0' }).disabled).toBe(true)
        fireEvent.click(screen.getByRole('button', { name: 'This week 3' }))
        expect(order()).toEqual(['WK1', 'WK2', 'WK3'], 'his picks in his order, then the grade')
        const wk1 = screen.getByText('WK1').closest('tr')
        expect(wk1.querySelector('.hot-star').textContent).toBe('★1')
        expect(wk1.textContent).toMatch(/This week C/)
        fireEvent.click(screen.getByRole('button', { name: 'Open 1' }))
        expect(order()).toEqual(['OPN'])
    })

    it('This week shows Prometheus\'s catalyst target and what is still open; the opened row carries his read', async () => {
        await mount()
        fireEvent.click(screen.getByRole('button', { name: 'This week 3' }))
        expect(screen.getByRole('columnheader', { name: 'Target' })).toBeTruthy()
        const wk1 = screen.getByText('WK1').closest('tr')
        expect(wk1.querySelector('.hot-target').textContent).toBe('31.50 · +5.0%')
        expect(screen.getByText('WK3').closest('tr').querySelector('.hot-target').textContent).toBe('—')
        fireEvent.click(wk1.querySelector('td:nth-child(4)'))
        expect(screen.getByText(/first week pick/)).toBeTruthy()
        expect(screen.getByText('A real contract, two thirds still open.')).toBeTruthy()
        expect(screen.getByText(/Inside the window: Q3 report 2026-10-29/)).toBeTruthy()
        // Off the week tab, no Target column.
        fireEvent.click(screen.getByRole('button', { name: 'All 4' }))
        expect(screen.queryByRole('columnheader', { name: 'Target' })).toBeNull()
    })
})

// The code review of 2026-10-24 on the horizon lists, and the "Catalyst read" a user asks for (horizon-chains.md §3).
describe('HotlistPanel — the horizon lists, reviewed', () => {
    const DAY = '2026-10-23'
    const LIST = [
        { symbol: 'OPN', price: 10, status: 'in_play', cells: { open: { grade: 'A', range: { pct: 2, atr_mult: 0.5 } } } },
        // Graded A for the open but C for the week: on This week it sorts as the C it shows.
        { symbol: 'MIX', price: 15, status: 'in_play', cells: { open: { grade: 'A', range: { pct: 2, atr_mult: 0.5 } }, week: { grade: 'C', range: { pct: 1, atr_mult: 0.3 } } } },
        { symbol: 'WK1', price: 30, status: 'setting_up', cells: { week: { grade: 'B', range: { pct: 4, atr_mult: 1 } } }, picks: { week: { why: 'the pick', rank: 1 } } },
        { symbol: 'WK3', price: 40, status: 'setting_up', board: `hb_${DAY}_mid`, cell_board: { week: `hb_${DAY}_preopen` },
          cells: { week: { grade: 'A', range: { pct: 6, atr_mult: 2 } } } },
    ]
    beforeEach(() => {
        hotlistService.getToday.mockResolvedValue({ day: DAY, latest: { ...BOARD, argus: null }, dayList: LIST, checkpoints: [] })
    })
    const order = () => [...document.querySelectorAll('tr.hot-row')].map(tr => tr.dataset.symbol)
    const week = () => fireEvent.click(screen.getByRole('button', { name: /^This week/ }))

    it('a target with one end of its band does not break the list', async () => {
        hotlistService.getReads.mockResolvedValue([{ id: 'r', symbol: 'WK1', status: 'active', verdict: 'credible', valid_until: '2026-10-26T21:00:00Z',
            target: { value: 31, low: 30.5, high: null, open_pct: 3, basis: 'run_up' }, runup: { n: 8 } }])
        await mount()
        week()
        const wk1 = screen.getByText('WK1').closest('tr')
        expect(wk1.querySelector('.hot-target').textContent).toBe('31.00 · +3.0%')
        fireEvent.click(wk1.querySelector('td:nth-child(4)'))
        const read = document.querySelector('.hot-read').textContent
        expect(read).toMatch(/target 31\.00/)
        expect(read).not.toMatch(/30\.50–/)
    })

    it("a settled read from another day's board is not shown as today's target", async () => {
        hotlistService.getReads.mockResolvedValue([
            { id: 'old', symbol: 'WK3', status: 'expired', verdict: 'credible', set_at: '2026-10-12T13:30:00Z', context: { day: '2026-10-12' }, target: { value: 50, open_pct: 4 } },
            { id: 'today', symbol: 'WK1', status: 'pass', verdict: 'unclear', pass_reason: 'unclear', set_at: `${DAY}T13:30:00Z`, context: { day: DAY } },
        ])
        await mount()
        week()
        expect(screen.getByText('WK3').closest('tr').querySelector('.hot-target').textContent).toBe('—')
        expect(screen.getByText('WK1').closest('tr').querySelector('.hot-target').textContent).toBe('pass')
    })

    it("a horizon's Grade sort is that horizon's grade; a new tab opens in Argus's order; a third click restores it", async () => {
        await mount()
        week()
        expect(order()).toEqual(['WK1', 'WK3', 'MIX'], "Argus's pick first, then the grade")
        const grade = () => fireEvent.click(screen.getByRole('button', { name: /^Grade/ }))
        grade()
        expect(order()).toEqual(['WK3', 'WK1', 'MIX'], 'A, B, C — the week grades, not MIX\'s open A')
        grade(); grade()
        expect(order()).toEqual(['WK1', 'WK3', 'MIX'], 'third click: back to his order')
        grade()
        fireEvent.click(screen.getByRole('button', { name: /^Open/ }))
        fireEvent.click(screen.getByRole('button', { name: /^This week/ }))
        expect(order()).toEqual(['WK1', 'WK3', 'MIX'], 'the last tab\'s sort does not follow')
    })

    it('the horizon counts follow the status filter, and an emptied horizon falls back to All', async () => {
        await mount()
        fireEvent.click(screen.getByRole('button', { name: /^Setting up/ }))
        const group = within(screen.getByRole('group', { name: 'Horizon' }))
        expect(group.getAllByRole('button').map(b => b.textContent)).toEqual(['All 2', 'Open 0', 'Mid-day 0', 'Into close 0', 'Tomorrow 0', 'This week 2', 'Swing 0', 'Long term 0'])
    })

    it('a horizon a refresh empties while it is chosen falls back to All — never a pressed, disabled button', async () => {
        vi.useFakeTimers()
        try {
            // The screener is working, so the panel looks again; the next look has no open names left.
            hotlistService.getToday.mockResolvedValueOnce({ day: DAY, latest: { ...BOARD, argus: null }, dayList: LIST, checkpoints: [],
                working: { kind: 'board', checkpoint: 'mid', started_at: Date.now() } })
            hotlistService.getToday.mockResolvedValue({ day: DAY, latest: { ...BOARD, argus: null }, dayList: LIST.filter(r => !r.cells.open), checkpoints: [], working: null })
            await mount()
            const group = within(screen.getByRole('group', { name: 'Horizon' }))
            fireEvent.click(group.getByRole('button', { name: /^Open/ }))
            expect(order()).toEqual(['MIX', 'OPN'])
            await act(async () => { vi.advanceTimersByTime(WORKING_POLL_MS) })
            await flush()
            expect(group.getByRole('button', { name: /^All/ }).getAttribute('aria-pressed')).toBe('true')
            expect(order()).toEqual(['WK1', 'WK3'])
        } finally {
            vi.useRealTimers()
        }
    })

    it('reads that failed to load say so on This week', async () => {
        hotlistService.getReads.mockRejectedValue(new Error('down'))
        await mount()
        week()
        expect(screen.getByText(/targets could not be loaded/)).toBeTruthy()
    })

    it('"Catalyst read" on a week row with no read asks Prometheus on the board its week cell lives on', async () => {
        hotlistService.requestRead.mockResolvedValue('started')
        await mount()
        week()
        const wk3 = screen.getByText('WK3').closest('tr')
        fireEvent.click(wk3.querySelector('td:nth-child(4)'))
        fireEvent.click(screen.getByRole('button', { name: 'Catalyst read' }))
        await flush()
        expect(hotlistService.requestRead).toHaveBeenCalledWith(`hb_${DAY}_preopen`, 'WK3')
        expect(screen.getByText(/Prometheus is reading it/)).toBeTruthy()
        expect(wk3.querySelector('.hot-target').textContent).toBe('reading…')
        expect(screen.queryByRole('button', { name: 'Catalyst read' })).toBeNull()
    })

    it("a refused read shows the server's words, and the button stays", async () => {
        hotlistService.requestRead.mockRejectedValue({ response: { data: { error: 'Today\'s catalyst reads are used up — try again tomorrow.' } } })
        await mount()
        week()
        fireEvent.click(screen.getByText('WK3').closest('tr').querySelector('td:nth-child(4)'))
        fireEvent.click(screen.getByRole('button', { name: 'Catalyst read' }))
        await flush()
        expect(screen.getByText(/used up/)).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Catalyst read' })).toBeTruthy()
    })

    it('a row with a read has no "Catalyst read" button', async () => {
        hotlistService.getReads.mockResolvedValue([{ id: 'r', symbol: 'WK1', status: 'active', verdict: 'credible', valid_until: '2026-10-26T21:00:00Z', target: { value: 31, open_pct: 3 } }])
        await mount()
        week()
        fireEvent.click(screen.getByText('WK1').closest('tr').querySelector('td:nth-child(4)'))
        expect(screen.queryByRole('button', { name: 'Catalyst read' })).toBeNull()
    })
})

// Did it work? (Roy, 2026-10-24) — each row's result, a horizon's track record, and the days behind today.
describe('HotlistPanel — did it work', () => {
    const DAY = '2026-10-22'
    const LIST = [
        { symbol: 'HIT', price: 100, status: 'in_play', cells: { mid: { grade: 'A', range: { pct: 3, atr_mult: 1, level: 103 } } },
          results: { mid: { state: 'reached', ret_pct: 2.5, mfe_pct: 3.2, mae_pct: -0.4, level: 103 } } },
        { symbol: 'MISS', price: 50, status: 'in_play', cells: { mid: { grade: 'C', range: { pct: 2, atr_mult: 0.5, level: 51 } } },
          results: { mid: { state: 'missed', ret_pct: -0.8, mfe_pct: 1.2, mae_pct: -1.5, level: 51 } } },
        { symbol: 'WEEK', price: 20, status: 'setting_up', cells: { week: { grade: 'B', range: { pct: 4, atr_mult: 1 } } },
          results: { week: { state: 'open', ends: '2026-10-28' } } },
    ]
    const SUMMARY = { mid: { n: 12, sessions: 3, verified: false, grades: { A: { n: 5, judged: 4, hit_rate: 75, up_rate: 60 }, C: { n: 7, judged: 7, hit_rate: 14.3, up_rate: 42.9 } } } }
    beforeEach(() => {
        hotlistService.getToday.mockImplementation(async (day) => ({ day: day ?? DAY, latest: { ...BOARD, argus: null }, dayList: day ? LIST.slice(0, 1) : LIST,
            checkpoints: [], days: [DAY, '2026-10-21'] }))
        hotlistService.getOutcomes.mockResolvedValue(SUMMARY)
    })
    const cellOf = (sym) => screen.getByText(sym).closest('tr').querySelector('.hot-result')

    it("each row says whether it worked: ✓ reached, ✗ its best move, open while its window runs", async () => {
        await mount()
        expect(screen.getByRole('columnheader', { name: 'Result' })).toBeTruthy()
        expect(cellOf('HIT').textContent).toBe('✓ reached')
        expect(cellOf('HIT').className).toMatch(/good/)
        expect(cellOf('MISS').textContent).toBe('✗ best +1.2%')
        expect(cellOf('MISS').title).toMatch(/Did not reach 51\.00 — best \+1\.2%, worst -1\.5%, ended -0\.8%/)
        expect(cellOf('WEEK').textContent).toBe('open')
        fireEvent.click(screen.getByText('MISS').closest('tr').querySelector('td:nth-child(4)'))
        expect(screen.getByText(/Result \(Mid-day\):/)).toBeTruthy()
    })

    it("a horizon's list carries its track record; a grade's hover says how that grade has done", async () => {
        await mount()
        fireEvent.click(screen.getByRole('button', { name: /^Mid-day/ }))
        const strip = document.querySelector('.hot-record').textContent
        expect(strip).toMatch(/Track record · mid-day/)
        expect(strip).toMatch(/A reached 75% of 4 · up 60% of 5/)
        expect(strip).toMatch(/unverified — 3 of 40 sessions, 12 of 30 names/)
        expect(screen.getByText('HIT').closest('tr').querySelector('.hot-grade').title).toMatch(/As so far: reached 75% of 4/)
        fireEvent.click(screen.getByRole('button', { name: /^This week/ }))
        expect(document.querySelector('.hot-record').textContent).toMatch(/no results logged yet/)
    })

    it('‹ steps back to an earlier day — its list, its results — and › back to today', async () => {
        await mount()
        expect(screen.getByRole('button', { name: 'The day after' }).disabled).toBe(true)
        fireEvent.click(screen.getByRole('button', { name: 'The day before' }))
        await flush()
        expect(hotlistService.getToday).toHaveBeenLastCalledWith('2026-10-21')
        expect(screen.getByRole('tab', { name: 'The day’s list' })).toBeTruthy()
        expect(screen.queryByText('MISS')).toBeNull()
        expect(screen.getByRole('button', { name: 'The day before' }).disabled).toBe(true)
        fireEvent.click(screen.getByRole('button', { name: 'The day after' }))
        await flush()
        expect(hotlistService.getToday).toHaveBeenLastCalledWith(null)
        expect(screen.getByText('MISS')).toBeTruthy()
    })
})

// The house's book — Swing and Long term (Roy, 2026-10-24): coverage by its target's horizon, in the Hotlist.
describe('HotlistPanel — Swing and Long term', () => {
    const row = (symbol, extra = {}) => ({ symbol, name: `${symbol} Inc`, rating: 'buy', price: 100, target: 130, upside_pct: 30, horizon: '6m',
        set_at: '2026-09-01T14:00:00Z', target_date: '2027-03-01', days_left: 128, since_set_pct: 4, spy_since_pct: 2, vs_spy: 2, progress: 0.13,
        state: 'live', origin: { source: 'desk' }, ...extra })
    const BOOK = {
        asof: '2026-10-23',
        swing: [row('CHN', { origin: { source: 'pythia', subject: 'Railroads', verdict: 'swing', kind: 'industry', why: 'the leader', caution: 'freight' } }),
            row('DSK', { upside_pct: 50 }), row('HLD', { rating: 'hold', upside_pct: 2 })],
        long_term: [row('LNG', { horizon: '12m', state: 'hit', since_set_pct: 31 })],
        record: { swing: { n: 3, live: 3, hit: 0, broken: 0, expired: 0, hit_rate: null, priced: 3, median_since: 4, median_vs_spy: 2, beat_spy: 100 }, long_term: { n: 1, hit: 1, broken: 0, expired: 0, hit_rate: 100, priced: 1, median_since: 31, median_vs_spy: 20, beat_spy: 100 } },
    }
    const COVERAGE = [{ symbol: 'CHN', rating: 'buy', thesis: 'Volumes recover into the cycle.', price_target: { value: 130, horizon: '6m' }, kill_criteria: ['volumes fall'], catalysts: [], revisions: [] }]
    beforeEach(() => {
        hotlistService.getBook.mockResolvedValue(BOOK)
        hotlistService.getToday.mockResolvedValue({ day: '2026-10-23', latest: { ...BOARD, argus: null }, checkpoints: [],
            dayList: [{ symbol: 'OPN', price: 10, status: 'in_play', cells: { open: { grade: 'A', range: { pct: 2, atr_mult: 0.5 } } } }] })
    })
    const order = () => [...document.querySelectorAll('tr.hot-row')].map(tr => tr.dataset.symbol)

    it('two more buttons after the day\'s horizons: the book\'s counts; Swing lists its buys, the chain\'s first', async () => {
        await mount({ coverage: COVERAGE })
        expect(screen.getByRole('button', { name: 'Swing 3' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Long term 1' })).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Swing 3' }))
        expect(order()).toEqual(['CHN', 'DSK'], 'buys only by default; the hold waits behind All')
        const chn = screen.getByText('CHN').closest('tr')
        expect(chn.textContent).toMatch(/100\.00.*130\.00.*\+30\.0%.*Mar 2027 · 6m.*\+4\.0% \(\+2\.0%\).*13%.*Railroads/)
        expect(document.querySelector('.hot-record').textContent).toMatch(/no target has come due yet.*median \+4\.0% since set/)
        fireEvent.click(screen.getByRole('button', { name: 'All 3' }))
        expect(order()).toEqual(['CHN', 'DSK', 'HLD'])
        fireEvent.click(screen.getByRole('button', { name: /^Upside/ }))
        expect(order()).toEqual(['DSK', 'CHN', 'HLD'])
    })

    it('the opened row: the chain\'s reason, the thesis itself, and the hand-offs with the book\'s horizon', async () => {
        const onBuild = vi.fn(), onAsk = vi.fn()
        await mount({ coverage: COVERAGE, onBuild, onAsk })
        fireEvent.click(screen.getByRole('button', { name: 'Swing 3' }))
        fireEvent.click(screen.getByText('CHN').closest('tr').querySelector('td:nth-child(3)'))
        expect(screen.getByText(/From the weekly chain:/).closest('p').textContent).toMatch(/swing call on Railroads — Argus: the leader/)
        expect(screen.getByText('Volumes recover into the cycle.')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Build with Mentor' }))
        expect(onBuild).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'CHN' }), 'swing', null)
    })

    it('Long term shows a settled hit; the book failing to load leaves its buttons off', async () => {
        await mount()
        fireEvent.click(screen.getByRole('button', { name: 'Long term 1' }))
        expect(screen.getByText('LNG').closest('tr').querySelector('.hot-result').textContent).toBe('✓ hit')
        expect(document.querySelector('.hot-record').textContent).toMatch(/settled 1: 1 hit/)
    })
})
