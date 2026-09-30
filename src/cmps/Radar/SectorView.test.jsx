import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

import { SectorView } from './SectorView.jsx'

afterEach(cleanup)

const row = (over = {}) => ({
    bucket: 'Healthcare', stance: 'over', active_bp: 150, horizon: '6m',
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
        const { container } = render(<SectorView tilt={tilt({ tilts: [row({ bucket: 'Energy', stance: 'under', active_bp: -150 })] })} />)
        expect(screen.getByText('underweight')).toBeTruthy()
        expect(screen.getByText('-150bp')).toBeTruthy()
        expect(container.querySelector('.sector-view__row--under')).toBeTruthy()
    })

    it('an INDUSTRY row is tagged; a sector row is not', () => {
        // The tag shows only on the finer grain. A sector is the default, and tagging every row
        // would make the exception invisible — which is the only thing the tag is for.
        const { container } = render(<SectorView tilt={tilt({ tilts: [
            row({ bucket: 'Semiconductors', grain: 'industry', proxy: { symbol: 'SMH', weighting: 'cap', exact: true } }),
            row({ bucket: 'Energy', grain: 'sector', proxy: { symbol: 'XLE', weighting: 'cap', exact: true } }),
        ] })} />)
        expect(screen.getByText('Semiconductors')).toBeTruthy()
        expect(container.querySelectorAll('.sector-view__grain')).toHaveLength(1)
        expect(container.querySelector('.sector-view__grain').textContent).toBe('ind')
    })

    it('an imperfect proxy is marked, and says why on hover', () => {
        // `weighting` and `exact` are recorded server-side precisely because both distort a grade.
        // A ticker printed as if it WERE the bucket is what this prevents.
        const { container } = render(<SectorView tilt={tilt({ tilts: [
            row({ bucket: 'Biotechnology', grain: 'industry', proxy: { symbol: 'IBB', weighting: 'cap', exact: true } }),
            row({ bucket: 'Specialty Retail', grain: 'industry', proxy: { symbol: 'XRT', weighting: 'equal', exact: false } }),
        ] })} />)
        const proxies = [...container.querySelectorAll('.sector-view__proxy')]
        expect(proxies.map(p => p.textContent)).toEqual(['IBB', 'XRT*'])
        expect(proxies[0].getAttribute('title')).toBe('Graded against IBB')
        expect(proxies[1].getAttribute('title')).toContain('equal-weighted')
        expect(proxies[1].getAttribute('title')).toContain('spans more than this bucket')
    })

    it('a row with no fund shows no proxy at all, not an empty one', () => {
        const { container } = render(<SectorView tilt={tilt({ tilts: [row({ proxy: null })] })} />)
        expect(container.querySelector('.sector-view__proxy')).toBeNull()
    })

    // ── the line ─────────────────────────────────────────────────────────────
    const line = (...vs) => vs.map((v, i) => ({ t: i, v }))

    it('an OVERWEIGHT whose bucket beat the benchmark reads as a win', () => {
        const { container } = render(<SectorView
            tilt={tilt({ tilts: [row({ bucket: 'Energy', stance: 'over', active_bp: 100 })] })}
            series={{ Energy: line(100, 101, 103) }} />)
        const spark = container.querySelector('.sector-view__spark')
        expect(spark).toBeTruthy()
        expect(spark.classList.contains('sector-view__spark--up')).toBe(true)
        expect(spark.getAttribute('data-stance')).toBe('over')
        expect(spark.querySelector('polyline').getAttribute('points').split(' ')).toHaveLength(3)
    })

    it('an UNDERWEIGHT is signed by its weight — the same rising bucket is a LOSS', () => {
        // The defect this pins. The server sends the BUCKET's relative return; the number in the
        // row reports what the STANCE earned. Plot the bucket unsigned and every underweight reads
        // backwards — Real Estate showed +7.9bp beside a falling red line, live.
        const { container } = render(<SectorView
            tilt={tilt({ tilts: [row({ bucket: 'Energy', stance: 'under', active_bp: -100 })] })}
            series={{ Energy: line(100, 101, 103) }} />)
        expect(container.querySelector('.sector-view__spark--down')).toBeTruthy()
    })

    it('an UNDERWEIGHT whose bucket FELL reads as the win it is', () => {
        const { container } = render(<SectorView
            tilt={tilt({ tilts: [row({ bucket: 'Energy', stance: 'under', active_bp: -100, contribution_bp: 7.9 })] })}
            series={{ Energy: line(100, 97, 92) }} />)
        expect(container.querySelector('.sector-view__spark--up')).toBeTruthy()
    })

    it('an overweight that lagged reads as a loss', () => {
        const { container } = render(<SectorView
            tilt={tilt({ tilts: [row({ bucket: 'Energy', stance: 'over', active_bp: 100 })] })}
            series={{ Energy: line(100, 99, 96) }} />)
        expect(container.querySelector('.sector-view__spark--down')).toBeTruthy()
    })

    it('the 100 line is always drawn, and always inside the frame', () => {
        // Without it a rising line could be either a win or a smaller loss. It has to be visible
        // even when every point sits above it.
        const { container } = render(<SectorView
            tilt={tilt({ tilts: [row({ bucket: 'Energy' })] })}
            series={{ Energy: line(104, 106, 109) }} />)
        const svg  = container.querySelector('.sector-view__spark')
        const base = svg.querySelector('.sector-view__spark-base')
        const y    = Number(base.getAttribute('y1'))
        const [, , , h] = svg.getAttribute('viewBox').split(' ').map(Number)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(y).toBeLessThanOrEqual(h)
    })

    it('no line, one point, or junk draws NOTHING — never an empty box', () => {
        // A call made today has no line yet. An empty chart frame reads as a broken chart.
        for (const series of [undefined, {}, { Healthcare: [] }, { Healthcare: line(100) }, { Healthcare: 'nope' }]) {
            const { container, unmount } = render(<SectorView tilt={tilt()} series={series} />)
            expect(container.querySelector('.sector-view__spark')).toBeNull()
            unmount()
        }
    })

    it('the board paints its numbers whether or not the lines have arrived', () => {
        // The series is a separate read. The board must never wait for it.
        const { container } = render(<SectorView tilt={tilt()} />)
        expect(container.querySelectorAll('.sector-view__row')).toHaveLength(1)
        expect(screen.getByText('+150bp')).toBeTruthy()
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
