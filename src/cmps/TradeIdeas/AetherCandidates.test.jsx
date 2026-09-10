import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AetherCandidates, urgencyOf, byTicker } from './AetherCandidates.jsx'
import { ADMIN, MEMBER } from '../../testUtils/authStub.js'

// Discovery is the one leg of the engine that spends per press — an Opus call with web
// search for each event it selects, plus several hundred SEC requests — so it is off the
// schedule and behind requireAdmin. The button is the courtesy; the server is the guard.
// What is asserted here is that the courtesy holds and that a refusal reads correctly.

let AUTH = ADMIN
vi.mock('../../context/AuthContext.jsx', async (orig) => {
    const actual = await orig()
    return { ...actual, useAuth: () => AUTH }
})

const startDiscovery = vi.fn()
vi.mock('../../services/aether/aether.service.remote.js', () => ({
    aetherService: { startDiscovery: (...a) => startDiscovery(...a) },
}))

afterEach(() => { cleanup(); startDiscovery.mockReset(); AUTH = ADMIN })

const RUN = {
    run_id: 'Canada:2026-09-08',
    subject: 'Canada',
    event: 'Canada imposes retaliatory tariffs',
    event_category: 'trade',
    answer_shape: 'sized',
    event_date: '2026-09-08',
    candidates: [{ ticker: 'NUE', side: 'hurt', tier: 2, verdict: 'quantified', status: 'fresh' }],
}

const btn = () => screen.queryByRole('button', { name: /run discovery|already running|running —|starting|could not start/i })

describe('AetherCandidates run button', () => {

    it('is not offered to a signed-in member', () => {
        AUTH = MEMBER
        render(<AetherCandidates runs={[RUN]} />)
        expect(btn()).toBeNull()
    })

    it('survives a null auth context rather than taking the list down with it', () => {
        // The list itself is readable by every authenticated user, so a missing provider
        // must cost the button and nothing else.
        AUTH = null
        expect(() => render(<AetherCandidates runs={[RUN]} />)).not.toThrow()
        expect(screen.getByText('NUE')).toBeTruthy()
        expect(btn()).toBeNull()
    })

    it('is offered to an admin', () => {
        render(<AetherCandidates runs={[RUN]} />)
        expect(btn()).toBeTruthy()
    })

    it('is offered on the empty state too — that is when it matters most', () => {
        // Nothing has run, and an admin is the only one who can change that.
        render(<AetherCandidates runs={[]} />)
        expect(screen.getByText(/No events in the window/)).toBeTruthy()
        expect(btn()).toBeTruthy()
    })

    it('reports STARTED, not finished, and stops taking presses', async () => {
        // A run is minutes of model calls and EDGAR requests; it writes to Mongo when it
        // lands and the list polls it up on its own.
        startDiscovery.mockResolvedValue({ started: true, pid: 1 })
        render(<AetherCandidates runs={[RUN]} />)
        fireEvent.click(btn())

        await waitFor(() => expect(btn().textContent).toMatch(/names land in a few minutes/i))
        expect(btn().disabled).toBe(true)
        expect(startDiscovery).toHaveBeenCalledTimes(1)
    })

    it('a 409 reads as “already running”, never as a failure', async () => {
        // The server refuses a concurrent run because the selector reads recently-run
        // subjects at start-up: a second run would re-pick — and re-pay for — the first's
        // events. Calling that an error would invite exactly the retry it just refused.
        startDiscovery.mockRejectedValue({ response: { status: 409 } })
        render(<AetherCandidates runs={[RUN]} />)
        fireEvent.click(btn())

        await waitFor(() => expect(btn().textContent).toMatch(/already running/i))
        expect(btn().textContent).not.toMatch(/could not/i)
        expect(btn().disabled).toBe(true)
    })

    it('a real failure says so, keeps the server’s reason, and stays pressable', async () => {
        // 503 is "no engine on this host" — worth reading, and worth retrying after fixing.
        startDiscovery.mockRejectedValue({
            response: { status: 503, data: { error: 'AETHER_ENGINE_PATH not set' } },
        })
        render(<AetherCandidates runs={[RUN]} />)
        fireEvent.click(btn())

        await waitFor(() => expect(btn().textContent).toMatch(/could not start/i))
        expect(btn().getAttribute('title')).toBe('AETHER_ENGINE_PATH not set')
        expect(btn().disabled).toBe(false)
    })
})

describe('AetherCandidates list', () => {

    it('shows the event category as a chip', () => {
        render(<AetherCandidates runs={[RUN]} />)
        expect(screen.getByText('trade')).toBeTruthy()
    })

    it('shows no chip for a run stored before the label existed', () => {
        render(<AetherCandidates runs={[{ ...RUN, event_category: '' }]} />)
        expect(screen.queryByText('trade')).toBeNull()
        expect(screen.getByText('NUE')).toBeTruthy()
    })

    it('an unmeasured magnitude reads as absent, never as small', () => {
        // The whole reason the shock feed was retired: it showed "large"/"medium" on 170
        // cards and never "small", off a channel state three months stale.
        render(<AetherCandidates runs={[RUN]} />)
        expect(screen.getByTitle(/no figure stated in the filing/)).toBeTruthy()
    })
})

describe('AetherCandidates scrolling', () => {
    // Which box scrolls is a CSS question jsdom cannot measure, so the rule itself is
    // guarded — the same way Floor.scss's column/desk split is.
    //
    // THE BUG THIS EXISTS FOR. `.aether-candidates` is a column flex container, so a child
    // defaults to flex-shrink: 1 and will shrink BELOW its own content to fit the height
    // available. The parent then never overflows, so its own `overflow-y: auto` never
    // yields a scrollbar: 43 names rendered as six rows, the other thirty-seven
    // unreachable, and nothing on screen to say the list had been cut.
    //
    // The guard follows the markup. It used to sit on `__run`, the per-event section; the
    // list went ticker-first and the table became the direct child, so this reads the table.
    const css = readFileSync(
        resolve(process.cwd(), 'src/cmps/TradeIdeas/AetherCandidates.scss'), 'utf8',
    )
    const table = css.slice(css.indexOf('.aether-candidates__table {'),
                            css.indexOf('.aether-candidates__more'))
    const container = css.slice(css.indexOf('.aether-candidates {'),
                                css.indexOf('.aether-candidates__bar'))

    it('the list scrolls', () => {
        expect(container).toMatch(/overflow-y:\s*auto/)
    })

    it('the table refuses to shrink, so the list is what overflows', () => {
        expect(table).toMatch(/flex:\s*0 0 auto/)
    })

    it('no orphaned rule is still claiming to do the scrolling', () => {
        // `.aether-candidates__run` carried this fix until the layout flipped. A dead rule
        // that looks like the guard is worse than no rule: the next reader stops looking.
        expect(css).not.toMatch(/\.aether-candidates__run \{/)
    })
})

describe('urgency', () => {
    // The engine measures the move and does NOT store a verdict on it — `status` is a
    // display function in the Python CLI. The column read c.status, found undefined on
    // every row, and printed "—" for all 43 names while excess_pct and extension sat on
    // the same documents, measured and correct.
    const NOW = Date.parse('2026-09-10T00:00:00Z')
    const c = (over = {}) => ({ excess_pct: -0.012, extension: -0.5,
                                created_at: '2026-09-09T00:00:00+00:00', ...over })

    it('a measured, quiet, recent name is fresh — not a dash', () => {
        expect(urgencyOf(c(), NOW).label).toBe('fresh')
    })

    it('no measurement at all is the only dash', () => {
        expect(urgencyOf(c({ excess_pct: null }), NOW).label).toBe('—')
    })

    it('two sigma against its own volatility has moved', () => {
        expect(urgencyOf(c({ extension: -2.4 }), NOW).label).toBe('moved')
        expect(urgencyOf(c({ extension: 2.4 }), NOW).label).toBe('moved')
    })

    it('moved beats age in both directions', () => {
        const old = { extension: 3, created_at: '2026-06-01T00:00:00Z' }
        expect(urgencyOf(c(old), NOW).label).toBe('moved')
    })

    it('falls back to a flat 5% only when there was no sigma to measure', () => {
        // 4% is an ordinary day for a volatile name and a serious event for a utility,
        // which is why extension wins wherever it exists.
        expect(urgencyOf(c({ extension: null, excess_pct: 0.06 }), NOW).label).toBe('moved')
        expect(urgencyOf(c({ extension: null, excess_pct: 0.02 }), NOW).label).toBe('fresh')
        expect(urgencyOf(c({ extension: 0.5, excess_pct: 0.06 }), NOW).label).toBe('fresh')
    })

    it('a move that is only the market is not a move', () => {
        // excess_pct, never move_pct — up 6% in a week the market rose 6% is nothing.
        expect(urgencyOf(c({ excess_pct: 0.001, extension: 0.1 }), NOW).label).toBe('fresh')
    })

    it('ages fresh -> working -> stale', () => {
        expect(urgencyOf(c({ created_at: '2026-09-08T00:00:00Z' }), NOW).label).toBe('fresh')
        expect(urgencyOf(c({ created_at: '2026-09-01T00:00:00Z' }), NOW).label).toBe('working')
        expect(urgencyOf(c({ created_at: '2026-08-01T00:00:00Z' }), NOW).label).toBe('stale')
    })

    it('a broken timestamp reads as new rather than throwing', () => {
        expect(urgencyOf(c({ created_at: 'not-a-date' }), NOW).label).toBe('fresh')
        expect(urgencyOf(c({ created_at: undefined }), NOW).label).toBe('fresh')
    })

    it('the thresholds still match the engine', () => {
        // DUPLICATED FROM candidates.py — _BIG_EXTENSION 2.0, _FLAT_MOVE_FALLBACK 0.05,
        // _STALE_DAYS 21. Computing urgency here instead of storing it means these two
        // copies can drift in silence; this is the tripwire. If the engine's numbers move,
        // move them here in the same commit.
        expect(urgencyOf(c({ extension: 1.99 }), NOW).label).not.toBe('moved')
        expect(urgencyOf(c({ extension: 2.0 }), NOW).label).toBe('moved')
        expect(urgencyOf(c({ extension: null, excess_pct: 0.0499 }), NOW).label).not.toBe('moved')
        expect(urgencyOf(c({ extension: null, excess_pct: 0.05 }), NOW).label).toBe('moved')
        expect(urgencyOf(c({ created_at: '2026-08-20T00:00:00Z' }), NOW).label).toBe('stale')
    })
})

describe('AetherCandidates shortlist', () => {
    // A run returns everything it named — 43 survivors on the Canada tariffs — and 43 rows
    // is not a shortlist, it is the "here is everything" the reader came to be spared.
    // What must hold is that the cut is VISIBLE and reversible: nothing is dropped, the
    // count is on the button, and one click gets the rest.
    const many = (n) => ({
        ...RUN,
        candidates: Array.from({ length: n }, (_, i) => ({
            ticker: `T${i}`, side: 'hurt', tier: 2, verdict: 'quantified', rank: 9 - i * 0.1,
        })),
    })

    it('shows ten of forty-three', () => {
        render(<AetherCandidates runs={[many(43)]} />)
        expect(screen.getByText('T0')).toBeTruthy()
        expect(screen.getByText('T9')).toBeTruthy()
        expect(screen.queryByText('T10')).toBeNull()
    })

    it('says how many it is not showing', () => {
        render(<AetherCandidates runs={[many(43)]} />)
        expect(screen.getByRole('button', { name: /33 more, lower ranked/ })).toBeTruthy()
    })

    it('one click gets the rest, and another puts them back', () => {
        render(<AetherCandidates runs={[many(43)]} />)
        fireEvent.click(screen.getByRole('button', { name: /33 more/ }))
        expect(screen.getByText('T42')).toBeTruthy()

        fireEvent.click(screen.getByRole('button', { name: /Show the top 10/ }))
        expect(screen.queryByText('T42')).toBeNull()
    })

    it('a short run is not truncated and offers no button', () => {
        render(<AetherCandidates runs={[many(4)]} />)
        expect(screen.getByText('T3')).toBeTruthy()
        expect(screen.queryByRole('button', { name: /more, lower ranked/ })).toBeNull()
    })

    it('exactly ten offers no button either', () => {
        // Off-by-one here would put a "0 more" button under a complete list.
        render(<AetherCandidates runs={[many(10)]} />)
        expect(screen.queryByRole('button', { name: /more, lower ranked/ })).toBeNull()
    })

    it('the shortlist counts TICKERS, not appearances', () => {
        // Two events over the same 43 companies is 43 names, not 86 rows. Counting
        // appearances would make a second event look like twice the work.
        const a = { ...many(43), run_id: 'a', subject: 'Canada' }
        const b = { ...many(43), run_id: 'b', subject: 'Congo' }
        render(<AetherCandidates runs={[a, b]} />)
        expect(screen.getAllByRole('button', { name: /more, lower ranked/ })).toHaveLength(1)
        expect(screen.getByRole('button', { name: /33 more, lower ranked/ })).toBeTruthy()
    })
})

describe('byTicker', () => {
    // The whole point of the flip. Event-first showed a company named by two events twice,
    // in two tables, with nothing on either row to say the other existed — and that is the
    // case most worth seeing, because a name reached independently by a tariff AND an
    // export ban is saying something neither event says alone.
    const cand = (over = {}) => ({ ticker: 'NUE', side: 'hurt', tier: 2, rank: 5, ...over })
    const run = (id, subject, candidates) => ({ run_id: id, subject, event: `${subject} thing`, candidates })

    it('one company named twice is one row with two appearances', () => {
        const rows = byTicker([
            run('a', 'Canada', [cand({ rank: 4 })]),
            run('b', 'Congo', [cand({ rank: 6 })]),
        ])
        expect(rows).toHaveLength(1)
        expect(rows[0].appearances).toHaveLength(2)
    })

    it('each appearance keeps the event that produced it', () => {
        const rows = byTicker([run('a', 'Canada', [cand()]), run('b', 'Congo', [cand()])])
        expect(rows[0].appearances.map(a => a.subject).sort()).toEqual(['Canada', 'Congo'])
    })

    it('ordered by the BEST rank a name reached, not the sum', () => {
        // A sum would let three weak appearances outrank one well-evidenced name, which is
        // the opposite of what recurrence is supposed to mean.
        const rows = byTicker([
            run('a', 'Canada', [cand({ ticker: 'WEAK', rank: 2 }), cand({ ticker: 'STRONG', rank: 9 })]),
            run('b', 'Congo',  [cand({ ticker: 'WEAK', rank: 2 })]),
            run('c', 'Korea',  [cand({ ticker: 'WEAK', rank: 2 })]),
        ])
        expect(rows.map(r => r.ticker)).toEqual(['STRONG', 'WEAK'])
    })

    it('the best appearance leads the row', () => {
        const rows = byTicker([
            run('a', 'Canada', [cand({ rank: 4 })]),
            run('b', 'Congo', [cand({ rank: 6 })]),
        ])
        expect(rows[0].best.subject).toBe('Congo')
        expect(rows[0].rank).toBe(6)
    })

    it('flags a name two events pull opposite ways', () => {
        // Not a contradiction to hide behind one arrow: two live claims about one company.
        const rows = byTicker([
            run('a', 'Canada', [cand({ side: 'hurt' })]),
            run('b', 'Congo', [cand({ side: 'helped' })]),
        ])
        expect(rows[0].conflicted).toBe(true)
    })

    it('agreement is not a conflict', () => {
        const rows = byTicker([
            run('a', 'Canada', [cand({ side: 'hurt' })]),
            run('b', 'Congo', [cand({ side: 'hurt' })]),
        ])
        expect(rows[0].conflicted).toBe(false)
    })

    it('ties break on ticker, so the order never wobbles between renders', () => {
        const rows = byTicker([run('a', 'X', [cand({ ticker: 'ZZZ' }), cand({ ticker: 'AAA' })])])
        expect(rows.map(r => r.ticker)).toEqual(['AAA', 'ZZZ'])
    })

    it('survives an empty or malformed payload', () => {
        expect(byTicker([])).toEqual([])
        expect(byTicker()).toEqual([])
        expect(byTicker([{ run_id: 'a' }])).toEqual([])
    })
})

describe('AetherCandidates recurrence', () => {
    const c2 = (over = {}) => ({ ticker: 'NUE', side: 'hurt', tier: 2, rank: 5,
                                 verdict: 'quantified', ...over })
    const r2 = (id, subject, candidates) => ({ run_id: id, subject, event: `${subject} thing`, candidates })

    it('a company named once carries no event count', () => {
        render(<AetherCandidates runs={[r2('a', 'Canada', [c2()])]} />)
        expect(screen.queryByText(/^\d+ events$/)).toBeNull()
    })

    it('a company named twice says so on its row', () => {
        render(<AetherCandidates runs={[r2('a', 'Canada', [c2()]), r2('b', 'Congo', [c2()])]} />)
        expect(screen.getByText('2 events')).toBeTruthy()
    })

    it('opening the row shows both events, each with its own why', () => {
        render(<AetherCandidates runs={[
            r2('a', 'Canada', [c2({ mechanism: 'steel input cost' })]),
            r2('b', 'Congo', [c2({ mechanism: 'cobalt supply' })]),
        ]} />)
        fireEvent.click(screen.getByText('NUE').closest('tr'))
        expect(screen.getByText('steel input cost')).toBeTruthy()
        expect(screen.getByText('cobalt supply')).toBeTruthy()
    })

    it('the events behind the list are named once, above it', () => {
        render(<AetherCandidates runs={[r2('a', 'Canada', [c2()]), r2('b', 'Congo', [c2()])]} />)
        // Ticker-first buries the question the names answer; the strip restates it.
        expect(screen.getByTitle('Canada thing')).toBeTruthy()
        expect(screen.getByTitle('Congo thing')).toBeTruthy()
    })
})
