import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { SituationPanel, SITUATION_PANEL_ID } from './SituationPanel.jsx'
import { openPanel, closePanel } from '../DetailPanel/detailPanel.store.js'
import { situationService } from '../../services/situation/situation.service.remote.js'

// The situation network's board (situation-network.md §11.6): the state, the trees, the questions, the industries.

vi.mock('../../services/situation/situation.service.remote.js', () => ({
    situationService: { getLatest: vi.fn(), getNodeHistory: vi.fn(), getScorecard: vi.fn(), override: vi.fn(), access: vi.fn() },
}))
// Mermaid does not draw in jsdom: the diagram is its text here.
vi.mock('./MermaidDiagram.jsx', () => ({ MermaidDiagram: ({ code, label }) => <pre aria-label={label}>{code}</pre> }))

const run = {
    run: { run_id: 'run_1', kind: 'weekly', as_of: '2025-01-14', stats: { cost_usd: 0.16, decisions: [{ decision: 'moves_option', applied: true, summary: 'Russia oil sanctions' }], rounds: 2, changes: [], entries: [{ name: 'Gold', side: 'win', level: 0.7 }] } },
    state: { as_of: '2025-01-14', sections: { regime: [{ text: '10-year 4.79%', tag: 'fact', source: 'FRED DGS10', as_of: '2025-01-13' }], policy: [], money: [], stories: [], prices: [], calendar: [] } },
    nodes: [
        { node_id: 'n1', tree: 'geopolitics', question: 'Does the US strike Iran?', status: 'live', kind: 'open', set_by: 'llm', resolve_by: '2025-03-31', reasoning: 'Talks stall.', woken: [],
            options: [{ key: 'strikes', label: 'Strikes', p: 0.35, signpost: 'carrier moves' }, { key: 'standoff', label: 'Standoff', p: 0.65 }] },
        { node_id: 'n2', tree: 'inflation_fed_rates', question: 'Does inflation rise again?', status: 'live', kind: 'open', set_by: 'llm', woken: [],
            options: [{ key: 'rises', label: 'Rises', p: 0.3 }, { key: 'falls', label: 'Falls', p: 0.7 }] },
    ],
    links: [{ from: { node_id: 'n1', option: 'strikes' }, to: { node_id: 'n2', option: 'rises' }, shift: 0.8 }],
    dropped: { considered: 3, open: 2, settled: 0, resolved: 0, dropped: [{ question: 'DOGE cuts?', reason: 'low_impact', flagged: false }] },
    industries: [{ code: 'OIL', name: 'Oil & Gas', p_win: 0.62, p_lose: 0.1, bucket: 'medium', agreement: 0.86, paths: [{ node_id: 'n1', option: 'strikes', question: 'Does the US strike Iran?', label: 'Strikes', weight: 1 }] }],
    outside: [], runs: [{ run_id: 'run_1', as_of: '2025-01-14', kind: 'weekly', stats: { cost_usd: 0.16 } }], canOverride: true,
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })
beforeEach(() => {
    situationService.getLatest.mockResolvedValue(run)
    situationService.getNodeHistory.mockResolvedValue([{ run_id: 'run_1', as_of: '2025-01-07', kind: 'build', set_by: 'llm', options: [{ label: 'Strikes', p: 0.2 }, { label: 'Standoff', p: 0.8 }] }])
    situationService.getScorecard.mockResolvedValue({ started_on: '2025-01-07', runs: 2, nodes: { all: { questions: 0 }, roy: { questions: 0 }, overridden: {}, accepted: {} },
        industries: { m6: { n: 0 } }, control: { m6: {} }, verdict: { months: 0.2, pass: false, checks: { '1_brier_beats_equal_odds': false } } })
    situationService.override.mockResolvedValue({ ok: true })
})
afterEach(() => { cleanup(); closePanel(); vi.clearAllMocks() })

async function open() {
    render(<SituationPanel />)
    act(() => openPanel(SITUATION_PANEL_ID))
    await flush()
}

describe('SituationPanel', () => {
    it('fetches nothing while closed', () => {
        render(<SituationPanel />)
        expect(situationService.getLatest).not.toHaveBeenCalled()
    })

    it('opens on the network: the dated state, the connections between trees, a diagram per tree', async () => {
        await open()
        expect(screen.getByText(/weekly run of 2025-01-14/)).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: /Regime/ }))
        expect(screen.getByText(/10-year 4.79%/)).toBeTruthy()
        expect(screen.getByLabelText('Connections between the trees').textContent).toMatch(/Strikes raises Rises/)
        expect(screen.getByLabelText('The Geopolitics tree')).toBeTruthy()
    })

    it('questions: numbers, reasoning, links and history; the admin can override', async () => {
        await open()
        fireEvent.click(screen.getByRole('tab', { name: 'Questions' }))
        fireEvent.click(screen.getByText('Does the US strike Iran?'))
        await flush()
        expect(screen.getByText(/Talks stall/)).toBeTruthy()
        expect(screen.getByText(/2025-01-07 · build: Strikes 20% \/ Standoff 80%/)).toBeTruthy()
        expect(screen.getByText(/Signpost for “Strikes”: carrier moves/)).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Override these numbers' }))
        fireEvent.change(screen.getByLabelText(/Strikes/), { target: { value: '50' } })
        fireEvent.change(screen.getByLabelText(/Standoff/), { target: { value: '50' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save my numbers' }))
        await flush()
        expect(situationService.override).toHaveBeenCalledWith('n1', { strikes: 0.5, standoff: 0.5 })
    })

    it('industries: the calls at 60%+, the would-be entries, the branches behind', async () => {
        await open()
        fireEvent.click(screen.getByRole('tab', { name: 'Industries' }))
        expect(screen.getByText(/Oil & Gas wins 62%/)).toBeTruthy()
        expect(screen.getByText(/Gold win ≥ 70%/)).toBeTruthy()
        fireEvent.click(screen.getByText('Oil & Gas'))
        expect(screen.getByText(/“Does the US strike Iran\?” → Strikes: helps/)).toBeTruthy()
    })

    it('updates and the scorecard', async () => {
        await open()
        fireEvent.click(screen.getByRole('tab', { name: 'Updates' }))
        expect(screen.getByText(/Russia oil sanctions/)).toBeTruthy()
        expect(screen.getByText(/3 considered · 2 open · 0 settled · 0 resolved · 1 dropped/)).toBeTruthy()
        fireEvent.click(screen.getByRole('tab', { name: 'Scorecard' }))
        await flush()
        expect(screen.getByText(/not passed/)).toBeTruthy()
    })

    it('the layers: a picker when a sector has questions; a sector shows its own state and the macro questions linked to it', async () => {
        const promoted = { node_id: 'p1', tree: 'ai_capex', layer: 'macro', origin: '45', question: 'Do hyperscalers cut capex?', status: 'live', kind: 'open', set_by: 'llm', woken: [],
            options: [{ key: 'yes', label: 'Cut', p: 0.3 }, { key: 'no', label: 'Hold', p: 0.7 }] }
        const health = { node_id: 'h1', tree: 'drug_pricing', layer: '35', question: 'Does the MFN rule take effect?', status: 'live', kind: 'open', set_by: 'llm', woken: [],
            options: [{ key: 'yes', label: 'Takes effect', p: 0.4 }, { key: 'no', label: 'Blocked', p: 0.6 }] }
        situationService.getLatest.mockResolvedValueOnce({
            ...run, nodes: [...run.nodes, health, promoted],
            links: [...run.links, { from: { node_id: 'n2', option: 'rises' }, to: { node_id: 'h1', option: 'no' }, shift: 0.4 }],
            sector_states: [{ sector: '35', as_of: '2025-01-14', sections: { backdrop: [], prices: [{ text: 'Biotechnology: against the S&P 3m -5.0%', tag: 'fact', source: 'engine', as_of: '2025-01-13' }], news: [], policy: [], calendar: [] } }],
            industries: [{ ...run.industries[0], macro: { p_win: 0.55, p_lose: 0.1 } }],
            dropped: { ...run.dropped, dropped: [...run.dropped.dropped, { question: 'PBM reform?', reason: 'cap', layer: '35', flagged: true }] },
        })
        await open()
        fireEvent.click(screen.getByRole('tab', { name: /Health Care/ }))
        expect(screen.getByText(/Health Care · its state · 2025-01-14/)).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: /Prices/ }))
        expect(screen.getByText(/Biotechnology: against the S&P/)).toBeTruthy()
        expect(screen.getByLabelText('The Health Care · Drug pricing tree')).toBeTruthy()
        expect(screen.getByLabelText('Connections between the trees').textContent).toMatch(/Rises raises Blocked/)
        fireEvent.click(screen.getByRole('tab', { name: 'Questions' }))
        expect(screen.getByText('Does the MFN rule take effect?')).toBeTruthy()
        expect(screen.queryByText('Does the US strike Iran?')).toBeNull()
        fireEvent.click(screen.getByRole('tab', { name: /^Macro/ }))
        expect(screen.getByText('from Information Technology')).toBeTruthy()
        fireEvent.click(screen.getByRole('tab', { name: 'Industries' }))
        expect(screen.getByText('55% / 10%')).toBeTruthy()
        fireEvent.click(screen.getByRole('tab', { name: 'Updates' }))
        expect(screen.getByText(/Dropped by layer: Macro 1 · Health Care 1/)).toBeTruthy()
        expect(screen.getByText(/\[Health Care\] PBM reform\?/)).toBeTruthy()
    })

    it('the outcomes review, a resolution not foreseen, a routed story and the scorecard count', async () => {
        const resolvedCeo = { node_id: 'c1', tree: 'tech', question: 'Does Nvidia name a permanent CEO?', status: 'resolved', kind: 'open', set_by: 'llm', woken: [],
            resolved: { option: 'huang_returns', unforeseen: true }, options: [{ key: 'yes', label: 'Yes', p: 0 }, { key: 'no', label: 'No', p: 0 }, { key: 'huang_returns', label: 'Huang returns', p: 1 }] }
        situationService.getLatest.mockResolvedValueOnce({
            ...run, nodes: [...run.nodes, resolvedCeo],
            run: { ...run.run, stats: { ...run.run.stats, unforeseen: ['c1'], outcomes: { ran: true, added: [{ node_id: 'n1', option: 'limited', label: 'A limited strike' }], reworded: [], skipped: [] } } },
            outside: [{ event_id: 'o1', date: '2025-01-14', text: 'A 10% card rate cap', industries: ['card issuers'], sectors: ['40'], routed_to: ['40'] }],
        })
        situationService.getScorecard.mockResolvedValueOnce({ started_on: '2025-01-07', runs: 2, nodes: { all: { questions: 1 }, roy: { questions: 0 }, overridden: {}, accepted: {} }, unforeseen: { questions: 1, of: 1 },
            industries: { m6: { n: 0 } }, control: { m6: {} }, verdict: { months: 0.2, pass: false, checks: { '1_brier_beats_equal_odds': false } } })
        await open()
        fireEvent.click(screen.getByRole('tab', { name: 'Updates' }))
        expect(screen.getByText(/The outcomes review: added “?"?A limited strike"?”? to Does the US strike Iran\?/)).toBeTruthy()
        expect(screen.getByText(/⚑ Not foreseen: Does Nvidia name a permanent CEO\?/)).toBeTruthy()
        expect(screen.getByText(/sent to Financials/)).toBeTruthy()
        fireEvent.click(screen.getByRole('tab', { name: 'Scorecard' }))
        await flush()
        expect(screen.getByText(/Not foreseen: 1 of 1 resolved questions/)).toBeTruthy()
    })

    it('a network not built yet says so; a failed read offers a retry', async () => {
        situationService.getLatest.mockResolvedValueOnce({ run: null, runs: [] })
        await open()
        expect(screen.getByText(/has not been built yet/)).toBeTruthy()
        cleanup(); closePanel()
        situationService.getLatest.mockRejectedValueOnce(new Error('boom'))
        await open()
        expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    })
})
