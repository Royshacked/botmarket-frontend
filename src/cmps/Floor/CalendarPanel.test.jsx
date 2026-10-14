import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react'
import { CalendarPanel, CALENDAR_PANEL_ID } from './CalendarPanel.jsx'
import { openPanel, closePanel } from '../DetailPanel/detailPanel.store.js'
import { calendarService } from '../../services/calendar/calendar.service.remote.js'
import { todayIso, monthGrid, monthOf } from './calendar.utils.js'

// The Floor's Calendar (2026-10-14): a month grid in the detail panel, three counts per day, and
// a date page that replaces the grid when a day is clicked.

vi.mock('../../services/calendar/calendar.service.remote.js', () => ({
    calendarService: { getCounts: vi.fn(), getDay: vi.fn() },
}))

const today = todayIso()
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })

beforeEach(() => {
    calendarService.getCounts.mockResolvedValue({ days: { [today]: { earnings: 12, fed: 1, ipo: 0 } } })
    calendarService.getDay.mockResolvedValue({
        date: today,
        earnings: [{ symbol: 'AAPL', name: 'Apple Inc', date: today, time: 'amc' }],
        fed:      [{ date: today, event: 'CPI (Inflation)', impact: 'high', time: '8:30a' }],
        ipo:      [],
    })
})
afterEach(() => { cleanup(); closePanel(); vi.clearAllMocks() })

async function openCalendar(props = {}) {
    render(<CalendarPanel {...props} />)
    act(() => openPanel(CALENDAR_PANEL_ID))
    await flush()
}
const todayCell = () => screen.getByRole('button', { name: new RegExp(`^[A-Za-z]+, [A-Za-z]+ ${Number(today.slice(8))}:`) })

describe('CalendarPanel', () => {
    it('renders nothing and fetches nothing while closed', () => {
        render(<CalendarPanel />)
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(calendarService.getCounts).not.toHaveBeenCalled()
    })

    it('opens on this month, asking for the whole padded grid', async () => {
        await openCalendar()
        const { from, to } = monthGrid(monthOf())
        expect(calendarService.getCounts).toHaveBeenCalledWith(from, to)
        expect(screen.getByRole('dialog')).toBeTruthy()
    })

    it('shows each day\'s counts, and only the kinds it has', async () => {
        await openCalendar()
        const cell = todayCell()
        expect(cell.getAttribute('aria-label')).toMatch(/12 earnings, 1 Fed release$/)
        expect(within(cell).getByText('12')).toBeTruthy()
        expect(within(cell).queryByText(/IPO/)).toBeNull()
        expect(cell.className).toMatch(/cal-cell--today/)
        expect(cell.className).not.toMatch(/cal-cell--key/)
    })

    // A CPI morning must stand out from a Jobless Claims one (Roy, 2026-10-14).
    it('marks and names a day with an important Fed release', async () => {
        calendarService.getCounts.mockResolvedValue({ days: { [today]: { earnings: 3, fed: 2, ipo: 0, fedHigh: ['CPI', 'FOMC'] } } })
        await openCalendar()
        const cell = todayCell()
        expect(cell.className).toMatch(/cal-cell--key/)
        expect(within(cell).getByText('★ CPI · FOMC')).toBeTruthy()
        expect(cell.getAttribute('aria-label')).toMatch(/important: CPI, FOMC$/)
    })

    // The month's name sits between the arrows, and clicking it comes back to this month.
    it('names the month between the arrows, and the name returns to this month', async () => {
        await openCalendar()
        const thisMonth = new Date().toLocaleString('en-US', { month: 'long' })
        expect(screen.getByRole('button', { name: thisMonth })).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'Today' })).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
        fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
        await flush()
        expect(screen.queryByRole('button', { name: thisMonth })).toBeNull()
        fireEvent.click(screen.getByTitle('Back to this month'))
        expect(screen.getByRole('button', { name: thisMonth })).toBeTruthy()
    })

    it('pages months without refetching one it has already read', async () => {
        await openCalendar()
        fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
        await flush()
        fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
        await flush()
        expect(calendarService.getCounts).toHaveBeenCalledTimes(2)
    })

    it('a clicked day REPLACES the grid with its page; back returns to the month', async () => {
        await openCalendar()
        fireEvent.click(todayCell())
        await flush()
        expect(calendarService.getDay).toHaveBeenCalledWith(today)
        expect(document.querySelector('.cal-grid')).toBeNull()
        expect(screen.getByText('CPI (Inflation)')).toBeTruthy()
        expect(screen.getByText('AAPL')).toBeTruthy()
        // Fed first, then earnings — and no empty IPO section.
        expect([...document.querySelectorAll('.cal-day__head')].map(h => h.textContent)).toEqual(['Fed (1)', 'Earnings (1)'])

        fireEvent.click(screen.getByRole('button', { name: /^‹ [A-Z][a-z]+$/ }))
        expect(document.querySelector('.cal-grid')).toBeTruthy()
    })

    // Mentor is in the chat column UNDER the panel: hand the row over and get out of the way.
    it('an earnings row closes the panel and hands the event to Mentor', async () => {
        const onEarningSelect = vi.fn()
        await openCalendar({ onEarningSelect })
        fireEvent.click(todayCell())
        await flush()
        fireEvent.click(screen.getByText('AAPL').closest('button'))
        expect(onEarningSelect).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'AAPL' }))
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('says so when a day is empty', async () => {
        calendarService.getDay.mockResolvedValue({ date: today, earnings: [], fed: [], ipo: [] })
        await openCalendar()
        fireEvent.click(todayCell())
        await flush()
        expect(screen.getByText('Nothing scheduled on this day.')).toBeTruthy()
    })

    // A failed read is not a quiet month.
    it('reports a failed month and retries on request', async () => {
        calendarService.getCounts.mockRejectedValueOnce(new Error('down'))
        await openCalendar()
        expect(screen.getByText(/Couldn’t load this month/)).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
        await flush()
        expect(calendarService.getCounts).toHaveBeenCalledTimes(2)
        expect(screen.queryByText(/Couldn’t load this month/)).toBeNull()
    })

    it('reopens on the month grid, not the last date page', async () => {
        await openCalendar()
        fireEvent.click(todayCell())
        await flush()
        act(() => closePanel())
        act(() => openPanel(CALENDAR_PANEL_ID))
        await flush()
        expect(document.querySelector('.cal-grid')).toBeTruthy()
    })
})
