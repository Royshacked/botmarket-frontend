import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen as rtl, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { ADMIN, MEMBER } from '../../testUtils/authStub.js'

// Pythia's assessment board (backend docs/design/pythia-assessment.md): the verdict words, how far the
// price has gone, what caused the move, the track record, and an admin's "Assess now".

let AUTH = MEMBER
vi.mock('../../context/AuthContext.jsx', async (orig) => ({ ...(await orig()), useAuth: () => AUTH }))
const assessNow = vi.fn(async () => ({ ok: true, doc: { verdict: 'watch' }, cost_usd: 0.004 }))
vi.mock('../../services/strategy/strategy.service.remote.js', () => ({
    INDUSTRIES_CHANGED: 'strategy-industries-changed',
    strategyService: { assessNow: (...a) => assessNow(...a) },
}))

import { AssessmentView } from './AssessmentView.jsx'
import { IndustryView } from './IndustryView.jsx'
import { movedLine, moneyLine, groupByVerdict, recordWords, isExpired, ordinal, CAUSE_WORD } from './assessmentWords.js'

afterEach(() => { cleanup(); vi.clearAllMocks(); AUTH = MEMBER })

const A = (over = {}) => ({
    id: 'ia_ind_45301020', subject: { kind: 'industry', code: '45301020', name: 'Semiconductors', sector: 'Information Technology' },
    verdict: 'watch', horizon: 'months', confidence: 'low', confidence_reason: 'news search refused',
    thesis: 'Strong growth, but margins above their range and the run is stretched.',
    cause: { kind: 'unverified', text: 'headlines point to AI demand; not confirmed' },
    evidence: { news: 'AMD raised 2027 supply (Oct 9).', price: 'Up 188% in 24 months vs SPY +40%.' },
    gaps: ['geopolitics'], second_order: 'Foundries and packaging benefit.',
    risks: ['margins above the 10-year range'], change_view_if: ['TSMC cuts guidance on Oct 15'],
    moved: { ret_24m: 1.88, spy_24m: 0.4, ret_12m: 0.9, spy_12m: 0.17, ext_percentile: 0.64, hype: true },
    base_rates: [{ key: 'hype', text: '22% fell 40%+ within 24 months (base 9%).' }],
    money: { capex_change: 0.5, capex_prev_change: 0.1, capex_share_up: 0.71 },
    structure: { demand: 'growing', economics: 'good', cycle: 'peak' },
    assessed_at: '2026-10-10T17:52:52.516Z', expires_at: '2099-11-21T00:00:00.000Z',
    ...over,
})
const DATA = {
    assessments: [A(), A({ id: 'x', subject: { code: '1', name: 'Steel', sector: 'Materials' }, verdict: 'avoid', moved: { hype: false }, cause: { kind: 'none', text: 'no news, no money' } })],
    record: { total: 2, open: 2, by_verdict: {} },
}

describe('assessment words', () => {
    it('says how far it moved and how stretched, with a real ordinal', () => {
        expect(movedLine(A().moved)).toBe('24m +188% vs SPY +40% · stretched: 64th percentile')
        expect(movedLine({ ret_12m: 0.1, spy_12m: 0.05 })).toBe('12m +10% vs SPY +5%')
        expect(movedLine(null)).toBeNull()
        expect([1, 2, 3, 11, 22, 92].map(ordinal)).toEqual(['1st', '2nd', '3rd', '11th', '22nd', '92nd'])
    })

    it('keeps "could not check" apart from "nothing moved it"', () => {
        expect(CAUSE_WORD.unverified).toMatch(/not verified/)
        expect(CAUSE_WORD.none).toMatch(/hype pattern/)
    })

    it('groups best verdict first and filters by the search', () => {
        expect(groupByVerdict(DATA.assessments).map(([v]) => v)).toEqual(['watch', 'avoid'])
        expect(groupByVerdict(DATA.assessments, 'steel').map(([v, l]) => [v, l.length])).toEqual([['avoid', 1]])
    })

    it('words the track record, and says when the first grade comes', () => {
        expect(recordWords(null).headline).toMatch(/No calls yet/)
        expect(recordWords(DATA.record).headline).toMatch(/2 calls logged, 2 still open — the first grades come three months/)
        const graded = recordWords({ total: 3, open: 1, by_verdict: { avoid: { '3m': { n: 2, right: 0.5, avg_vs_spy: -0.031 } } } })
        expect(graded.lines).toEqual(['Avoid at 3m: 2 graded, right 50%, basket vs SPY -3.1% on average'])
    })

    it('says where the companies put their money, in one line', () => {
        expect(moneyLine({ capex_change: 0.5, capex_prev_change: 0.1, capex_share_up: 0.71, buybacks_change: -0.17, share_count_median_change: -0.012 }))
            .toBe('Capex +50% (a year earlier +10%; 71% of companies raised it) · buybacks -17% · share count -1.2%')
        expect(moneyLine(null)).toBeNull()
        expect(moneyLine({ capex_change: null })).toBeNull()
    })

    it('marks an assessment past its expiry', () => {
        expect(isExpired({ expires_at: '2020-01-01T00:00:00Z' })).toBe(true)
        expect(isExpired(A())).toBe(false)
    })
})

describe('AssessmentView', () => {
    it('shows each verdict with its thesis, the hype flag and the track record', () => {
        render(<AssessmentView data={DATA} />)
        expect(rtl.getByText(/2 calls logged/)).toBeTruthy()
        expect(rtl.getAllByText('Watch').length).toBeGreaterThan(0)
        expect(rtl.getByText('hype')).toBeTruthy()
        expect(document.querySelector('.assessment-view .industry-view__summary-bar').textContent).toMatch(/2 industries assessed/)
    })

    it('opens a row: the cause, the move, the base rate, the evidence and what it did not use', () => {
        render(<AssessmentView data={DATA} />)
        fireEvent.click(rtl.getAllByRole('button', { name: /Semiconductors/ })[0])
        expect(rtl.getByText(/not verified — the research could not be done/)).toBeTruthy()
        expect(rtl.getByText(/24m \+188% vs SPY \+40%/)).toBeTruthy()
        expect(rtl.getByText(/22% fell 40%\+/)).toBeTruthy()
        expect(rtl.getByText(/AMD raised 2027 supply/)).toBeTruthy()
        expect(rtl.getByText(/Not part of this verdict: Geopolitics/)).toBeTruthy()
        expect(rtl.getByText(/TSMC cuts guidance/)).toBeTruthy()
        expect(rtl.getByText(/Capex \+50% \(a year earlier \+10%; 71% of companies raised it\)/)).toBeTruthy()
    })

    it('a trader sees no Assess now; an admin runs one and sees its cost', async () => {
        render(<AssessmentView data={DATA} industries={[{ code: '45301020', name: 'Semiconductors' }]} />)
        expect(rtl.queryByRole('button', { name: 'Assess now' })).toBeNull()
        cleanup()
        AUTH = ADMIN
        render(<AssessmentView data={DATA} industries={[{ code: '45301020', name: 'Semiconductors' }]} />)
        fireEvent.change(rtl.getByLabelText('Industry to assess'), { target: { value: '45301020' } })
        fireEvent.click(rtl.getByRole('button', { name: 'Assess now' }))
        await waitFor(() => expect(rtl.getByText(/Published: Watch · cost \$0\.0040/)).toBeTruthy())
        expect(assessNow).toHaveBeenCalledWith('45301020')
    })

    it('says so when nothing is assessed yet', () => {
        render(<AssessmentView data={null} />)
        expect(rtl.getByText(/No industry assessed yet/)).toBeTruthy()
        expect(rtl.getByText(/No calls yet/)).toBeTruthy()
    })

    it('is the Assessed tab on the Forecasts board, between Trade now and Structure', () => {
        render(<IndustryView industries={[]} screen={null} assessments={DATA} />)
        expect(rtl.getAllByRole('tab').map(t => t.textContent)).toEqual(['Trade now', 'Assessed', 'Structure'])
        fireEvent.click(rtl.getByRole('tab', { name: 'Assessed' }))
        expect(document.querySelector('.assessment-view .industry-view__summary-bar').textContent).toMatch(/2 industries assessed/)
    })
})
