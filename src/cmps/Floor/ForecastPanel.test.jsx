import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react'
import { ForecastPanel, FORECAST_PANEL_ID } from './ForecastPanel.jsx'
import { openPanel, closePanel } from '../DetailPanel/detailPanel.store.js'
import { strategyService } from '../../services/strategy/strategy.service.remote.js'
import { _resetAssessmentDetailCache } from '../../customHooks/useAssessmentDetail.js'

// The Forecasts heat map (2026-10-14): a tile per sub-industry coloured by its move, Pythia's verdict on top; a tile
// opens its Pythia thesis and its companies; a covered company opens Prometheus's thesis. It replaced the Forecasts
// list and the "Analyst companies" desk, so the coverage cases that lived in FloorLists.test live here now.

// CoverageActions reads useAuth(); the stub makes the reader an admin so the actions render.
vi.mock('../../context/AuthContext.jsx', async (orig) => {
    const { authModule } = await import('../../testUtils/authStub.js')
    return authModule(await orig())
})
vi.mock('../../services/strategy/strategy.service.remote.js', () => ({
    // isRunning: a theme's page carries the admin's Assess now (ThemeDetail → useStrategyRun).
    strategyService: { getForecastMap: vi.fn(), getIndustryCompanies: vi.fn(), getAssessmentDetail: vi.fn(), isRunning: vi.fn(() => false) },
    INDUSTRIES_CHANGED: 'strategy:industries-changed',
}))

const SEMI = {
    code: '45301020', name: 'Semiconductors', sector: 'Information Technology', industry: 'Semiconductors',
    moves: { asof: '2026-10-10', rel_1m: 0.02, rel_3m: 0.12, excess_12m: 0.45, excess_24m: 1.1, hype: true },
    assessment: { id: 'ia_ind_45301020', subject: { kind: 'industry', code: '45301020', name: 'Semiconductors' }, verdict: 'swing', horizon: 'months',
        thesis: 'AI capex still rising.', confidence: 'high', assessed_at: '2026-10-11T00:00:00Z', expires_at: '2099-01-01T00:00:00Z' },
    covered: 1,
}
const OIL = { code: '10102010', name: 'Integrated Oil & Gas', sector: 'Energy', industry: 'Oil', moves: { rel_3m: -0.08 }, assessment: null, covered: 0 }
const MAP = { asof: '2026-10-10', tiles: [SEMI, OIL], unmapped: ['ZZZ'], covered_at: { NVDA: '45301020' } }
const COS = { code: '45301020', name: 'Semiconductors', level: 'sub_industry', level_name: 'Semiconductors', companies: [
    { symbol: 'NVDA', name: 'NVIDIA', market_cap: 4.1e12, covered: true },
    { symbol: 'AVGO', name: 'Broadcom', market_cap: 1.6e12, covered: false },
] }
const COVERAGE = [{ id: 'cv1', symbol: 'NVDA', status: 'active', rating: 'buy', thesis: 'Data-centre demand outruns supply.', kill_criteria: ['hyperscaler capex cut'] }]

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
const panel = () => screen.getByRole('dialog')
const title = () => panel().querySelector('.detail-panel__title').textContent

beforeEach(() => {
    strategyService.getForecastMap.mockResolvedValue(MAP)
    strategyService.getIndustryCompanies.mockResolvedValue(COS)
    // The light row's detail — the board's own read, reused.
    strategyService.getAssessmentDetail.mockResolvedValue({ ...SEMI.assessment, evidence: {}, cause: { kind: 'money', text: 'capex raised' } })
})
afterEach(() => { cleanup(); closePanel(); vi.clearAllMocks(); _resetAssessmentDetailCache() })

async function openMap(props = {}) {
    const r = render(<ForecastPanel coverage={COVERAGE} {...props} />)
    act(() => openPanel(FORECAST_PANEL_ID))
    await flush()
    return r
}
const tileOf = (name) => screen.getByText(name).closest('button')

describe('ForecastPanel — the map', () => {
    it('renders nothing until its panel opens, and reads the map on open', async () => {
        render(<ForecastPanel />)
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(strategyService.getForecastMap).not.toHaveBeenCalled()
        act(() => openPanel(FORECAST_PANEL_ID))
        await flush()
        expect(strategyService.getForecastMap).toHaveBeenCalledTimes(1)
        // A Floor list with no header (Roy, 2026-10-22): no kicker; its controls and the page it is on in one thin row.
        expect(panel().querySelector('.detail-panel__kicker')).toBeNull()
        expect(panel().querySelector('.detail-panel__bar .detail-panel__title').textContent).toBe('Industries')
    })

    it('a tile per sub-industry by sector, coloured by the 3-month move, the verdict a letter on it', async () => {
        await openMap()
        expect(within(panel()).getByRole('region', { name: 'Energy' })).toBeTruthy()
        const semi = tileOf('Semiconductors')
        expect(semi.textContent).toContain('+12%')
        expect(semi.className).toMatch(/fm-tile--up-3/)
        expect(semi.className).toMatch(/fm-tile--hype/)
        expect(semi.querySelector('.fm-tile__badge').textContent).toBe('S')
        expect(semi.querySelector('.fm-tile__badge').className).toMatch(/--high/)
        expect(semi.querySelector('.fm-tile__cov').textContent).toBe('◆1')
        const oil = tileOf('Integrated Oil & Gas')
        expect(oil.className).toMatch(/fm-tile--down-2/)
        // Not assessed: no letter.
        expect(oil.querySelector('.fm-tile__badge')).toBeNull()
    })

    it('the window switch recolours the tiles', async () => {
        await openMap()
        fireEvent.click(screen.getByRole('button', { name: '12m' }))
        expect(tileOf('Semiconductors').textContent).toContain('+45%')
        expect(screen.getByRole('button', { name: '12m' }).getAttribute('aria-pressed')).toBe('true')
    })

    it('a verdict filter dims the rest but keeps the sector\'s shape', async () => {
        await openMap()
        fireEvent.click(screen.getByRole('button', { name: 'Avoid' }))
        expect(tileOf('Semiconductors').className).toMatch(/fm-tile--dim/)
        fireEvent.click(screen.getByRole('button', { name: 'For swing' }))
        expect(tileOf('Semiconductors').className).not.toMatch(/fm-tile--dim/)
        expect(tileOf('Integrated Oil & Gas').className).toMatch(/fm-tile--dim/)
    })

    it('lists covered names with no GICS home beside the map, each opening its thesis', async () => {
        await openMap()
        fireEvent.click(within(screen.getByRole('region', { name: 'Covered, not on the map' })).getByRole('button', { name: 'ZZZ' }))
        expect(title()).toBe('ZZZ')
        expect(screen.getByText(/no thesis on ZZZ/)).toBeTruthy()
    })

    it('says so when the map cannot be read, and retries', async () => {
        strategyService.getForecastMap.mockRejectedValueOnce(new Error('down'))
        await openMap()
        expect(screen.getByText(/Couldn’t load the map/)).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
        await flush()
        expect(tileOf('Semiconductors')).toBeTruthy()
    })
})

describe('ForecastPanel — an industry', () => {
    it('opens on Pythia\'s thesis, then the companies, covered ones marked', async () => {
        await openMap()
        fireEvent.click(tileOf('Semiconductors'))
        await flush()
        expect(title()).toBe('Semiconductors')
        expect(strategyService.getIndustryCompanies).toHaveBeenCalledWith('45301020')
        expect(within(panel()).getByText('AI capex still rising.')).toBeTruthy()
        expect(within(panel()).getByText('high confidence')).toBeTruthy()
        const nvda = screen.getByText('NVDA').closest('.fm-co')
        expect(nvda.tagName).toBe('BUTTON')
        expect(within(nvda).getByText('buy')).toBeTruthy()
        // Not covered: a plain row, not a door.
        const avgo = screen.getByText('AVGO').closest('.fm-co')
        expect(avgo.tagName).toBe('DIV')
        expect(within(avgo).getByText('not covered')).toBeTruthy()
    })

    it('an industry Pythia has not assessed says so, and still lists its companies', async () => {
        strategyService.getIndustryCompanies.mockResolvedValueOnce({ ...COS, code: '10102010', companies: [{ symbol: 'XOM', name: 'Exxon', market_cap: 5e11, covered: false }] })
        await openMap()
        fireEvent.click(tileOf('Integrated Oil & Gas'))
        await flush()
        expect(screen.getByText(/Pythia has not assessed this industry yet/)).toBeTruthy()
        expect(screen.getByText('XOM')).toBeTruthy()
    })

    it('says when a thin sub-industry lists the level above', async () => {
        strategyService.getIndustryCompanies.mockResolvedValueOnce({ ...COS, level: 'industry', level_name: 'Semis & Equipment' })
        await openMap()
        fireEvent.click(tileOf('Semiconductors'))
        await flush()
        expect(screen.getByText(/too few of its own — industry: Semis & Equipment/)).toBeTruthy()
    })

    it('back returns to the map', async () => {
        await openMap()
        fireEvent.click(tileOf('Semiconductors'))
        await flush()
        fireEvent.click(screen.getByRole('button', { name: '‹ Map' }))
        expect(title()).toBe('Industries')
    })
})

describe('ForecastPanel — a company', () => {
    async function openNvda(props) {
        await openMap(props)
        fireEvent.click(tileOf('Semiconductors'))
        await flush()
        fireEvent.click(screen.getByText('NVDA').closest('button'))
    }

    it('a covered company opens Prometheus\'s thesis, and back returns to its industry', async () => {
        await openNvda()
        expect(title()).toBe('NVDA')
        expect(screen.getByText('Data-centre demand outruns supply.')).toBeTruthy()
        expect(screen.getByText('hyperscaler capex cut')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: '‹ Semiconductors' }))
        expect(title()).toBe('Semiconductors')
        // The companies were read once — back and forth does not refetch.
        await flush()
        expect(strategyService.getIndustryCompanies).toHaveBeenCalledTimes(1)
    })

    it('Edit closes the panel on the way to Prometheus — the chat it opens is under the panel', async () => {
        const onEditCoverage = vi.fn()
        await openNvda({ onEditCoverage })
        fireEvent.click(within(panel()).getByRole('button', { name: 'Edit' }))
        expect(onEditCoverage).toHaveBeenCalledWith(COVERAGE[0])
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('a card\'s focus opens straight on the company, and its industry is found from the map', async () => {
        const { rerender } = render(<ForecastPanel coverage={COVERAGE} />)
        rerender(<ForecastPanel coverage={COVERAGE} focus={{ symbol: 'nvda' }} />)
        act(() => openPanel(FORECAST_PANEL_ID))
        await flush()
        expect(title()).toBe('NVDA')
        expect(screen.getByRole('button', { name: '‹ Semiconductors' })).toBeTruthy()
    })

    // Pythia's "industry changed" card (2026-10-22): it used to open the bare map, leaving the user to find the tile.
    it('a card\'s industry focus opens straight on that industry — Pythia\'s thesis and its companies', async () => {
        const { rerender } = render(<ForecastPanel coverage={COVERAGE} />)
        rerender(<ForecastPanel coverage={COVERAGE} focus={{ code: '45301020' }} />)
        act(() => openPanel(FORECAST_PANEL_ID))
        await flush()
        expect(title()).toBe('Semiconductors')
        expect(strategyService.getIndustryCompanies).toHaveBeenCalledWith('45301020')
        expect(screen.getByRole('button', { name: '‹ Map' })).toBeTruthy()
    })

    it('every plain reopen starts on the map', async () => {
        await openNvda()
        act(() => closePanel())
        act(() => openPanel(FORECAST_PANEL_ID))
        await flush()
        expect(title()).toBe('Industries')
    })
})

// Themes on the map (Roy, 2026-10-23: "I want to see it in Forecast").
describe('ForecastPanel — themes', () => {
    const AI = {
        id: 'th_ai', name: 'AI compute', status: 'approved', thesis: 'Capex across the chain.',
        links: [
            { code: '45301020', name: 'Semiconductors', order: 1, why: 'chips' },
            { code: '10102010', name: 'Integrated Oil & Gas', order: 2, why: 'power' },
        ],
        assessment: { verdict: 'watch', horizon: 'months', confidence: 'medium', thesis: 'Uneven buildout.', moved: { hype: false, links: [] } },
    }
    const PROPOSED = { id: 'th_new', name: 'Not yet', status: 'proposed', links: [], thesis: 't' }

    it('the approved themes are a row above the sectors, coloured by their DIRECT links, the verdict a letter', async () => {
        await openMap({ themes: [PROPOSED, AI] })
        const row = screen.getByRole('region', { name: 'Themes' })
        const tiles = within(row).getAllByRole('button')
        expect(tiles.map(t => t.querySelector('.fm-tile__name').textContent)).toEqual(['AI compute'])   // a proposal is the board's
        // Semis +12% over 3 months is the direct link; the oil supplier's −8% does not dilute it.
        expect(tiles[0].querySelector('.fm-tile__move').textContent).toBe('+12%')
        expect(tiles[0].querySelector('.fm-tile__badge').textContent).toBe('W')
        const sections = [...panel().querySelectorAll('.fm-sector')].map(s => s.getAttribute('aria-label'))
        expect(sections[0]).toBe('Themes')
    })

    it('a theme opens its page in the window; a link opens that industry, whose back returns to the theme', async () => {
        await openMap({ themes: [AI] })
        fireEvent.click(within(screen.getByRole('region', { name: 'Themes' })).getByRole('button'))
        expect(title()).toBe('AI compute')
        expect(screen.getByText('Capex across the chain.')).toBeTruthy()
        expect(panel().textContent).toMatch(/1 · direct/)
        fireEvent.click(screen.getByRole('button', { name: 'Semiconductors' }))
        await flush()
        expect(title()).toBe('Semiconductors')
        fireEvent.click(screen.getByRole('button', { name: '‹ AI compute' }))
        expect(title()).toBe('AI compute')
        fireEvent.click(screen.getByRole('button', { name: '‹ Map' }))
        expect(title()).toBe('Industries')
    })

    it('no approved theme → no row', async () => {
        await openMap({ themes: [PROPOSED] })
        expect(screen.queryByRole('region', { name: 'Themes' })).toBeNull()
    })
})
