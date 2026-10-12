import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen as rtl, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import { ADMIN, MEMBER } from '../../testUtils/authStub.js'

// Pythia's assessment board (backend docs/design/pythia-assessment.md): the verdict words, how far the
// price has gone, what caused the move, the track record, and an admin's "Assess now".

let AUTH = MEMBER
const running = new Set()
vi.mock('../../context/AuthContext.jsx', async (orig) => ({ ...(await orig()), useAuth: () => AUTH }))
const assessNow = vi.fn(async () => ({ ok: true, doc: { verdict: 'watch' }, cost_usd: 0.004 }))
const runWeek = vi.fn(async () => ({ ok: true, outcome: 'started' }))
vi.mock('../../services/strategy/strategy.service.remote.js', () => ({
    INDUSTRIES_CHANGED: 'strategy-industries-changed',
    strategyService: {
        assessNow: (...a) => assessNow(...a),
        runWeek: (...a) => runWeek(...a),
        isRunning: (k) => running.has(k),
        runError: (err) => (err?.code === 'already_running' ? 'already running — wait for it to finish' : err?.response?.data?.detail ?? err?.message),
    },
}))

import { AssessmentView } from './AssessmentView.jsx'
import { IndustryView } from './IndustryView.jsx'
import { movedLine, moneyLine, flowLines, groupByVerdict, recordWords, isExpired, ordinal, CAUSE_WORD, weekHeadline, weekResultLine, VERDICT_ORDER, VERDICT_LABEL, verdictKey, linkMoveLine } from './assessmentWords.js'

afterEach(() => { cleanup(); vi.clearAllMocks(); AUTH = MEMBER; running.clear() })

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
        expect(movedLine({ ret_24m: 1.88, spy_24m: 0.4, ret_24m_vw: 1.41 })).toBe('24m +188% vs SPY +40% · by size +141%')
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
        expect(document.querySelector('.assessment-view .industry-view__summary-bar').textContent).toMatch(/2 industries and themes assessed/)
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

    it('a refused run says why, in a live region', async () => {
        AUTH = ADMIN
        assessNow.mockRejectedValueOnce({ response: { status: 422, data: { outcome: 'refused', detail: 'evidence.news is required' } } })
        render(<AssessmentView data={DATA} industries={[{ code: '45301020', name: 'Semiconductors' }]} />)
        fireEvent.change(rtl.getByLabelText('Industry to assess'), { target: { value: '45301020' } })
        fireEvent.click(rtl.getByRole('button', { name: 'Assess now' }))
        await waitFor(() => expect(rtl.getAllByRole('status').some(s => s.textContent === 'Not published (refused): evidence.news is required')).toBe(true))
    })

    it('a run already in flight (a remount mid-run) shows as running and cannot be clicked again', () => {
        AUTH = ADMIN
        running.add('industry:45301020')
        render(<AssessmentView data={DATA} industries={[{ code: '45301020', name: 'Semiconductors' }, { code: '1', name: null }]} />)
        fireEvent.change(rtl.getByLabelText('Industry to assess'), { target: { value: '45301020' } })
        const btn = rtl.getByRole('button', { name: 'Assessing…' })
        expect(btn.disabled).toBe(true)
        fireEvent.click(btn)
        expect(assessNow).not.toHaveBeenCalled()
        // The run lands: the service announces, and the button lets go without waiting for the board's refresh.
        running.delete('industry:45301020')
        act(() => { window.dispatchEvent(new CustomEvent('strategy-industries-changed')) })
        expect(rtl.getByRole('button', { name: 'Assess now' }).disabled).toBe(false)
    })

    it('a theme\'s assessment is labelled as a theme', () => {
        const theme = A({ id: 'ia_th_ai', subject: { kind: 'theme', id: 'th_ai', name: 'AI compute', sector: null } })
        render(<AssessmentView data={{ assessments: [theme], record: null }} />)
        expect(rtl.getByText('theme')).toBeTruthy()
        expect(document.querySelector('.assessment-view .industry-view__summary-bar').textContent).toMatch(/1 industry or theme assessed/)
    })

    it('says so when nothing is assessed yet', () => {
        render(<AssessmentView data={null} />)
        expect(rtl.getByText(/No industry assessed yet/)).toBeTruthy()
        expect(rtl.getByText(/No calls yet/)).toBeTruthy()
    })

    it('the Forecasts board opens on Assessed — Trade now is retired', () => {
        render(<IndustryView industries={[]} assessments={DATA} />)
        expect(rtl.getAllByRole('tab').map(t => t.textContent)).toEqual(['Assessed', 'Themes', 'Structure'])
        expect(rtl.getByRole('tab', { name: 'Assessed' }).getAttribute('aria-selected')).toBe('true')
        expect(document.querySelector('.assessment-view .industry-view__summary-bar').textContent).toMatch(/2 industries and themes assessed/)
    })

    it('an assessment the weekly scan asked for says why', () => {
        const row = A({ trigger: [{ key: 'hype_new', text: 'the hype flag turned on', detail: '24m +190% vs SPY +40%' }] })
        render(<AssessmentView data={{ assessments: [row], record: null }} />)
        fireEvent.click(rtl.getAllByRole('button', { name: /Semiconductors/ })[0])
        expect(rtl.getByText(/the hype flag turned on \(24m \+190% vs SPY \+40%\)/)).toBeTruthy()
    })
})

const WEEK = {
    asof: '2026-10-09', status: 'done', regime: 'yellow', scanned: { industries: 163, themes: 2 },
    flagged: [{ kind: 'industry', code: '45301020', name: 'Semiconductors', reasons: [{ key: 'hype_new', text: 'the hype flag turned on' }] }],
    results: [{ kind: 'industry', code: '45301020', name: 'Semiconductors', reasons: ['hype_new'], outcome: 'published', verdict: 'watch', previous_verdict: 'swing' }],
    waiting_count: 3, waiting: [{ name: 'Steel' }, { name: 'Banks' }], cost_usd: 0.005,
}

describe('the week', () => {
    it('words the week, and lists what was assessed with what changed and why', () => {
        expect(weekHeadline(WEEK)).toBe('Week of the 2026-10-09 run: 163 industries and 2 themes scanned · 1 flagged · 1 assessed · 3 wait for next week')
        expect(weekHeadline({ ...WEEK, status: 'running' })).toMatch(/^Week of the 2026-10-09 run \(running\):/)
        expect(weekHeadline({ ...WEEK, status: 'interrupted', held_back: [{ name: 'Gold' }] })).toMatch(/\(interrupted\):.* · 1 held back after two refusals$/)
        expect(movedLine({ ret_24m: 0.5, spy_24m: 0.4, basket: 'Metals & Mining' }, 'Copper')).toBe('24m +50% vs SPY +40% · measured as Metals & Mining')
        expect(movedLine({ ret_24m: 0.5, spy_24m: 0.4, basket: 'Copper' }, 'Copper')).toBe('24m +50% vs SPY +40%')
        expect(weekHeadline(null)).toBeNull()
        expect(weekResultLine(WEEK.results[0], { hype_new: 'the hype flag turned on' })).toBe('Semiconductors — Watch (was For swing) · the hype flag turned on')
        expect(weekResultLine({ name: 'Steel', outcome: 'refused', reasons: ['expired'] })).toBe('Steel — not published (refused) · expired')
    })

    it('a trader sees the week and the regime, opens it, and gets no run button or spend', () => {
        render(<AssessmentView data={DATA} week={WEEK} />)
        expect(rtl.getByText('regime Yellow')).toBeTruthy()
        expect(rtl.queryByText(/cost \$/)).toBeNull()
        expect(rtl.queryByRole('button', { name: /Run the week/ })).toBeNull()
        fireEvent.click(rtl.getByRole('button', { name: /Week of the 2026-10-09 run/ }))
        expect(rtl.getByText(/Semiconductors — Watch \(was For swing\)/)).toBeTruthy()
        expect(rtl.getByText(/Waiting for next week: Steel, Banks and 1 more/)).toBeTruthy()
    })

    it('an admin sees the spend and runs the week again; a running week cannot be started twice', async () => {
        AUTH = ADMIN
        const { rerender } = render(<AssessmentView data={DATA} week={WEEK} />)
        expect(rtl.getByText(/cost \$0\.0050/)).toBeTruthy()
        fireEvent.click(rtl.getByRole('button', { name: 'Run the week again' }))
        await waitFor(() => expect(rtl.getByText('Started — the board follows it.')).toBeTruthy())
        expect(runWeek).toHaveBeenCalledWith({ force: true })
        rerender(<AssessmentView data={DATA} week={{ ...WEEK, status: 'running' }} />)
        expect(rtl.getByRole('button', { name: 'Running…' }).disabled).toBe(true)
    })

    it('a week a dead process left behind is offered for resuming, not rerun; held-back subjects are named', async () => {
        AUTH = ADMIN
        render(<AssessmentView data={DATA} week={{ ...WEEK, status: 'interrupted', held_back: [{ name: 'Gold' }] }} />)
        fireEvent.click(rtl.getByRole('button', { name: 'Resume the week' }))
        expect(runWeek).toHaveBeenCalledWith({ force: false })
        fireEvent.click(rtl.getByRole('button', { name: /Week of the 2026-10-09 run \(interrupted\)/ }))
        expect(rtl.getByText(/Held back this week after two refusals in a row \(tried again next week\): Gold/)).toBeTruthy()
        await waitFor(() => expect(rtl.getByText('Started — the board follows it.')).toBeTruthy())
    })

    it('before the first week, says what the scan will do; an admin can start it', async () => {
        AUTH = ADMIN
        runWeek.mockRejectedValueOnce({ response: { status: 409, data: {} } })
        render(<AssessmentView data={DATA} week={null} />)
        expect(rtl.getByText(/No week has run yet/)).toBeTruthy()
        fireEvent.click(rtl.getByRole('button', { name: 'Run the week' }))
        expect(runWeek).toHaveBeenCalledWith({ force: false })
        await waitFor(() => expect(rtl.getByText(/^Not started — /)).toBeTruthy())
    })
})

describe('the verdict words (Roy, 2026-10-11)', () => {
    it('are the book — for swing, for long term — and an old word still lands in its group', () => {
        expect(VERDICT_ORDER).toEqual(['swing', 'long_term', 'watch', 'avoid', 'no_case'])
        expect([VERDICT_LABEL.swing, VERDICT_LABEL.long_term]).toEqual(['For swing', 'For long term'])
        const old = [A({ id: 'a', verdict: 'interesting_trade' }), A({ id: 'b', verdict: 'swing' }), A({ id: 'c', verdict: 'interesting_invest' })]
        expect(groupByVerdict(old).map(([v, l]) => [v, l.length])).toEqual([['swing', 2], ['long_term', 1]])
        expect(verdictKey('interesting_invest')).toBe('long_term')
        render(<AssessmentView data={{ assessments: old, record: null }} />)
        expect(document.querySelectorAll('.assessment-view__verdict--swing').length).toBe(2)
    })
})

describe('a verdict whose news could not be checked', () => {
    it('says so on its line; a checked one does not', () => {
        render(<AssessmentView data={{ assessments: [A({ id: 'u', cause: { kind: 'unverified', text: 'search down' } }), A({ id: 'n', subject: { code: '2', name: 'Steel' }, cause: { kind: 'news', text: 'x' } })], record: null }} />)
        expect(rtl.getAllByText('news not checked')).toHaveLength(1)
    })
})

describe('watch and no case (Roy, 2026-10-11)', () => {
    it('a watch shows the date that decides it; no case is its own group, last', () => {
        const rows = [A({ id: 'w', verdict: 'watch', decides_by: '2026-10-21' }), A({ id: 'q', subject: { code: '2', name: 'Steel' }, verdict: 'no_case' }), A({ id: 'a', subject: { code: '3', name: 'Coal' }, verdict: 'avoid' })]
        expect(groupByVerdict(rows).map(([v]) => v)).toEqual(['watch', 'avoid', 'no_case'])
        render(<AssessmentView data={{ assessments: rows, record: null }} />)
        expect(rtl.getByText('decides by 2026-10-21')).toBeTruthy()
        expect(rtl.getAllByText('No case').length).toBeGreaterThan(0)
        cleanup()
        render(<AssessmentView data={{ assessments: [A({ id: 'w', verdict: 'watch', decides_by: '2026-10-28', question: 'Will hyperscalers hold capex guidance?' })], record: null }} />)
        fireEvent.click(rtl.getAllByRole('button', { name: /Semiconductors/ })[0])
        expect(rtl.getByText(/Will hyperscalers hold capex guidance\? — decided by 2026-10-28/)).toBeTruthy()
    })
})

describe('code review 2026-10-11 — the board', () => {
    it('a paused week resumes; old words never read as a change; the record keeps an old word\'s calls; a link shows its move by size', () => {
        expect(weekHeadline({ ...WEEK, status: 'paused' })).toMatch(/\(paused\):/)
        expect(weekResultLine({ name: 'X', outcome: 'published', verdict: 'swing', previous_verdict: 'interesting_trade', reasons: [] })).toBe('X — For swing')
        const rec = recordWords({ total: 2, open: 0, by_verdict: { interesting_trade: { '3m': { n: 1, right: 1, avg_vs_spy: 0.02 } }, avoid: { '3m': { n: 1, right: 0, avg_vs_spy: 0.01 } } } })
        expect(rec.lines).toEqual(['For swing at 3m: 1 graded, right 100%, basket vs SPY +2.0% on average', 'Avoid at 3m: 1 graded, right 0%, basket vs SPY +1.0% on average'])
        expect(linkMoveLine({ excess_24m: 0.6, excess_24m_vw: 1.1, hype: true })).toBe('24m +60% over SPY · by size +110% · hype')
    })

    it('an admin resumes a paused week', () => {
        AUTH = ADMIN
        render(<AssessmentView data={DATA} week={{ ...WEEK, status: 'paused' }} />)
        fireEvent.click(rtl.getByRole('button', { name: 'Resume the week' }))
        expect(runWeek).toHaveBeenCalledWith({ force: false })
    })
})

describe('insiders, funds, government (backend step 8)', () => {
    const FLOWS = {
        insiders: { companies_buying: 51, n_companies: 256, vs_universe: 1.6, cluster: true, value: 17.5e6 },
        funds: { quarter: '2026-06-30', share: 0.62, relative_share: 0.9, percentile: 1, history_quarters: 7, flow_vs_universe: 0.011 },
        government: { through: '2026-06-30', now: 3e9, change: 0.4, prev_change: 0.05 },
    }

    it('words each with its own reading', () => {
        const l = flowLines(FLOWS)
        expect(l.insiders).toBe("Insiders bought at 51 of 256 companies in 90 days (1.6× the market's rate), $17.5M — a cluster, awareness only: no tested edge")
        expect(l.funds).toBe('62% held by funds (0.90× the market), 100th percentile of 7 quarters; last quarter +1.1% vs the market — crowding, as of 2026-06-30')
        expect(l.government).toBe('Contract money on its lines +40% over a year ($3.0B; a year earlier +5%), to 2026-06-30')
        expect(flowLines(null)).toEqual({ insiders: null, funds: null, government: null })
        expect(flowLines({ insiders: { ...FLOWS.insiders, cluster: false } }).insiders).not.toMatch(/cluster/)
    })

    it('shows the three rows in an opened assessment, and none on one made before step 8', () => {
        render(<AssessmentView data={{ ...DATA, assessments: [A({ flows: FLOWS }), A({ id: 'old', subject: { code: '2', name: 'Copper', sector: 'Materials' } })] }} />)
        fireEvent.click(rtl.getAllByRole('button', { name: /Semiconductors/ })[0])
        expect(rtl.getByText('insiders buying')).toBeTruthy()
        expect(rtl.getByText('funds')).toBeTruthy()
        expect(rtl.getByText('government contracts')).toBeTruthy()
        cleanup()
        render(<AssessmentView data={{ ...DATA, assessments: [A({ id: 'old', subject: { code: '2', name: 'Copper', sector: 'Materials' } })] }} />)
        fireEvent.click(rtl.getAllByRole('button', { name: /Copper/ })[0])
        expect(rtl.queryByText('insiders buying')).toBeNull()
    })
})

describe('the step 8 lines, QA 2026-10-12', () => {
    it('reads small and negative dollars, real ordinals, and leaves out what is missing', () => {
        expect(flowLines({ insiders: { companies_buying: 2, n_companies: 9, value: 40e3 } }).insiders).toBe('Insiders bought at 2 of 9 companies in 90 days, $40K')
        expect(flowLines({ insiders: { companies_buying: 2, n_companies: null, value: null } }).insiders).toBe('Insiders bought at 2 companies in 90 days')
        expect(flowLines({ funds: { share: 0.5, percentile: 3 / 7, history_quarters: 7, quarter: null } }).funds).toBe('50% held by funds, 43rd percentile of 7 quarters — crowding')
        expect(flowLines({ funds: { share: 0.5, percentile: 1, history_quarters: 2 } }).funds).not.toMatch(/percentile/)
        expect(flowLines({ funds: { share: NaN } }).funds).toBeNull()
        expect(flowLines({ government: { now: 3e9, change: 0.4, prev_change: null, through: '2026-06-30' } }).government)
            .toBe('Contract money on its lines +40% over a year ($3.0B), to 2026-06-30')
    })

    it('says a fall to zero, and nothing where no line ever had money', () => {
        expect(flowLines({ government: { now: 0, before: 2e9, change: -1 } }).government).toBe('Contract money on its lines -100% over a year ($0)')
        expect(flowLines({ government: { now: 0, before: 0, change: null } }).government).toBeNull()
    })
})
