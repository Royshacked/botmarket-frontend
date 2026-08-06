import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

import { SectorView } from './SectorView.jsx'

afterEach(cleanup)

const row = (over = {}) => ({
    sector: 'Healthcare', stance: 'over', active_bp: 150, horizon: '6m',
    review_date: '2027-02-06T00:00:00.000Z', state: 'open',
    contribution_bp: 9, rationale: 'Defensive earnings into a slowing tape.', ...over,
})
const tilt = (over = {}) => ({
    id: 'tilt1', benchmark: 'SPX', balanced: true, net_bp: 0,
    created_at: '2026-08-06T00:00:00.000Z',
    regime: { name: 'late-cycle disinflation', thesis: 'Growth slows.', kill_criteria: ['core CPI above 3.5% twice'] },
    tilts: [row()], monitor: { total_bp: 9 }, ...over,
})

describe('SectorView', () => {
    it('leads with the regime — the stance is the conclusion, the regime is the reason', () => {
        render(<SectorView tilt={tilt()} />)
        expect(screen.getByText('late-cycle disinflation')).toBeTruthy()
        expect(screen.getByText('Growth slows.')).toBeTruthy()
    })

    it('shows what would BREAK the read — without falsifiers a regime is a mood', () => {
        render(<SectorView tilt={tilt()} />)
        expect(screen.getByText('what breaks it')).toBeTruthy()
        expect(screen.getByText('core CPI above 3.5% twice')).toBeTruthy()
    })

    it('renders a stance as a signed active weight against the benchmark', () => {
        const { container } = render(<SectorView tilt={tilt()} />)
        expect(screen.getByText('Healthcare')).toBeTruthy()
        expect(screen.getByText('overweight')).toBeTruthy()
        expect(screen.getByText('+150bp')).toBeTruthy()
        expect(screen.getByText('vs SPX')).toBeTruthy()
        expect(container.querySelector('.sector-view__row--over')).toBeTruthy()
    })

    it('an underweight reads as its own direction, negative weight and all', () => {
        const { container } = render(<SectorView tilt={tilt({ tilts: [row({ sector: 'Energy', stance: 'under', active_bp: -150 })] })} />)
        expect(screen.getByText('underweight')).toBeTruthy()
        expect(screen.getByText('-150bp')).toBeTruthy()
        expect(container.querySelector('.sector-view__row--under')).toBeTruthy()
    })

    it('an UNPRICED contribution shows a dash, never 0.0bp', () => {
        // The distinction the whole grading layer protects: "we don't know yet" is not "it earned
        // nothing". Rendering a zero would claim a result the desk does not have.
        const { container } = render(<SectorView tilt={tilt({ tilts: [row({ contribution_bp: null })], monitor: { total_bp: null } })} />)
        expect(container.querySelector('.sector-view__contrib--unknown')?.textContent).toBe('—')
        expect(container.querySelector('.sector-view__total--unknown')).toBeTruthy()
        expect(container.textContent).not.toMatch(/0\.0bp/)
    })

    it('a genuine zero is shown as a number — neutral really did earn nothing', () => {
        const { container } = render(<SectorView tilt={tilt({ tilts: [row({ stance: 'neutral', active_bp: 0, contribution_bp: 0 })] })} />)
        expect(container.querySelector('.sector-view__contrib--flat')?.textContent).toBe('+0.0bp')
    })

    it('an unbalanced table is ADMITTED — it is not directly allocatable', () => {
        render(<SectorView tilt={tilt({ balanced: false, net_bp: 400 })} />)
        expect(screen.getByText(/unbalanced \+400bp/)).toBeTruthy()
    })

    it('a matured stance is marked, so a graded call is distinguishable from a live one', () => {
        const { container } = render(<SectorView tilt={tilt({ tilts: [row({ state: 'matured' })] })} />)
        expect(container.querySelector('.sector-view__matured')).toBeTruthy()
    })

    it('no published view says so rather than rendering an empty table', () => {
        render(<SectorView tilt={null} />)
        expect(screen.getByText(/No house view published yet/)).toBeTruthy()
    })

    it('a view with no stances is distinct from no view at all', () => {
        render(<SectorView tilt={tilt({ tilts: [] })} />)
        expect(screen.getByText(/carries no stances/)).toBeTruthy()
    })

    it('a regime with no kill-criteria simply omits the section', () => {
        const { container } = render(<SectorView tilt={tilt({ regime: { name: 'x', thesis: 'y', kill_criteria: [] } })} />)
        expect(container.querySelector('.sector-view__kills')).toBeNull()
    })
})
