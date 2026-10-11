import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen as rtl, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { ADMIN, MEMBER } from '../../testUtils/authStub.js'

// Pythia's themes on the Forecasts board (backend pythia-assessment.md §3): the value chain by order, the
// assessment over it, and the admin's hand — approve, retire, propose, assess.

let AUTH = MEMBER
const running = new Set()
vi.mock('../../context/AuthContext.jsx', async (orig) => ({ ...(await orig()), useAuth: () => AUTH }))
const setThemeStatus = vi.fn(async () => ({ ok: true }))
const proposeThemes = vi.fn(async () => ({ proposed: [{ id: 'th_x' }], refused: [], skipped: [], cost_usd: 0.012 }))
const assessTheme = vi.fn(async () => ({ ok: true, cost_usd: 0.006 }))
vi.mock('../../services/strategy/strategy.service.remote.js', () => ({
    INDUSTRIES_CHANGED: 'strategy-industries-changed',
    strategyService: {
        setThemeStatus: (...a) => setThemeStatus(...a), proposeThemes: (...a) => proposeThemes(...a), assessTheme: (...a) => assessTheme(...a),
        isRunning: (k) => running.has(k),
        runError: (err) => err?.response?.data?.detail ?? err?.message,
    },
}))

import { ThemesView } from './ThemesView.jsx'
import { groupByOrder, linkMoveLine, movedLine } from './assessmentWords.js'

afterEach(() => { cleanup(); vi.clearAllMocks(); AUTH = MEMBER; running.clear() })

const LINKS = [
    { code: '20104010', name: 'Electrical Components & Equipment', order: 2, why: 'transformers and switchgear' },
    { code: '55105010', name: 'Independent Power Producers', order: 1, why: 'sells the power' },
]
const APPROVED = {
    id: 'th_data_center_power', name: 'Data center power', status: 'approved', thesis: 'Hyperscaler capex needs power.',
    terms: ['data center', 'power demand'], links: LINKS, basket: [{ symbol: 'VST' }],
    assessment: {
        verdict: 'watch', horizon: 'months', confidence: 'medium', thesis: 'Direct links stretched; suppliers not yet.',
        cause: { kind: 'money', text: 'capex' },
        moved: { kind: 'theme', hype: true, links: [{ code: '55105010', name: 'Independent Power Producers', order: 1, excess_24m: 2.0, ext_percentile: 0.9, hype: true }] },
    },
}
const PROPOSED = { id: 'th_glp1', name: 'GLP-1', status: 'proposed', thesis: 'Weight-loss drugs.', terms: ['GLP-1'], links: LINKS, basket: [] }

describe('theme words', () => {
    it('groups the chain direct first and words a link\'s move', () => {
        expect(groupByOrder(LINKS).map(([o, l]) => [o, l.length])).toEqual([[1, 1], [2, 1]])
        expect(linkMoveLine({ excess_24m: 2.0, ext_percentile: 0.9, hype: true })).toBe('24m +200% over SPY · stretched: 90th percentile · hype')
        expect(movedLine(APPROVED.assessment.moved)).toBe('direct links: Independent Power Producers 24m +200% over SPY · stretched: 90th percentile · hype')
    })
})

describe('ThemesView', () => {
    it('a trader sees the approved theme, its verdict and the chain by order — no admin hand', () => {
        render(<ThemesView themes={[APPROVED]} />)
        expect(rtl.getByText('Watch')).toBeTruthy()
        expect(rtl.getByText('hype')).toBeTruthy()
        fireEvent.click(rtl.getByRole('button', { name: /Data center power/ }))
        expect(rtl.getByText(/1 · direct/)).toBeTruthy()
        expect(rtl.getByText(/2 · suppliers/)).toBeTruthy()
        expect(rtl.getByText(/24m \+200% over SPY/)).toBeTruthy()
        expect(rtl.getByText(/Named companies: VST/)).toBeTruthy()
        expect(rtl.queryByRole('button', { name: 'Propose themes' })).toBeNull()
        expect(rtl.queryByRole('button', { name: 'Assess now' })).toBeNull()
    })

    it('an admin approves a proposal, assesses an approved theme, and asks for proposals', async () => {
        AUTH = ADMIN
        render(<ThemesView themes={[APPROVED, PROPOSED]} />)
        expect(document.querySelector('.industry-view__summary-bar').textContent).toMatch(/1 proposed, waiting for approval/)
        fireEvent.click(rtl.getByRole('button', { name: /GLP-1/ }))
        fireEvent.click(rtl.getByRole('button', { name: 'Approve' }))
        await waitFor(() => expect(setThemeStatus).toHaveBeenCalledWith('th_glp1', 'approved'))
        fireEvent.click(rtl.getByRole('button', { name: /Data center power/ }))
        fireEvent.click(rtl.getByRole('button', { name: 'Assess now' }))
        await waitFor(() => expect(rtl.getByText(/Assess: done · cost \$0\.0060/)).toBeTruthy())
        fireEvent.click(rtl.getByRole('button', { name: 'Propose themes' }))
        await waitFor(() => expect(rtl.getByText(/1 proposed, 0 refused, 0 already approved · cost \$0\.0120/)).toBeTruthy())
    })

    it('a failed assess says why; a propose run in flight cannot be clicked again', async () => {
        AUTH = ADMIN
        assessTheme.mockRejectedValueOnce({ response: { status: 409, data: { detail: 'already running' } } })
        running.add('propose_themes')
        render(<ThemesView themes={[APPROVED, { ...PROPOSED, name: null }]} />)
        const propose = rtl.getByRole('button', { name: 'Pythia is looking…' })
        expect(propose.disabled).toBe(true)
        fireEvent.click(propose)
        expect(proposeThemes).not.toHaveBeenCalled()
        fireEvent.click(rtl.getByRole('button', { name: /Data center power/ }))
        fireEvent.click(rtl.getByRole('button', { name: 'Assess now' }))
        await waitFor(() => expect(rtl.getAllByRole('status').some(s => s.textContent === 'Assess failed — already running')).toBe(true))
    })

    it('says so when there are none', () => {
        render(<ThemesView themes={[]} />)
        expect(rtl.getByText(/No themes yet/)).toBeTruthy()
    })
})
