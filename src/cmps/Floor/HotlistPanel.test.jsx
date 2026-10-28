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
import { HotlistPanel, HOTLIST_PANEL_ID, WORKING_POLL_MS, TAIL_LOOKS } from './HotlistPanel.jsx'
import { openPanel, closePanel, useActivePanel, returnToPanel, setReturnTo } from '../DetailPanel/detailPanel.store.js'

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
        expect(screen.queryByText(/unverified/)).toBeNull()
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
        // The hand-off leaves the way back: the chat offers "‹ Back to the Hotlist" (2026-10-24).
        expect(returnToPanel()).toEqual({ panel: HOTLIST_PANEL_ID, label: 'the Hotlist' })
        act(() => setReturnTo(null))
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

    it('while it works the panel looks again quietly, takes the first board, and stops a few looks after nothing runs', async () => {
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
            // A few more looks after the last working one — the week board lands just after the nightly run (2026-10-25) —
            // then none.
            for (let k = 0; k < TAIL_LOOKS + 3; k++) { await act(async () => { vi.advanceTimersByTime(WORKING_POLL_MS) }); await flush() }
            expect(hotlistService.getToday).toHaveBeenCalledTimes(2 + TAIL_LOOKS)
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
    // No "All" tab since 2026-10-28 (Roy: "4 tabs — week / swing / long term / covered companies"): the panel opens on
    // This week; these look at everything it screened.
    const weekAll = () => fireEvent.click(screen.getByRole('button', { name: /^All screened/ }))

    it('opens on This week of the day\'s list: one line per name — numbers in columns, the words only when opened', async () => {
        await mount()
        expect(screen.getByRole('tab', { name: 'Today’s list' }).getAttribute('aria-selected')).toBe('true')
        expect(screen.getByRole('button', { name: /^This week/ }).getAttribute('aria-pressed')).toBe('true')
        weekAll()
        expect(order()).toEqual(['ACC', 'DXC'], 'building, setting up — the mid-day name is on its own tab')
        const dxc = screen.getByText('DXC').closest('tr')
        const cells = [...dxc.querySelectorAll('td')].map(td => td.textContent)
        // On a horizon's tab there is no Horizon column; This week carries Prometheus's target (none read here).
        expect(cells.slice(3)).toEqual(['20.50', '+0.4%', '0.8%', '3.1%', '7.3% 2.30×', '10-29!', '—', '—'], 'the result: none on a row the server sent without one')
        expect(screen.queryByText(/earnings in 7 days/)).toBeNull()
        expect(screen.getByText(/Prices as of each name’s last checkpoint/)).toBeTruthy()
        expect(screen.getByText('Breadth is fine; the room is in SPCX.')).toBeTruthy()
    })

    it('a click on the row opens its detail: the reason, the run-up warning, when it was listed — one row at a time', async () => {
        await mount()
        weekAll()
        fireEvent.click(screen.getByText('DXC').closest('tr').querySelector('td:nth-child(4)'))
        expect(screen.getByText(/earnings in 7 days — a run-up: out before the report/)).toBeTruthy()
        expect(screen.getByText(/a run-up into the report: be out before it/)).toBeTruthy()
        expect(screen.getByText(/listed at 08:00, 10:30/)).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Hide DXC details' }).getAttribute('aria-expanded')).toBe('true')
        fireEvent.click(screen.getByRole('button', { name: 'Show ACC details' }))
        expect(screen.queryByText(/earnings in 7 days/)).toBeNull()
        expect(screen.getByText(/near the 20-day high/)).toBeTruthy()
    })

    // Roy, 2026-10-22: a symbol on the hotlist shows its DAILY chart — in the window, which covers the chat.
    it('with no caller handler, a symbol opens its daily chart in the window; Back returns to the list', async () => {
        await mount()
        weekAll()
        fireEvent.click(screen.getByRole('button', { name: 'DXC' }))
        expect(screen.getByText('chart DXC day')).toBeTruthy()
        expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('DXC · daily')
        expect(screen.queryByRole('button', { name: 'ACC' }), 'the table gave way to the chart').toBeNull()
        fireEvent.click(screen.getByRole('button', { name: '‹ Back to the list' }))
        expect(screen.getByRole('button', { name: /^This week/ }).getAttribute('aria-pressed')).toBe('true', 'back on the tab it left')
        weekAll()
        expect(screen.getByRole('button', { name: 'ACC' })).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'ACC' }))
        fireEvent.click(screen.getByRole('button', { name: 'Close chart' }))
        expect(screen.queryByText(/^chart /), 'the chart own Close goes back too').toBeNull()
    })

    it('the symbol opens the chart, not the detail', async () => {
        const onSymbolClick = vi.fn()
        await mount({ onSymbolClick })
        weekAll()
        fireEvent.click(screen.getByRole('button', { name: 'DXC' }))
        expect(onSymbolClick).toHaveBeenCalledWith('DXC')
        expect(screen.queryByText(/earnings in 7 days/)).toBeNull()
    })

    // Roy, 2026-10-28: "no need for status column" — the column and its filter are gone.
    it('no Status column and no status filter', async () => {
        await mount()
        weekAll()
        expect(screen.queryByRole('columnheader', { name: /Status/ })).toBeNull()
        expect(screen.queryByRole('group', { name: 'Show' })).toBeNull()
        expect(screen.queryByRole('button', { name: /^Building/ })).toBeNull()
        expect(order()).toEqual(['ACC', 'DXC'], 'still in its own order')
    })

    it('a header sorts; a second click flips it', async () => {
        await mount()
        weekAll()
        fireEvent.click(screen.getByRole('button', { name: 'Last' }))
        expect(order()).toEqual(['ACC', 'DXC'])
        fireEvent.click(screen.getByRole('button', { name: /Last/ }))
        expect(order()).toEqual(['DXC', 'ACC'])
        expect(screen.getByRole('button', { name: /Last/ }).closest('th').getAttribute('aria-sort')).toBe('ascending')
        fireEvent.click(screen.getByRole('button', { name: 'ATR%' }))
        expect(order()).toEqual(['DXC', 'ACC'])
    })

    it('the archived mid-day name is on its own tab on the day that has it', async () => {
        await mount()
        fireEvent.click(screen.getByRole('button', { name: /^Mid-day/ }))
        expect(order()).toEqual(['SPCX'], 'Argus’s pick for mid-day')
    })

    it('Build with Mentor references the board the best cell LIVES on, not the latest board', async () => {
        const onBuild = vi.fn()
        await mount({ onBuild })
        weekAll()
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
        // No grade there either — not as a letter, not as a colour (code review 2026-10-24).
        expect(document.querySelector('[class*="hot-grade--"]')).toBeNull()
        expect(screen.queryByText(/an A beats a C/)).toBeNull()
    })
})

// The code review of 2026-10-24 on the survivors lists.
describe('HotlistPanel — the survivors lists, reviewed', () => {
    const LIST = [
        { symbol: 'WK1', price: 30, status: 'setting_up', cells: { week: { grade: 'B', range: { pct: 4, atr_mult: 1 } } }, picks: { week: { why: 'the pick', rank: 1 } } },
        { symbol: 'WK2', price: 20, status: 'setting_up', cells: { week: { grade: 'A', range: { pct: 6, atr_mult: 2 } } }, picks: { week: { why: 'the other', rank: 2 } } },
    ]
    beforeEach(() => { hotlistService.getToday.mockResolvedValue({ day: '2026-10-23', latest: { ...BOARD, argus: null }, dayList: LIST, checkpoints: [] }) })
    const order = () => [...document.querySelectorAll('tr.hot-row')].map(tr => tr.dataset.symbol)

    it('while Prometheus\'s reads load, This week says so — not "still to read"', async () => {
        hotlistService.getReads.mockReturnValue(new Promise(() => {}))
        await mount()
        const tab = screen.getByRole('button', { name: /^This week/ })
        expect(tab.textContent).toBe('This week …')
        fireEvent.click(tab)
        expect(screen.getByText('Loading Prometheus’s reads…')).toBeTruthy()
        expect(screen.queryByText(/still to read/)).toBeNull()
    })

    it('reads that failed: This week opens on Argus\'s names, not an empty confirmed list', async () => {
        hotlistService.getReads.mockRejectedValue(new Error('down'))
        await mount()
        fireEvent.click(screen.getByRole('button', { name: /^This week/ }))
        expect(screen.getByRole('button', { name: 'Argus’s names 2' }).getAttribute('aria-pressed')).toBe('true')
        expect(order()).toEqual(['WK1', 'WK2'])
    })

    it('a book from a server without the chain\'s picks says they are not there — never "the chain sent nothing"', async () => {
        hotlistService.getBook.mockResolvedValue({ asof: '2026-10-23', swing: [{ symbol: 'DSK', rating: 'buy', origin: { source: 'desk' } }], long_term: [], record: {} })
        await mount()
        fireEvent.click(screen.getByRole('button', { name: /^Swing/ }))
        expect(screen.getByText(/could not be loaded/)).toBeTruthy()
        expect(screen.queryByText(/has sent no/)).toBeNull()
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
        // Each count is the list the tab OPENS on (2026-10-24): Argus's names on Open, Prometheus confirmed on This week.
        // The day horizons were archived (2026-10-25): a past day shows only the ones that still have names.
        // Four tabs (2026-10-28), no All — the archived Open only because this day has its names.
        expect(tabs).toEqual(['Open 1', 'This week 1', 'Swing 0', 'Long term 0', 'Covered companies 0'])
        expect(screen.getByRole('button', { name: 'This week 1' }).title).toMatch(/1 on the list \(Prometheus confirmed\) of 3 screened/)
        expect(screen.queryByRole('button', { name: /^Mid-day/ })).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: /^This week/ }))
        fireEvent.click(screen.getByRole('button', { name: 'All screened 3' }))
        expect(order()).toEqual(['WK1', 'WK2', 'WK3'], 'his picks in his order, then the grade')
        const wk1 = screen.getByText('WK1').closest('tr')
        expect(wk1.querySelector('.hot-star').textContent).toBe('★1')
        expect(wk1.textContent).not.toMatch(/This week C/, 'no grade on This week either (2026-10-24)')
        expect(document.querySelector('.hot-panel thead').textContent).not.toMatch(/Grade/)
        fireEvent.click(screen.getByRole('button', { name: 'Open 1' }))
        expect(order()).toEqual(['OPN'])
    })

    it('This week shows Prometheus\'s catalyst target and what is still open; the opened row carries his read', async () => {
        await mount()
        fireEvent.click(screen.getByRole('button', { name: /^This week/ }))
        fireEvent.click(screen.getByRole('button', { name: 'All screened 3' }))
        expect(screen.getByRole('columnheader', { name: 'Target' })).toBeTruthy()
        const wk1 = screen.getByText('WK1').closest('tr')
        expect(wk1.querySelector('.hot-target').textContent).toBe('31.50 · +5.0%')
        expect(screen.getByText('WK3').closest('tr').querySelector('.hot-target').textContent).toBe('—')
        fireEvent.click(wk1.querySelector('td:nth-child(4)'))
        expect(screen.getByText(/first week pick/)).toBeTruthy()
        expect(screen.getByText('A real contract, two thirds still open.')).toBeTruthy()
        expect(screen.getByText(/Inside the window: Q3 report 2026-10-29/)).toBeTruthy()
        // Off the week tab, no Target column.
        fireEvent.click(screen.getByRole('button', { name: 'Open 1' }))
        expect(screen.queryByRole('columnheader', { name: 'Target' })).toBeNull()
    })

    // Roy, 2026-10-24: "hotlist, Argus automatically, names, Prometheus confirms catalyst and fundamentals and gives a PT".
    it('This week opens on the names Prometheus confirmed — his target, the company — then Argus\'s, then all screened', async () => {
        hotlistService.getReads.mockResolvedValue([
            { ...READ, company: { verdict: 'weak', why: 'a loss-maker, net cash' },
              target: { ...READ.target, basis: 'prometheus', why: 'the yardstick is +3%; estimates rising', yardstick: { value: 30.9, open_pct: 3, basis: 'event' } } },
            { id: 'cr_WK2', symbol: 'WK2', status: 'pass', verdict: 'credible', pass_reason: 'company', set_at: '2026-10-23T13:31:00Z', context: { day: '2026-10-23' },
              company: { verdict: 'broken', why: 'S-3 filed' } },
        ])
        const onBuild = vi.fn()
        await mount({ onBuild })
        fireEvent.click(screen.getByRole('button', { name: /^This week/ }))
        expect(screen.getByRole('button', { name: 'Prometheus confirmed 1' }).getAttribute('aria-pressed')).toBe('true')
        expect(order()).toEqual(['WK1'], 'his confirmed name; the broken company and the unpicked name are not')
        expect(screen.getByText(/The names he confirmed are the list/)).toBeTruthy()
        fireEvent.click(screen.getByText('WK1').closest('tr').querySelector('td:nth-child(4)'))
        const read = document.querySelector('.hot-read').textContent
        expect(read).toMatch(/\+5\.0% open — his own number, off the catalyst's worth \(\+3\.0% open\)/)
        expect(read).toMatch(/The target: the yardstick is \+3%; estimates rising/)
        expect(read).toMatch(/The company: weak — a loss-maker, net cash/)
        fireEvent.click(screen.getByRole('button', { name: 'Argus’s names 2' }))
        expect(order()).toEqual(['WK1', 'WK2'])
        expect(screen.getByText('WK2').closest('tr').querySelector('.hot-target').title).toMatch(/the company cannot carry it/)
        fireEvent.click(screen.getByRole('button', { name: 'Build with Mentor' }))
        expect(onBuild).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'WK1' }), 'week', expect.anything())
    })

    it('an empty confirmed list says where his reads stand', async () => {
        hotlistService.getReads.mockResolvedValue([])
        await mount()
        fireEvent.click(screen.getByRole('button', { name: /^This week/ }))
        expect(order()).toEqual([])
        expect(screen.getByText(/Prometheus has 2 of Argus’s 2 names still to read/)).toBeTruthy()
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
    // This week opens on the names Prometheus confirmed (2026-10-24); these look at the whole week list.
    const week = () => {
        fireEvent.click(screen.getByRole('button', { name: /^This week/ }))
        fireEvent.click(screen.getByRole('button', { name: /^All screened/ }))
    }

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

    it("a horizon opens in Argus's order, then the screener's (no Grade column); a third click restores it; a new tab does too", async () => {
        await mount()
        week()
        expect(order()).toEqual(['WK1', 'WK3', 'MIX'], "Argus's pick first, then the week's own ranking")
        expect(screen.queryByRole('button', { name: /^Grade/ })).toBeNull()
        const sym = () => fireEvent.click(screen.getByRole('button', { name: /^Sym/ }))
        sym()
        expect(order()).toEqual(['MIX', 'WK1', 'WK3'])
        sym(); sym()
        expect(order()).toEqual(['WK1', 'WK3', 'MIX'], 'third click: back to his order')
        sym()
        fireEvent.click(screen.getByRole('button', { name: /^Open/ }))
        week()
        expect(order()).toEqual(['WK1', 'WK3', 'MIX'], 'the last tab\'s sort does not follow')
    })

    it('a tab with no confirmed names but screened ones still opens', async () => {
        await mount()
        const group = within(screen.getByRole('group', { name: 'Horizon' }))
        expect(group.getAllByRole('button').map(b => b.textContent)).toEqual(['Open 0', 'This week 0', 'Swing 0', 'Long term 0', 'Covered companies 0'])
        expect(group.getByRole('button', { name: /^This week/ }).disabled).toBe(false, 'none confirmed, but screened names: still opens')
    })

    it('a horizon a refresh empties while it is chosen falls back to This week — never a pressed, disabled button', async () => {
        vi.useFakeTimers()
        try {
            // The screener is working, so the panel looks again; the next look has no open names left.
            hotlistService.getToday.mockResolvedValueOnce({ day: DAY, latest: { ...BOARD, argus: null }, dayList: LIST, checkpoints: [],
                working: { kind: 'board', checkpoint: 'mid', started_at: Date.now() } })
            hotlistService.getToday.mockResolvedValue({ day: DAY, latest: { ...BOARD, argus: null }, dayList: LIST.filter(r => !r.cells.open), checkpoints: [], working: null })
            await mount()
            const group = within(screen.getByRole('group', { name: 'Horizon' }))
            fireEvent.click(group.getByRole('button', { name: /^Open/ }))
            // A day-trade horizon opens on Argus's names (none here) — everything screened is one click away.
            fireEvent.click(screen.getByRole('button', { name: /^All screened/ }))
            expect(order()).toEqual(['MIX', 'OPN'])
            await act(async () => { vi.advanceTimersByTime(WORKING_POLL_MS) })
            await flush()
            expect(group.getByRole('button', { name: /^This week/ }).getAttribute('aria-pressed')).toBe('true')
            expect(group.queryByRole('button', { name: /^Open/ })).toBeNull()
            fireEvent.click(screen.getByRole('button', { name: /^All screened/ }))
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
    const SUMMARY = { mid: { n: 12, sessions: 3, verified: false, grades: { A: { n: 5, judged: 4, hit_rate: 75, up_rate: 60 }, C: { n: 7, judged: 7, hit_rate: 14.3, up_rate: 42.9 } } },
        argus: { all: { pick: { n: 11, up_rate: 72.7, ret_mean: 0.58 }, avoid: { n: 20, up_rate: 60, ret_mean: 0.46 }, unmarked: { n: 23, up_rate: 43.5, ret_mean: -0.26 } },
            mid: { pick: { n: 5, up_rate: 80, ret_mean: 1.08 }, avoid: { n: 9, up_rate: 55.6, ret_mean: 0.77 }, unmarked: { n: 21, up_rate: 47.6, ret_mean: -0.07 } } } }
    beforeEach(() => {
        hotlistService.getToday.mockImplementation(async (day) => ({ day: day ?? DAY, latest: { ...BOARD, argus: null }, dayList: day ? LIST.slice(0, 1) : LIST,
            checkpoints: [], days: [DAY, '2026-10-21'] }))
        hotlistService.getOutcomes.mockResolvedValue(SUMMARY)
    })
    const cellOf = (sym) => screen.getByText(sym).closest('tr').querySelector('.hot-result')
    const screened = (tab) => {
        fireEvent.click(screen.getByRole('button', { name: tab }))
        fireEvent.click(screen.getByRole('button', { name: /^All screened/ }))
    }

    it("each row says whether it worked: ✓ reached, ✗ its best move, open while its window runs", async () => {
        await mount()
        screened(/^Mid-day/)
        expect(screen.getByRole('columnheader', { name: 'Result' })).toBeTruthy()
        expect(cellOf('HIT').textContent).toBe('✓ reached')
        expect(cellOf('HIT').className).toMatch(/good/)
        expect(cellOf('MISS').textContent).toBe('✗ best +1.2%')
        expect(cellOf('MISS').title).toMatch(/Did not reach 51\.00 — best \+1\.2%, worst -1\.5%, ended -0\.8%/)
        fireEvent.click(screen.getByText('MISS').closest('tr').querySelector('td:nth-child(4)'))
        expect(screen.getByText(/Result \(Mid-day\):/)).toBeTruthy()
        screened(/^This week/)
        expect(cellOf('WEEK').textContent).toBe('open')
    })

    it("Argus's record: a horizon's own", async () => {
        await mount()
        fireEvent.click(screen.getByRole('button', { name: /^Mid-day/ }))
        const mid = [...document.querySelectorAll('.hot-record')].map(p => p.textContent).find(t => /Argus/.test(t))
        expect(mid).toContain('picks up 80% · avg +1.1% (5)')
    })

    it("a day-trade horizon's record has no grades; a graded horizon's grade hover says how that grade has done", async () => {
        await mount()
        fireEvent.click(screen.getByRole('button', { name: /^Mid-day/ }))
        const strip = [...document.querySelectorAll('.hot-record')].map(x => x.textContent).find(t => /Track record/.test(t)) ?? ''
        expect(strip).not.toMatch(/A reached|unverified/)
        expect(screen.getByText(/Argus confirmed no names for mid-day/)).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: /^All screened/ }))
        expect(document.querySelector('.hot-panel thead').textContent).not.toMatch(/Grade/)
        expect(screen.getByText('HIT').closest('tr').querySelector('.hot-grade')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: /^This week/ }))
        expect(document.querySelector('.hot-record').textContent).toMatch(/no results logged yet/)
    })

    it('‹ steps back to an earlier day — its list, its results — and › back to today', async () => {
        await mount()
        screened(/^Mid-day/)
        expect(screen.getByText('MISS')).toBeTruthy()
        expect(screen.getByRole('button', { name: 'The day after' }).disabled).toBe(true)
        fireEvent.click(screen.getByRole('button', { name: 'The day before' }))
        await flush()
        expect(hotlistService.getToday).toHaveBeenLastCalledWith('2026-10-21')
        expect(screen.getByText(/the day’s list/)).toBeTruthy()
        expect(screen.queryByText('MISS')).toBeNull()
        expect(screen.getByRole('button', { name: 'The day before' }).disabled).toBe(true)
        fireEvent.click(screen.getByRole('button', { name: 'The day after' }))
        await flush()
        expect(hotlistService.getToday).toHaveBeenLastCalledWith(null)
        fireEvent.click(screen.getByRole('button', { name: /^All screened/ }))
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
        long_term: [row('LNG', { horizon: '12m', state: 'hit', since_set_pct: 31, origin: { source: 'pythia', subject: 'Utilities', verdict: 'long_term', kind: 'industry' } })],
        record: { swing: { n: 3, live: 3, hit: 0, broken: 0, expired: 0, hit_rate: null, priced: 3, median_since: 4, median_vs_spy: 2, beat_spy: 100 }, long_term: { n: 1, hit: 1, broken: 0, expired: 0, hit_rate: 100, priced: 1, median_since: 31, median_vs_spy: 20, beat_spy: 100 } },
        // The weekly chain's picks (2026-10-24): CHN covered as a buy, PSS passed, WAI still waiting for Prometheus.
        picks: {
            swing: [{ symbol: 'CHN', state: 'covered', subject: 'Railroads', why: 'the leader', caution: 'freight', at: '2026-10-20T10:00:00Z' },
                { symbol: 'PSS', state: 'passed', reason: 'no_edge', subject: 'Railroads', why: 'second-order', at: '2026-10-20T10:00:00Z' },
                { symbol: 'WAI', state: 'waiting', subject: 'Railroads', why: 'cheap', at: '2026-10-20T10:00:00Z' },
                // Picked by Argus, already covered at the desk (a hold): it has a thesis and PT, so it survived.
                { symbol: 'HLD', state: 'already_covered', subject: 'Railroads', why: 'the laggard', at: '2026-10-20T10:00:00Z' }],
            long_term: [{ symbol: 'LNG', state: 'covered', subject: 'Utilities', at: '2026-10-13T10:00:00Z' }],
        },
    }
    const COVERAGE = [{ symbol: 'CHN', rating: 'buy', thesis: 'Volumes recover into the cycle.', price_target: { value: 130, horizon: '6m' }, kill_criteria: ['volumes fall'], catalysts: [], revisions: [] }]
    beforeEach(() => {
        hotlistService.getBook.mockResolvedValue(BOOK)
        hotlistService.getToday.mockResolvedValue({ day: '2026-10-23', latest: { ...BOARD, argus: null }, checkpoints: [],
            dayList: [{ symbol: 'OPN', price: 10, status: 'in_play', cells: { open: { grade: 'A', range: { pct: 2, atr_mult: 0.5 } } } }] })
    })
    const order = () => [...document.querySelectorAll('tr.hot-row')].map(tr => tr.dataset.symbol)

    // Roy, 2026-10-24: "Pythia brings the industry → Argus brings names from it → Prometheus analyses them and brings a
    // thesis and PT — the survivors in the Hotlist".
    it('Swing opens on the chain\'s survivors — Argus\'s picks Prometheus covered, any rating; the picks and the whole book a click away', async () => {
        await mount({ coverage: COVERAGE })
        expect(screen.getByRole('button', { name: 'Swing 2' }).title).toMatch(/2 confirmed by Prometheus of 4 the chain sent; 3 in the book/)
        expect(screen.getByRole('button', { name: 'Long term 1' })).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Swing 2' }))
        expect(screen.getByRole('button', { name: 'Prometheus confirmed 2' }).getAttribute('aria-pressed')).toBe('true')
        expect(order()).toEqual(['CHN', 'HLD'], 'his buy and the hold he had covered at the desk; the desk\'s own buy is not the chain\'s')
        expect(screen.getByText(/Pythia/, { selector: '.hot-note b' })).toBeTruthy()
        const chn = screen.getByText('CHN').closest('tr')
        expect(chn.textContent).toMatch(/100\.00.*130\.00.*\+30\.0%.*Mar 2027 · 6m.*\+4\.0% \(\+2\.0%\).*13%.*Railroads/)
        expect(document.querySelector('.hot-record').textContent).toMatch(/no target has come due yet.*median \+4\.0% since set/)
        fireEvent.click(screen.getByRole('button', { name: 'Argus’s names 4' }))
        expect(order()).toEqual(['CHN', 'PSS', 'WAI', 'HLD'])
        const cell = (s) => screen.getByText(s).closest('tr').querySelector('.hot-result').textContent
        expect(cell('CHN')).toBe('buy · target 130.00 (+30.0%)')
        expect(cell('PSS')).toBe('pass — he could not defend a number')
        expect(cell('WAI')).toBe('waiting for Prometheus')
        // The whole book and the scorecard moved to Covered companies (2026-10-28).
        expect(screen.queryByRole('button', { name: /^All coverage/ })).toBeNull()
        expect(screen.queryByRole('button', { name: 'Prometheus’s scorecard' })).toBeNull()
    })

    // Roy, 2026-10-28: "4 tabs — week / swing / long term / covered companies".
    it('Covered companies: the whole book, both horizons, and the scorecard; a name hands off as the book it sits in', async () => {
        const onBuild = vi.fn()
        await mount({ coverage: COVERAGE, onBuild })
        fireEvent.click(screen.getByRole('button', { name: 'Covered companies 4' }))
        expect(screen.getByRole('button', { name: 'All coverage 4' }).getAttribute('aria-pressed')).toBe('true')
        expect(screen.getByRole('button', { name: 'Prometheus’s scorecard' })).toBeTruthy()
        expect(screen.queryByRole('button', { name: /^Argus’s names/ })).toBeNull()
        expect(order()).toEqual(['CHN', 'DSK', 'HLD', 'LNG'])
        fireEvent.click(screen.getByRole('button', { name: /^Upside/ }))
        expect(order()[0]).toBe('DSK')
        expect(order().at(-1)).toBe('HLD')
        fireEvent.click(screen.getByText('LNG').closest('tr').querySelector('td:nth-child(3)'))
        fireEvent.click(screen.getByRole('button', { name: 'Build with Mentor' }))
        expect(onBuild).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'LNG' }), 'long_term', null)
    })

    it('an empty survivors list says where the chain stands', async () => {
        hotlistService.getBook.mockResolvedValue({ ...BOOK, swing: BOOK.swing.filter(r => r.symbol !== 'CHN'),
            picks: { swing: [{ symbol: 'WAI', state: 'waiting' }], long_term: [] } })
        await mount()
        fireEvent.click(screen.getByRole('button', { name: 'Swing 0' }))
        expect(screen.getByText(/Prometheus has 1 of Argus’s 1 swing names still to research/)).toBeTruthy()
    })

    it('the opened row: the chain\'s reason, the thesis itself, and the hand-offs with the book\'s horizon', async () => {
        const onBuild = vi.fn(), onAsk = vi.fn()
        await mount({ coverage: COVERAGE, onBuild, onAsk })
        fireEvent.click(screen.getByRole('button', { name: 'Swing 2' }))
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

describe('HotlistPanel — what Argus spotted in the pool', () => {
    it('his spots show under his read: the name, the horizon, why and the caution', async () => {
        hotlistService.getToday.mockResolvedValue({ day: '2026-10-23', checkpoints: [],
            latest: { ...BOARD, argus: { summary: 'A weak tape.', spots: [{ symbol: 'POOLX', column: 'week', why: 'a contract the rules cannot weigh', caution: 'thin volume' }] } },
            dayList: [{ symbol: 'OPN', price: 10, status: 'in_play', cells: { open: { grade: 'A', range: { pct: 2, atr_mult: 0.5 } } } }] })
        await mount()
        const read = screen.getByRole('region', { name: "Argus's read" }).textContent
        expect(read).toContain('Spotted in the pool:')
        expect(read).toContain('POOLX')
        expect(read).toContain('This week — a contract the rules cannot weigh')
        expect(read).toContain('Caution: thin volume')
    })
})

// Day trades (Roy, 2026-10-24): the scan, then Argus confirms, then the names — no grades.
describe('HotlistPanel — day trades are Argus’s names', () => {
    const LIST = [
        { symbol: 'YES', price: 10, status: 'in_play', cells: { open: { grade: 'C', range: { pct: 2, atr_mult: 0.5, level: 10.2 } } },
          picks: { open: { why: 'a real guidance raise', caution: 'a fade under the pre-market low', rank: 1 } } },
        { symbol: 'NOT', price: 20, status: 'in_play', cells: { open: { grade: 'A', range: { open_sky: true } } } },
    ]
    beforeEach(() => { hotlistService.getToday.mockResolvedValue({ day: '2026-10-23', latest: { ...BOARD, argus: null }, dayList: LIST, checkpoints: [] }) })
    const order = () => [...document.querySelectorAll('tr.hot-row')].map(tr => tr.dataset.symbol)

    it('a day-trade horizon lists the names Argus confirmed, no grade — the rest one click away, and on to Mentor', async () => {
        const onBuild = vi.fn()
        await mount({ onBuild })
        fireEvent.click(screen.getByRole('button', { name: /^Open/ }))
        expect(screen.getByRole('button', { name: 'Argus’s names 1' }).getAttribute('aria-pressed')).toBe('true')
        expect(screen.getByRole('button', { name: 'All screened 2' })).toBeTruthy()
        expect(order()).toEqual(['YES'], "the screener's A he did not confirm is not on the list")
        expect(document.querySelector('.hot-panel thead').textContent).not.toMatch(/Grade/)
        expect(screen.getByText(/No grades on day trades/)).toBeTruthy()
        fireEvent.click(screen.getByText('YES').closest('tr').querySelector('td:nth-child(4)'))
        expect(screen.getByText(/a real guidance raise/)).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Build with Mentor' }))
        expect(onBuild).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'YES' }), 'open', expect.anything())
    })

    it('All screened shows everything the screener let through; a new horizon opens on his names again', async () => {
        await mount()
        fireEvent.click(screen.getByRole('button', { name: /^Open/ }))
        fireEvent.click(screen.getByRole('button', { name: 'All screened 2' }))
        expect(order()).toEqual(['YES', 'NOT'])
        fireEvent.click(within(screen.getByRole('group', { name: 'Horizon' })).getByRole('button', { name: /^This week/ }))
        fireEvent.click(screen.getByRole('button', { name: /^Open/ }))
        expect(screen.getByRole('button', { name: 'Argus’s names 1' }).getAttribute('aria-pressed')).toBe('true')
    })
})

// THIS WEEK ON THE RUN-UP RULE (2026-10-25, hotlist-day-archive.md): the overnight board lists by one rule — no Argus —
// and Prometheus reads every name. Its cells carry the grade 'R'.
describe('HotlistPanel — the run-up week', () => {
    const RULE = [
        { symbol: 'RU1', price: 40, status: 'setting_up', cells: { week: { grade: 'R', path: 'scheduled', exit_before: '2026-11-02', why: ['reports 2026-11-02'] } } },
        { symbol: 'RU2', price: 25, status: 'setting_up', cells: { week: { grade: 'R', path: 'scheduled', exit_before: '2026-11-02', why: ['reports 2026-11-02'] } } },
    ]
    const WEEK = { id: 'hb_2026-10-26_week', day: '2026-10-26', checkpoint: 'overnight', status: 'done', columns: ['week'], rows: RULE }
    beforeEach(() => { hotlistService.getToday.mockResolvedValue({ day: '2026-10-26', latest: WEEK, dayList: RULE, checkpoints: [] }) })

    it('no Argus view: Prometheus confirmed, else the rule\'s names — and the note says the rule', async () => {
        await mount()
        fireEvent.click(screen.getByRole('button', { name: /^This week/ }))
        expect(screen.queryByRole('button', { name: /Argus’s names/ })).toBeNull()
        expect(screen.getByRole('button', { name: 'Run-up names 2' })).toBeTruthy()
        expect(screen.getByText(/2 of the 2 run-up names still to read/)).toBeTruthy()
        expect(screen.getByText(/last three reports all beat/)).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Run-up names 2' }))
        expect([...document.querySelectorAll('tr.hot-row')].map(tr => tr.dataset.symbol)).toEqual(['RU1', 'RU2'])
    })

    // Code review 2026-10-25.
    it('the All view of a run-up day is the rule\'s list: no tape, no room, no horizon column, the close as the price', async () => {
        await mount()
        const heads = [...document.querySelectorAll('.hot-panel thead th')].map(t => t.textContent.trim()).filter(Boolean)
        expect(heads).not.toContain('Chg%')
        expect(heads).not.toContain('RVol')
        expect(heads).not.toContain('Room')
        expect(heads).not.toContain('Horizon')
        expect(screen.getByText('Prices: the close before the list')).toBeTruthy()
    })

    it('with the reads failed, This week counts and opens on every rule name — never "0 picks"', async () => {
        hotlistService.getReads.mockRejectedValue(new Error('down'))
        await mount()
        expect(screen.getByRole('button', { name: /^This week/ }).textContent).toBe('This week 2')
    })

    it('an empty night keeps Swing and Long term, and says why the list is empty', async () => {
        hotlistService.getToday.mockResolvedValue({ day: '2026-10-26', latest: { ...WEEK, rows: [], closed: 'SPY is under its 200-day — the run-up loses there, so no names' }, dayList: [], checkpoints: [] })
        hotlistService.getBook.mockResolvedValue({ asof: '2026-10-23', swing: [{ symbol: 'DSK', rating: 'buy', origin: { source: 'desk' } }], long_term: [], picks: { swing: [], long_term: [] }, record: {} })
        await mount()
        expect(screen.getByRole('button', { name: /^Swing/ })).toBeTruthy()
        expect(screen.getByRole('button', { name: /^Long term/ })).toBeTruthy()
        expect(screen.getByText(/SPY is under its 200-day/)).toBeTruthy()
    })

    it('the week tab shows the rule\'s own track record, not the week\'s older outcomes', async () => {
        hotlistService.getOutcomes.mockResolvedValue({ week: { n: 9, sessions: 4, rule: { n: 5, sessions: 2, up_rate: 60, ret_mean: 0.8 }, board: { n: 9 }, off: { n: 3, up_rate: 40, ret_mean: -1 } } })
        await mount()
        fireEvent.click(screen.getByRole('button', { name: /^This week/ }))
        expect(screen.getByText('Track record · the run-up rule')).toBeTruthy()
        expect(screen.getByText('up 60% · avg +0.8% (5) over 2 sessions')).toBeTruthy()
        expect(screen.queryByText(/graded off it/)).toBeNull()
    })
})
