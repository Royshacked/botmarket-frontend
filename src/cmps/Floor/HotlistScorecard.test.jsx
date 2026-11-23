import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.mock('../../services/hotlist/hotlist.service.remote.js', () => ({ hotlistService: { getScorecard: vi.fn() } }))

import { hotlistService } from '../../services/hotlist/hotlist.service.remote.js'
import { HotlistScorecard } from './HotlistScorecard.jsx'

// Prometheus's scorecard in the Book (Roy, 2026-10-27): his calls frozen and graded vs SPY; reads backed vs passed.

const S = (n, mean, judge = n >= 20) => ({ n, mean, median: mean, beat: 50, judge })
const CARD = {
    min_judge: 20,
    coverage: {
        forward: { calls: 0, open: 0, marks: {}, target: { settled: 0, reached: 0 }, by_rating: {} },
        backfill: { calls: 230, open: 230, marks: { '1m': { calls: S(77, 0.05), holds: S(27, -4.1) } }, target: { settled: 0, reached: 0 },
            by_rating: { buy: { '1m': S(60, -0.43) }, hold: { '1m': S(27, -4.1) } } },
    },
    catalyst: { backed: { reads: 3, hit: 1, window: S(3, 2) }, passes: { reads: 4, window: S(4, -1), by_reason: { already_ran: S(2, -2), unclear: S(0, null) } }, open: 1 },
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('HotlistScorecard', () => {
    it('shows the seeded source with its ratings, and the backed reads against the passes by reason', async () => {
        hotlistService.getScorecard.mockResolvedValue(CARD)
        render(<HotlistScorecard />)
        expect(await screen.findByText('Before it (seeded)')).toBeTruthy()
        expect(screen.queryByText('Since the scorecard')).toBeNull()
        expect(screen.getByText('+0.1% · 50% beat · 77')).toBeTruthy()
        expect(screen.getByText('buy')).toBeTruthy()
        expect(screen.getByText(/vs SPY, unsigned/)).toBeTruthy()
        expect(screen.getByText('Backed — confirmed')).toBeTruthy()
        expect(screen.getByText('it already ran its usual run-up this cycle')).toBeTruthy()
        expect(screen.queryByText('too thin to tell'), 'a reason with nothing graded is left out').toBeNull()
        expect(screen.getByText('+2.0% · 50% beat · 3').className).toMatch(/hot-result--dim/)
    })

    // Roy, 2026-10-28: "if I want to see how the coverages did with the new rating, I need to see it in the scorecard".
    it('shows the calls by the house bands at the call, then as he rated them', async () => {
        const banded = { ...CARD, coverage: { ...CARD.coverage, backfill: { ...CARD.coverage.backfill,
            by_band: { strong_buy: { '1m': S(38, 2.62) }, hold: { '1m': S(30, -3.14) } } } } }
        hotlistService.getScorecard.mockResolvedValue(banded)
        render(<HotlistScorecard />)
        await screen.findByText('By the house bands')
        const rows = [...document.querySelectorAll('.hot-score tr.hot-row th')].map(t => t.textContent.split(' · ')[0])
        expect(rows.slice(0, 6)).toEqual(['Before it (seeded)', 'By the house bands', 'strong buy', 'hold', 'As he rated them', 'buy'])
        expect(screen.getByText('+2.6% · 50% beat · 38')).toBeTruthy()
    })

    // Roy, 2026-11-22: judged as Wall Street judges a rating book — against the sector, buys minus sells — and with the
    // industry strategist or against her.
    it('reads against SPY or the sector, shows buys minus sells and the calls with Pythia or against her', async () => {
        const spread = { '1m': { n: 30, buys: 22, sells: 8, buy_mean: -1, sell_mean: -6, mean: 5, judge: false } }
        const read = (mean) => ({ marks: { '1m': { calls: S(77, mean), holds: S(27, -1) } }, by_rating: {}, by_band: {},
            spread: { by_band: spread, by_rating: {} }, by_pythia: { with: { calls: 40, marks: { '1m': S(40, 1.5) } }, against: { calls: 9, marks: { '1m': S(9, -3) } } } })
        const card = { ...CARD, coverage: { ...CARD.coverage, backfill: { ...CARD.coverage.backfill, ...read(0.05), sector: { graded: 70, ...read(2.4) } } } }
        hotlistService.getScorecard.mockResolvedValue(card)
        render(<HotlistScorecard />)
        await screen.findByText('Buys − sells, by the house bands')
        expect(screen.getByText('+5.0% · 22 / 8').title).toMatch(/the buys beat the sells by \+5\.0%.*too few to judge/)
        expect(screen.getByText('With the industry strategist')).toBeTruthy()
        expect(screen.getByText('against her')).toBeTruthy()
        expect(screen.getByText('+0.1% · 50% beat · 77')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'vs its sector' }))
        expect(screen.getByText('+2.4% · 50% beat · 77').title).toMatch(/vs its sector fund/)
        expect(screen.getByText(/70 with a sector read/)).toBeTruthy()
    })

    it('says so when it could not load', async () => {
        hotlistService.getScorecard.mockRejectedValue(new Error('x'))
        render(<HotlistScorecard />)
        expect(await screen.findByText('The scorecard could not be loaded.')).toBeTruthy()
    })
})
