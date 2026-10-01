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

    it('renders a stance as a signed active weight, coloured by direction, with no stance word', () => {
        const { container } = render(<SectorView tilt={tilt()} />)
        expect(screen.getByText('Healthcare')).toBeTruthy()
        const bp = screen.getByText('+150bp')
        expect(bp.classList.contains('sector-view__bp--over')).toBe(true)
        expect(screen.queryByText('overweight')).toBeNull()
        expect(screen.getByText('vs SPX')).toBeTruthy()
        expect(container.querySelector('.sector-view__row--over')).toBeTruthy()
    })

    it('an underweight is red and negative, and the direction is never colour alone', () => {
        const { container } = render(<SectorView tilt={tilt({ tilts: [row({ bucket: 'Energy', stance: 'under', active_bp: -150 })] })} />)
        const bp = screen.getByText('-150bp')
        expect(bp.classList.contains('sector-view__bp--under')).toBe(true)
        expect(bp.getAttribute('title')).toBe('underweight')
        expect(bp.getAttribute('aria-label')).toBe('underweight -150bp')
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

    // The line is COLOURED BY DIRECTION (green over, red under, like the weight) and SIGNED by the
    // stance: up means the stance is working. Tested apart — the colour says which way the bet points,
    // the shape says whether it is winning.
    const endsAbove = (svg) => Number(svg.querySelector('.sector-view__spark-dot').getAttribute('cy'))
        < Number(svg.querySelector('.sector-view__spark-base').getAttribute('y1'))

    it('an OVERWEIGHT is green, and a bucket that beat the benchmark draws upward', () => {
        const { container } = render(<SectorView
            tilt={tilt({ tilts: [row({ bucket: 'Energy', stance: 'over', active_bp: 100 })] })}
            series={{ Energy: line(100, 101, 103) }} />)
        const spark = container.querySelector('.sector-view__spark')
        expect(spark.classList.contains('sector-view__spark--over')).toBe(true)
        expect(spark.getAttribute('data-stance')).toBe('over')
        expect(spark.querySelector('polyline').getAttribute('points').split(' ')).toHaveLength(3)
        expect(endsAbove(spark)).toBe(true)
    })

    it('an UNDERWEIGHT is red and signed by its weight — the same rising bucket draws DOWN', () => {
        // The defect the signing pins: the server sends the BUCKET's relative return; the row reports
        // what the STANCE earned. Unsigned, every underweight reads backwards — Real Estate showed
        // +7.9bp beside a falling line, live.
        const { container } = render(<SectorView
            tilt={tilt({ tilts: [row({ bucket: 'Energy', stance: 'under', active_bp: -100 })] })}
            series={{ Energy: line(100, 101, 103) }} />)
        const spark = container.querySelector('.sector-view__spark')
        expect(spark.classList.contains('sector-view__spark--under')).toBe(true)
        expect(endsAbove(spark)).toBe(false)
    })

    it('an UNDERWEIGHT whose bucket FELL draws upward — the win it is — and stays red', () => {
        const { container } = render(<SectorView
            tilt={tilt({ tilts: [row({ bucket: 'Energy', stance: 'under', active_bp: -100, contribution_bp: 7.9 })] })}
            series={{ Energy: line(100, 97, 92) }} />)
        const spark = container.querySelector('.sector-view__spark')
        expect(spark.classList.contains('sector-view__spark--under')).toBe(true)
        expect(endsAbove(spark)).toBe(true)
    })

    it('an overweight that lagged draws down, and stays green', () => {
        const { container } = render(<SectorView
            tilt={tilt({ tilts: [row({ bucket: 'Energy', stance: 'over', active_bp: 100 })] })}
            series={{ Energy: line(100, 99, 96) }} />)
        const spark = container.querySelector('.sector-view__spark')
        expect(spark.classList.contains('sector-view__spark--over')).toBe(true)
        expect(endsAbove(spark)).toBe(false)
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

    // ── context before the call ──────────────────────────────────────────────
    const ctx = (pre, post) => [...pre.map((v, i) => ({ t: i, v, pre: true })), ...post.map((v, i) => ({ t: pre.length + i, v }))]

    it('history before the call is drawn lighter, with a tick at the call, in the row colour', () => {
        const { container } = render(<SectorView
            tilt={tilt({ tilts: [row({ bucket: 'Energy', stance: 'over', active_bp: 100 })] })}
            series={{ Energy: ctx([90, 94, 99], [100, 100.02]) }} />)
        const svg = container.querySelector('.sector-view__spark')
        expect(svg.querySelector('.sector-view__spark-line--pre')).toBeTruthy()
        expect(svg.querySelector('.sector-view__spark-call')).toBeTruthy()
        expect(svg.classList.contains('sector-view__spark--over')).toBe(true)
        // the call's own segment starts at the last context point, so the two join
        const segments = svg.querySelectorAll('polyline')
        expect(segments).toHaveLength(2)
        expect(segments[1].getAttribute('points').split(' ')).toHaveLength(3)
    })

    it('a call made today shows the quarter it was made into, in its direction colour', () => {
        const { container } = render(<SectorView
            tilt={tilt({ tilts: [row({ bucket: 'Energy', stance: 'under', active_bp: -100 })] })}
            series={{ Energy: ctx([96, 98, 101, 100], []) }} />)
        const svg = container.querySelector('.sector-view__spark')
        expect(svg).toBeTruthy()
        expect(svg.classList.contains('sector-view__spark--under')).toBe(true)
        expect(svg.querySelectorAll('polyline')).toHaveLength(1)
        expect(svg.querySelector('.sector-view__spark-line--pre')).toBeTruthy()
    })

    it('the result after the call is read from the shape: an overweight that worked ends above 100', () => {
        const { container } = render(<SectorView
            tilt={tilt({ tilts: [row({ bucket: 'Energy', stance: 'over', active_bp: 100 })] })}
            series={{ Energy: ctx([110, 105, 100], [100, 103]) }} />)
        const svg = container.querySelector('.sector-view__spark')
        expect(svg.classList.contains('sector-view__spark--over')).toBe(true)
        expect(endsAbove(svg)).toBe(true)
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

describe('SectorView — the channel calls', () => {
    const views = [
        { channel_id: 'discount_rate', dz: -0.5, base_dz: -1.78, deviation: 1.28, set_at: '2026-10-01T00:00:00.000Z', rationale: 'Less reversion than usual.' },
        { channel_id: 'some_new_channel', dz: 0.4, base_dz: 0.172, deviation: 0.228, set_at: '2026-10-01T00:00:00.000Z' },
    ]

    it('each call reads in plain words: called, history, and the departure the rows are sized on', () => {
        const { container } = render(<SectorView tilt={tilt({ channel_views: views })} />)
        expect(screen.getByText('Real yields')).toBeTruthy()
        expect(screen.getByText('some new channel'), 'an unnamed channel still reads').toBeTruthy()
        expect(container.querySelector('.sector-view__call-nums').textContent).toBe('called −0.50z · history −1.78z · departs +1.28z')
        expect(screen.getByText('Less reversion than usual.')).toBeTruthy()
    })

    it('with no marks yet, every call says so, and the record line says when grades come', () => {
        render(<SectorView tilt={tilt({ channel_views: views })} calls={{ record: { graded: 0, confidence: 0.4 }, calls: {} }} />)
        expect(screen.getAllByText('no mark yet')).toHaveLength(2)
        expect(screen.getByText(/No call graded yet — each is graded at six months; calls weighted at 0.4 until ten are/)).toBeTruthy()
    })

    it('a mark is the one coloured thing: ahead of history green, behind it red', () => {
        const { container } = render(<SectorView tilt={tilt({ channel_views: views })} calls={{
            record: { graded: 10, beat: 7, hit_rate: 0.7, confidence: 0.4 },
            calls: {
                discount_rate: { latest_mark: { weeks: 13, beat_base: true, actual_dz: -0.3, expected_dz: -0.25, base_expected_dz: -0.89 } },
                some_new_channel: { latest_mark: { weeks: 4, beat_base: false } },
            },
        }} />)
        expect(container.querySelector('.sector-view__call-mark--ahead').textContent).toBe('13w ahead')
        expect(container.querySelector('.sector-view__call-mark--behind').textContent).toBe('4w behind')
        expect(screen.getByText(/Record: 7 of 10 calls beat history \(70%\) — calls weighted at 0.4/)).toBeTruthy()
    })

    it('a view without channel calls shows no calls block', () => {
        const { container } = render(<SectorView tilt={tilt()} />)
        expect(container.querySelector('.sector-view__calls')).toBeNull()
    })
})
