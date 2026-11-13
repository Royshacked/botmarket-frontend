import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { HotlistDayBoards } from './HotlistDayBoards.jsx'

// The row page draws the daily chart; the chart itself is not this test's (HotlistPanel.test mocks it the same way).
vi.mock('../PriceChart/ChartSurface.jsx', () => ({ ChartSurface: ({ ticker }) => <div className="chart-surface">chart {ticker}</div> }))

// The Intraday tab (backend hotlist.day, 2026-11-11): the day's boards, one at a time, opening on the latest; names in
// play with the numbers, why and their freshest headline — no grade, no room, no result.

const ET = (s) => Date.parse(`2026-11-11T${s}:00-05:00`)
const NOW = () => ET('11:00')
const OPEN = {
    id: 'hd_2026-11-11_open', checkpoint: 'open', status: 'done',
    rows: [{ symbol: 'PLTR', price: 30, gap_pct: 4, pm_vol_pct: 3, why: ['gap +4% on 3% of a day\'s volume pre-market'], quoted_at: ET('09:21'), catalyst: null }],
}
const MID = {
    id: 'hd_2026-11-11_mid', checkpoint: 'mid', status: 'done',
    rows: [
        { symbol: 'SMCI', name: 'Super Micro', price: 41, gap_pct: 6.2, rvol: 2.4, atr_pct: 5.1, why: ['2.4× normal volume, above the open'], quoted_at: ET('10:31'),
            catalyst: { news: [{ title: 'Super Micro beats', at: '2026-11-11 07:05:00' }, { title: 'older', at: '2026-11-11 06:00:00' }], earnings: true, rating: false } },
        { symbol: 'IONQ', price: 12, gap_pct: 3, rvol: 1.8, why: ['1.8× normal volume, above the open'], quoted_at: ET('10:34'), catalyst: null },
    ],
}
const data = (over = {}) => ({ status: 'ok', day: '2026-11-11', boards: [OPEN, MID], ...over })

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('HotlistDayBoards', () => {
    it('opens on the latest board, the boards in the day\'s order with their counts', () => {
        render(<HotlistDayBoards data={data()} now={NOW} />)
        const tabs = within(screen.getByRole('group', { name: 'Day boards' })).getAllByRole('button')
        expect(tabs.map(t => t.textContent)).toEqual(['09:20 1', '10:30 2'])
        expect(tabs[1].getAttribute('aria-pressed')).toBe('true')
        expect(screen.getByText('SMCI')).toBeTruthy()
        expect(screen.queryByText('PLTR')).toBeNull()
    })

    it('a row: price, the move, the volume, and its WHY — the freshest headline with its time and the report flag; no grade', () => {
        const { container } = render(<HotlistDayBoards data={data()} now={NOW} />)
        const row = container.querySelector('tr[data-symbol="SMCI"]')
        const cells = within(row).getAllByRole('cell').map(c => c.textContent)
        expect(cells.slice(1, 6)).toEqual(['SMCI', '41.00', '+6.2%', '2.4×', '5.1'])
        // The board's rule is NOT repeated per row (Roy, 2026-11-12: "all reasons are the same") — the why is the news.
        expect(cells[6]).toContain('07:05 Super Micro beats')
        expect(cells[6]).toContain('reported')
        expect(cells[6]).not.toContain('normal volume, above the open')
        expect(container.querySelector('tr[data-symbol="IONQ"]').textContent).toContain('no fresh headline')
        expect(container.textContent).not.toMatch(/Grade|Room|Result/)
    })

    it("says the board's rule ONCE, what in play means, and when the quotes were taken", () => {
        render(<HotlistDayBoards data={data()} now={NOW} />)
        expect(screen.getByText(/In play on the 10:30 board: up on the day and above the open, on 1\.5×\+ an ordinary day’s volume so far — moving up so far, not a call on\s+where it goes\. Quoted 10:31–10:34 ET, not live\./)).toBeTruthy()
    })

    it("a row opens its page (Roy, 2026-11-12: \"nothing opened when clicking a row\"); the symbol still opens the chart", () => {
        const onOpen = vi.fn(), onSymbolClick = vi.fn()
        const { container } = render(<HotlistDayBoards data={data()} now={NOW} onOpen={onOpen} onSymbolClick={onSymbolClick} />)
        fireEvent.click(container.querySelector('tr[data-symbol="SMCI"] td:last-child'))
        expect(onOpen).toHaveBeenCalledWith('SMCI')
        fireEvent.click(screen.getByText('SMCI'))
        expect(onSymbolClick).toHaveBeenCalledWith('SMCI')
        expect(onOpen).toHaveBeenCalledTimes(1)
    })

    it("the row's page: the numbers, every headline, and Build with Mentor — handing the board's reference (Roy, 2026-11-12)", () => {
        const onBuild = vi.fn()
        render(<HotlistDayBoards data={data()} now={NOW} focus="SMCI" onOpen={vi.fn()} onBuild={onBuild} />)
        expect(screen.getByText('Super Micro beats')).toBeTruthy()
        expect(screen.getByText('older')).toBeTruthy()
        expect(screen.getByText(/Since the last close: reported earnings\./)).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Build a setup' }))
        expect(onBuild).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'SMCI' }), 'mid', { id: 'hd_2026-11-11_mid' })
    })

    it('another board on click; a symbol opens its chart', () => {
        const onSymbolClick = vi.fn()
        render(<HotlistDayBoards data={data()} now={NOW} onSymbolClick={onSymbolClick} />)
        fireEvent.click(screen.getByRole('button', { name: /^09:20/ }))
        expect(screen.getByText('PLTR')).toBeTruthy()
        expect(screen.getByText('3% pre')).toBeTruthy()
        fireEvent.click(screen.getByText('PLTR'))
        expect(onSymbolClick).toHaveBeenCalledWith('PLTR')
    })

    it('no board yet says when they run; a past day\'s boards say so; a partial board warns', () => {
        const { unmount } = render(<HotlistDayBoards data={data({ boards: [], day: null })} now={NOW} />)
        expect(screen.getByText(/the boards run at 09:20, 10:30 and 14:30 ET/)).toBeTruthy()
        unmount()
        render(<HotlistDayBoards data={data({ day: '2026-11-10', boards: [{ ...MID, id: 'hd_2026-11-10_mid', status: 'partial' }] })} now={NOW} />)
        expect(screen.getByText(/The latest boards are from 2026-11-10 — the next runs at 09:20 ET on a trading day/)).toBeTruthy()
        expect(screen.getByText(/stopped early/)).toBeTruthy()
    })

    it("the latest is the day's LAST CHECKPOINT, not the last to finish — a re-run 09:20 does not take the screen", () => {
        // 09:20 re-run after 10:30: it arrives LAST from the server (by finished_at).
        render(<HotlistDayBoards data={data({ boards: [MID, OPEN] })} now={NOW} />)
        const btns = within(screen.getByRole('group', { name: 'Day boards' })).getAllByRole('button')
        expect(btns.map(b => b.textContent)).toEqual(['09:20 1', '10:30 2'], "buttons in the day's order")
        expect(btns[1].getAttribute('aria-pressed')).toBe('true')
        expect(screen.getByText('SMCI')).toBeTruthy()
    })

    it('held by the panel: the board on screen is the held one, and a choice is reported up', () => {
        const onBoard = vi.fn()
        render(<HotlistDayBoards data={data()} now={NOW} boardId={OPEN.id} onBoard={onBoard} />)
        expect(screen.getByText('PLTR')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: /^10:30/ }))
        expect(onBoard).toHaveBeenCalledWith(MID.id)
    })

    it('a day the user stepped back to: its boards with no stale note; none that day says so', () => {
        const { unmount } = render(<HotlistDayBoards data={data({ day: '2026-11-04' })} day="2026-11-04" now={NOW} />)
        expect(screen.queryByText(/latest boards are from/)).toBeNull()
        unmount()
        render(<HotlistDayBoards data={data({ day: null, boards: [] })} day="2026-11-04" now={NOW} />)
        expect(screen.getByText('No day boards on 2026-11-04.')).toBeTruthy()
    })

    it("a headline from the evening before shows its day on the board's row (the live drive, 2026-11-11)", () => {
        const board = { ...MID, day: '2026-11-11', rows: [{ ...MID.rows[0], catalyst: { news: [{ title: 'Investigation notice', at: '2026-11-10 18:29:00' }], earnings: false, rating: false } }] }
        const { container } = render(<HotlistDayBoards data={data({ boards: [board] })} now={NOW} />)
        expect(container.querySelector('tr[data-symbol="SMCI"]').textContent).toContain('Tue 18:29 Investigation notice')
    })

    it('a board with no names says so; a failed read offers a retry', () => {
        const onRetry = vi.fn()
        const { unmount } = render(<HotlistDayBoards data={data({ boards: [{ ...MID, rows: [] }] })} now={NOW} />)
        expect(screen.getByText(/No names in play on the 10:30 board/)).toBeTruthy()
        unmount()
        render(<HotlistDayBoards data={{ status: 'error', boards: [] }} now={NOW} onRetry={onRetry} />)
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
        expect(onRetry).toHaveBeenCalled()
    })
})
