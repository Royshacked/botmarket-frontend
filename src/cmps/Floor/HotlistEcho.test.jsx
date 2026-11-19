import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.mock('../../services/hotlist/hotlist.service.remote.js', () => ({
    hotlistService: { getEcho: vi.fn(), getEchoEvent: vi.fn() },
}))
import { hotlistService } from '../../services/hotlist/hotlist.service.remote.js'
// The name's page: its own parts (the profile, the chart) are HotlistRowPage's and tested there — stubbed to what it is given.
vi.mock('./HotlistRowPage.jsx', () => ({
    HotlistRowPage: ({ symbol, horizon, facts, children }) => (
        <div data-testid="row-page" data-symbol={symbol} data-horizon={horizon}>
            {facts.map(([label, value]) => <span key={label}>{`${label}: ${value}`}</span>)}{children}
        </div>
    ),
}))
import { HotlistEcho } from './HotlistEcho.jsx'
import { pct, evidenceWords, recordLine, linkFacts, echoLine, echoHandoff, yardLine } from './echo.utils.js'
import { handoffTurn } from '../MentorSurface/mentorSurface.utils.js'

// Echo in the Hotlist, built to the simulator design (backend docs/design/echo-pipeline.md): events of every kind, links
// ranked by score with the six factors and their reasons, the day-5 flags, the trader and the event analyst a click away.
// Shapes as botmarket-backend echo.service sends them.

afterEach(cleanup)
beforeEach(() => { hotlistService.getEcho.mockReset(); hotlistService.getEchoEvent.mockReset() })

const ID = 'ev_0b6f1c2a-1111-4222-8333-944455556666'
const REPORT = { events: 2, horizons: { 20: { vsStandIns: { n: 2, mean: 0.031, median: 0.02 } } }, walkForward: { note: '0 of 30 events graded at 120 sessions — no reweighting yet' } }
const SUMMARY = { id: ID, kind: 'house', mine: false, date: '2026-11-12', type: 'demand_shock', origin: 'Cisco Systems, Inc.', tickers: ['CSCO'], effect: 'down',
    durability: 'price_spike', whatChanged: 'Cisco guided networking hardware lower', status: 'watching', links: 3, high: 1,
    flagged: [{ ticker: 'FN', flag: 'overreacted_loser', total: 5 }], top: [{ ticker: 'VRT', total: 9 }, { ticker: 'PLUS', total: 6 }], graded: [] }
const factors = {
    lockIn: { score: 2, why: 'multi-year capex' }, supplyResponse: { score: 2, why: 'years to build' },
    bottleneck: { score: 2, why: 'scarce cooling capacity', evidence: 'both', quote: 'Our record backlog provides clear visibility.' },
    directness: { score: 1, why: 'a lag' }, exposure: { score: 1, source: 'estimated', why: 'a guess (estimated)' }, coverage: { score: 1, why: '14 analysts' },
}
const link = (ticker, extra = {}) => ({ ticker, name: `${ticker} Inc.`, relation: 'supplier', layer: 2, direction: 'loses', why: `${ticker} builds for Cisco.`,
    total: 4, high: false, factors: null, filings: { named: false }, check: { signedMove: 0.01, volume: { day5: 0.8 } }, flag: null, flagWhy: null, grades: {}, supplySentences: [], ...extra })
const EVENT = { ...SUMMARY, event: { date: '2026-11-12', whatChanged: 'Cisco guided networking hardware lower', size: 'Day 0 -5.9% vs SPY', durability: { kind: 'price_spike', why: 'one quarter' }, effect: 'down', tickers: ['CSCO'], origin: 'Cisco Systems, Inc.', source: 'earnings' },
    map: { model: 'claude-opus-5-5' }, scored: { scoredAt: '2026-11-19T00:00:00Z' }, checked: { checkDay: '2026-11-19', yardstick: { median: 0.03, from: 'layer 1', n: 2 } }, triggers: [],
    links: [
        link('FN', { total: 5, flag: 'overreacted_loser', flagWhy: 'fell -12.0% vs SPY by day 5', filings: { named: true, share: { share: 0.199 }, excerpt: 'Cisco … 19.9%' }, check: { signedMove: 0.12, volume: { day5: 2.1 } } }),
        link('VRT', { relation: 'infrastructure', layer: 3, total: 9, high: true, factors, check: { signedMove: 0.005 } }),
        link('PLUS', { relation: 'customer', layer: 1, total: 6, filings: { named: true } }),
    ] }

describe('Echo — the pure parts', () => {
    it('formats a signed percent and the filing evidence', () => {
        expect(pct(0.034)).toBe('+3.4%')
        expect(evidenceWords({ share: { share: 0.199 } })).toBe('19.9% of revenue')
        expect(evidenceWords({ share: { share: 0.1, atLeast: true } })).toBe('>10.0% of revenue')
        expect(evidenceWords({ named: true })).toBe('named in filings')
        expect(evidenceWords({ named: null })).toBe('—')
    })
    it('never calls the record the verdict', () => {
        expect(recordLine(REPORT)).toMatch(/^So far — 20 sessions: flagged \+3\.1% vs same-sector stand-ins \(2 events\)\. 0 of 30/)
        expect(recordLine(null)).toMatch(/unproven until the validation has its events/)
    })
    it('the hand-off to the trader is a reference — the event — the server reads the rest', () => {
        const h = echoHandoff(EVENT, EVENT.links[0])
        expect(h.echo).toEqual({ event: ID })
        expect(h.direction).toBe('long')
        expect(h.thesis).toBe(null, 'a reference only — the server reads its own thesis back')
        expect(handoffTurn(h).seed.echo).toEqual({ event: ID })
        expect(yardLine({ checkDay: '2026-11-19', yardstick: { median: 0.059, from: 'the origin', n: 1 } })).toBe('Day-5 check (2026-11-19): the origin moved +5.9% its way — the yardstick.')
        expect(yardLine({ checkDay: '2026-11-19', yardstick: { median: null, from: null, n: 0 } })).toMatch(/no yardstick/)
        expect(echoLine(EVENT, EVENT.links[1])).toBe('Cisco guided networking hardware lower (2026-11-12); VRT is its infrastructure — VRT builds for Cisco.')
        expect(linkFacts(EVENT.links[1]).find(f => f[0] === 'Score')[1]).toBe('9 / 12 · high')
    })
})

describe('Echo — the tab', () => {
    it('opens on the label, the record, then the events with their top scores and flags', async () => {
        hotlistService.getEcho.mockResolvedValue({ events: [SUMMARY], report: REPORT })
        render(<HotlistEcho />)
        expect(screen.getByText(/Echo — unproven\./)).toBeTruthy()
        await screen.findByText(/So far — 20 sessions/)
        expect(screen.getByText('VRT 9 · PLUS 6')).toBeTruthy()
        expect(screen.getByText('FN')).toBeTruthy()
        expect(screen.getByText('demand shock')).toBeTruthy()
    })

    it('an opened event: its record, the check, the links ranked with score, evidence, day 5 and flag', async () => {
        hotlistService.getEcho.mockResolvedValue({ events: [SUMMARY], report: REPORT })
        hotlistService.getEchoEvent.mockResolvedValue(EVENT)
        render(<HotlistEcho />)
        fireEvent.click(await screen.findByRole('button', { name: 'CSCO event of 2026-11-12' }))
        await screen.findByText('19.9% of revenue')
        expect(screen.getByText(/Durability:/).textContent).toMatch(/price spike — one quarter/)
        expect(screen.getByText(/Day-5 check \(2026-11-19\): layer 1 \(2 names\) moved \+3\.0%/)).toBeTruthy()
        const rows = [...document.querySelectorAll('.echo-links tbody tr')].map(r => r.getAttribute('data-symbol'))
        expect(rows).toEqual(['FN', 'VRT', 'PLUS'])
        expect(screen.getByText('9 ★')).toBeTruthy()
        expect(screen.getByText('Overreacted')).toBeTruthy()
    })

    it("a name's page: why it scores, factor by factor with the evidence; the trader and the event analyst a click away", async () => {
        hotlistService.getEcho.mockResolvedValue({ events: [SUMMARY], report: REPORT })
        hotlistService.getEchoEvent.mockResolvedValue(EVENT)
        const onOpen = vi.fn(), onBuild = vi.fn(), onAsk = vi.fn()
        const { rerender } = render(<HotlistEcho onOpen={onOpen} onBuild={onBuild} onAsk={onAsk} />)
        fireEvent.click(await screen.findByRole('button', { name: 'CSCO event of 2026-11-12' }))
        fireEvent.click(await screen.findByRole('button', { name: 'VRT' }))
        expect(onOpen).toHaveBeenCalledWith('VRT')
        rerender(<HotlistEcho onOpen={onOpen} onBuild={onBuild} onAsk={onAsk} focus="VRT" />)
        const page = screen.getByTestId('row-page')
        expect(page.getAttribute('data-horizon')).toBe('swing')
        expect(page.textContent).toMatch(/Why it scores 9 \/ 12 — high/)
        expect(page.textContent).toMatch(/Bottleneck · both/)
        expect(page.textContent).toMatch(/scarce cooling capacity/)
        expect(page.textContent).toMatch(/Our record backlog provides clear visibility\./)
        expect(page.textContent).toMatch(/a lead, not a pick/)
        expect(screen.queryByRole('button', { name: 'Build with the trader' }), 'not flagged: no trade lead').toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Ask about this event' }))
        expect(onAsk).toHaveBeenCalledWith(expect.objectContaining({ id: ID }))
        // The flagged name: to the trader, as a reference.
        rerender(<HotlistEcho onOpen={onOpen} onBuild={onBuild} onAsk={onAsk} focus="FN" />)
        fireEvent.click(screen.getByRole('button', { name: 'Build with the trader' }))
        expect(onBuild).toHaveBeenCalledWith({ ticker: 'FN', direction: 'long', thesis: null, echo: { event: ID } })
        // Back: the list was there all along, the opened event with it.
        rerender(<HotlistEcho onOpen={onOpen} onBuild={onBuild} onAsk={onAsk} />)
        expect(screen.queryByTestId('row-page')).toBeNull()
        expect(document.querySelectorAll('.echo-links tbody tr').length).toBe(3)
        expect(hotlistService.getEchoEvent).toHaveBeenCalledTimes(1)
    })

    it('an event not mapped yet says where it stands; a failed read retries', async () => {
        hotlistService.getEcho.mockResolvedValue({ events: [{ ...SUMMARY, status: 'framed', top: [], flagged: [] }], report: null })
        hotlistService.getEchoEvent.mockResolvedValue({ ...EVENT, status: 'framed', links: [], checked: null, scored: null, waiting: null })
        render(<HotlistEcho />)
        fireEvent.click(await screen.findByRole('button', { name: 'CSCO event of 2026-11-12' }))
        expect((await screen.findAllByText(/found — the map comes next/)).length).toBeGreaterThan(0)
        cleanup()
        hotlistService.getEcho.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce({ events: [], report: null })
        render(<HotlistEcho />)
        fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
        await screen.findByText(/No events yet/)
    })
})
