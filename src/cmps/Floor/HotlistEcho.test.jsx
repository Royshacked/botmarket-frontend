import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

vi.mock('../../services/hotlist/hotlist.service.remote.js', () => ({
    hotlistService: { getEcho: vi.fn(), getEchoEvent: vi.fn() },
}))
import { hotlistService } from '../../services/hotlist/hotlist.service.remote.js'
import { HotlistEcho } from './HotlistEcho.jsx'
import { pct, modelDirection, directionLine, recordLine } from './echo.utils.js'

// Echo in the Hotlist (docs/design/echo-desk.md): labelled a forward test first, the record "so far", an event opened
// to its lagging links. Shapes as botmarket-backend echo.service sends them.

afterEach(cleanup)
beforeEach(() => { hotlistService.getEcho.mockReset(); hotlistService.getEchoEvent.mockReset() })

const RECORD = { 20: { n: 1, mean: 0.03, positive: 1 }, 60: { n: 0, mean: null, positive: null }, 120: { n: 0, mean: null, positive: null }, verdictAt: 30, gradedAt120: 0 }
const link = (ticker, group, extra = {}) => ({ ticker, name: `${ticker} Inc.`, relation: 'supplier', layer: 2, direction: 'loses',
    why: `${ticker} builds for the origin.`, note: "confidence high; model's direction gains; FMP: x", group, reaction: 0.01,
    forward: {}, spread: { 20: 0.03, 60: null, 120: null }, ...extra })
const CSCO = { id: 'csco-earnings-2026-11-12', date: '2026-11-12', origin: 'Cisco Systems, Inc.', tickers: ['CSCO'], effect: 'down',
    size: 'Day 0 move -5.9% vs SPY', status: 'checked', links: 3, flagged: [link('JBL', 'flagged')], graded: [20], spread: { 20: 0.03, 60: null, 120: null } }
const CEG = { id: 'ceg-earnings-2026-11-09', date: '2026-11-09', origin: 'Constellation', tickers: ['CEG'], effect: 'up', status: 'late',
    links: 0, flagged: [], graded: [], spread: {} }

describe('Echo — the pure parts', () => {
    it('formats a signed percent', () => {
        expect(pct(0.034)).toBe('+3.4%')
        expect(pct(-0.0591)).toBe('-5.9%')
        expect(pct(null)).toBe('—')
    })
    it("reads the model's own direction out of the note", () => {
        expect(modelDirection("confidence high; model's direction gains; FMP: x")).toBe('gains')
        expect(modelDirection('')).toBeNull()
    })
    it('says the direction follows the move, both ways', () => {
        expect(directionLine({ origin: 'Cisco', effect: 'down' })).toMatch(/Cisco fell .* suppliers and infrastructure are expected to lose .* substitutes to gain/)
        expect(directionLine({ origin: 'CEG', effect: 'up' })).toMatch(/rose .* expected to gain/)
    })
    it('never calls the record the verdict', () => {
        expect(recordLine(RECORD)).toMatch(/^So far — 20 sessions: \+3\.0% over 1 \(100% positive\)\. The verdict reads once, on the first 30 events graded at 120 sessions \(0 so far\)\.$/)
        expect(recordLine({ ...RECORD, 20: { n: 0 } })).toMatch(/^Nothing graded yet\./)
    })
})

describe('Echo — the tab', () => {
    it('opens on the label, then the events', async () => {
        hotlistService.getEcho.mockResolvedValue({ events: [CSCO, CEG], record: RECORD })
        render(<HotlistEcho />)
        expect(screen.getByText(/Forward test — unproven/)).toBeTruthy()
        await screen.findByText('2026-11-12')
        expect(screen.getByText('Grading')).toBeTruthy()
        expect(screen.getByText('Missed')).toBeTruthy()
        expect(screen.getByText('1 of 3')).toBeTruthy()
    })

    it('an opened event shows its lagging links; "All links" shows the rest', async () => {
        hotlistService.getEcho.mockResolvedValue({ events: [CSCO], record: RECORD })
        hotlistService.getEchoEvent.mockResolvedValue({ ...CSCO, all: [link('JBL', 'flagged'), link('FLEX', 'unflagged'), link(null, null, { name: 'Foxconn' })],
            map: { model: 'claude-opus-5-5', promptVersion: '2026-11-19' } })
        const onSymbolClick = vi.fn()
        render(<HotlistEcho onSymbolClick={onSymbolClick} />)
        fireEvent.click(await screen.findByText('2026-11-12'))
        await screen.findByText('JBL')
        expect(screen.queryByText('FLEX')).toBeNull()
        expect(screen.getByText(/Cisco Systems, Inc\. fell on the event/)).toBeTruthy()
        expect(screen.getByText('loses').getAttribute('title')).toMatch(/The model said gains/)
        fireEvent.click(screen.getByText('JBL'))
        expect(onSymbolClick).toHaveBeenCalledWith('JBL')
        fireEvent.click(screen.getByRole('button', { name: 'All 3 links' }))
        expect(screen.getByText('FLEX')).toBeTruthy()
        expect(screen.getByText('Foxconn')).toBeTruthy()
    })

    it('"Ask about this event" hands the event to the event analyst', async () => {
        hotlistService.getEcho.mockResolvedValue({ events: [CSCO], record: RECORD })
        hotlistService.getEchoEvent.mockResolvedValue({ ...CSCO, all: [link('JBL', 'flagged')], map: {} })
        const onAsk = vi.fn()
        render(<HotlistEcho onAsk={onAsk} />)
        fireEvent.click(await screen.findByText('2026-11-12'))
        fireEvent.click(await screen.findByRole('button', { name: 'Ask about this event' }))
        expect(onAsk).toHaveBeenCalledWith(expect.objectContaining({ id: CSCO.id, tickers: ['CSCO'], date: '2026-11-12' }))
    })

    it('no ask handler, no button', async () => {
        hotlistService.getEcho.mockResolvedValue({ events: [CSCO], record: RECORD })
        hotlistService.getEchoEvent.mockResolvedValue({ ...CSCO, all: [link('JBL', 'flagged')], map: {} })
        render(<HotlistEcho />)
        fireEvent.click(await screen.findByText('2026-11-12'))
        await screen.findByText('JBL')
        expect(screen.queryByRole('button', { name: 'Ask about this event' })).toBeNull()
    })

    it('a mapped event not checked yet lists every link', async () => {
        const mapped = { ...CSCO, status: 'mapped', flagged: [] }
        hotlistService.getEcho.mockResolvedValue({ events: [mapped], record: RECORD })
        hotlistService.getEchoEvent.mockResolvedValue({ ...mapped, all: [link('JBL', null), link('FLEX', null)], map: {} })
        render(<HotlistEcho />)
        expect(await screen.findByText('3 links')).toBeTruthy()
        fireEvent.click(screen.getByText('2026-11-12'))
        await screen.findByText('FLEX')
        expect(screen.queryByRole('button', { name: /All \d+ links/ })).toBeNull()
    })

    it('a failed read says so and retries', async () => {
        hotlistService.getEcho.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce({ events: [], record: RECORD })
        render(<HotlistEcho />)
        fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
        await waitFor(() => expect(screen.getByText(/No events yet/)).toBeTruthy())
    })
})
