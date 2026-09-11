import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AetherCandidates, urgencyOf, byTicker, lastEventDate } from './AetherCandidates.jsx'
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
const getDiscoveryStatus = vi.fn(async () => ({ running: false, progress: null, last: null }))
vi.mock('../../services/aether/aether.service.remote.js', () => ({
    aetherService: {
        startDiscovery: (...a) => startDiscovery(...a),
        getDiscoveryStatus: (...a) => getDiscoveryStatus(...a),
    },
}))

afterEach(() => {
    cleanup()
    startDiscovery.mockReset()
    getDiscoveryStatus.mockReset()
    getDiscoveryStatus.mockResolvedValue({ running: false, progress: null, last: null })
    AUTH = ADMIN
})

const RUN = {
    run_id: 'Canada:2026-09-08',
    subject: 'Canada',
    event: 'Canada imposes retaliatory tariffs',
    event_category: 'trade',
    answer_shape: 'sized',
    event_date: '2026-09-08',
    candidates: [{ ticker: 'NUE', side: 'hurt', tier: 2, verdict: 'quantified', status: 'fresh' }],
}

// Selected by class, not by label: the label is now the STAGE and changes as the run
// moves, which is the whole feature. A name-based query would have to list every stage.
const btn = () => document.querySelector('.aether-candidates__run-btn')

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

    it('reports that it is RUNNING, not that it finished, and stops taking presses', async () => {
        // A run is minutes of model calls and EDGAR requests; it writes to Mongo when it
        // lands and the list polls it up on its own.
        startDiscovery.mockResolvedValue({ started: true, pid: 1 })
        render(<AetherCandidates runs={[RUN]} />)
        fireEvent.click(btn())

        await waitFor(() => expect(btn().disabled).toBe(true))
        expect(btn().textContent).not.toMatch(/run discovery/i)
        expect(startDiscovery).toHaveBeenCalledTimes(1)
    })

    it('a 409 reads as “already running”, never as a failure', async () => {
        // The server refuses a concurrent run because the selector reads recently-run
        // subjects at start-up: a second run would re-pick — and re-pay for — the first's
        // events. Calling that an error would invite exactly the retry it just refused.
        startDiscovery.mockRejectedValue({ response: { status: 409 } })
        render(<AetherCandidates runs={[RUN]} />)
        fireEvent.click(btn())

        await waitFor(() => expect(btn().disabled).toBe(true))
        expect(btn().textContent).not.toMatch(/could not/i)
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

    it('names the event, its category and its date on the appearance itself', () => {
        // The category rode a chip strip above the list until the list went ticker-first.
        // It belongs to the appearance, not to the screen: a company reached by two events
        // has two categories, and a strip can only show one of them per event anyway.
        render(<AetherCandidates runs={[RUN]} />)
        fireEvent.click(screen.getByText('NUE').closest('button'))
        expect(screen.getByText(/Canada/)).toBeTruthy()
        expect(screen.getByText(/trade/)).toBeTruthy()
    })

    it('a run stored before the label existed simply omits it', () => {
        render(<AetherCandidates runs={[{ ...RUN, event_category: '' }]} />)
        fireEvent.click(screen.getByText('NUE').closest('button'))
        expect(screen.queryByText(/· trade/)).toBeNull()
        expect(screen.getByText('NUE')).toBeTruthy()
    })

    it('an unmeasured magnitude never reads as small', () => {
        // The whole reason the shock feed was retired: it showed "large"/"medium" on 170
        // cards and never "small", off a channel state three months stale. Nothing in this
        // cell may imply a size the engine did not measure.
        render(<AetherCandidates runs={[RUN]} />)
        for (const word of [/small/i, /large/i, /medium/i, /moderate/i]) {
            expect(screen.queryByText(word)).toBeNull()
        }
    })

    // WHAT BACKS THE NAME, where there is no percentage to show.
    //
    // The cell printed a bare em-dash for every unsized name, which on some events is very
    // nearly the whole list — on the Iran run 39 of 45 survivors scored on bucket membership
    // alone and 26 of them tied on two rank values. A dash leaves the reader to supply their
    // own guess about why; the verdict already says.

    it('a name whose filing carries a figure says so', () => {
        render(<AetherCandidates runs={[RUN]} />)
        expect(screen.getByText('figure')).toBeTruthy()
    })

    it('a name its filings only mention reads as named, not as a dash', () => {
        const run = { ...RUN, candidates: [{ ...RUN.candidates[0], verdict: 'mentioned' }] }
        render(<AetherCandidates runs={[run]} />)
        expect(screen.getByText('named')).toBeTruthy()
    })

    it('a name EDGAR found nothing for is marked as resting on the press alone', () => {
        // `silent` is information, not an error — a company visibly exposed in the press and
        // silent in its filings is the interesting case. It must be legible as that.
        const run = { ...RUN, candidates: [{ ...RUN.candidates[0], verdict: 'silent' }] }
        render(<AetherCandidates runs={[run]} />)
        expect(screen.getByText('press only')).toBeTruthy()
        expect(screen.getByTitle(/rests on the press mechanism alone/)).toBeTruthy()
    })

    it('a disclosed percentage still outranks the label', () => {
        const run = { ...RUN, candidates: [{ ...RUN.candidates[0], impact_pct_revenue: 0.021 }] }
        render(<AetherCandidates runs={[run]} />)
        expect(screen.getByText('2.10%')).toBeTruthy()
        expect(screen.queryByText('figure')).toBeNull()
    })

    it('a verdict that is not a reading of a filing gets no word implying one', () => {
        // no_filer, skipped and unverified are all real values. `unverified` especially:
        // it means EDGAR could not be asked, which is not a finding about the filing.
        const run = { ...RUN, candidates: [{ ...RUN.candidates[0], verdict: 'unverified' }] }
        render(<AetherCandidates runs={[run]} />)
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
    const floorCss = readFileSync(resolve(process.cwd(), 'src/cmps/Floor/Floor.scss'), 'utf8')
    const container = css.slice(css.indexOf('.aether-candidates {'),
                                css.indexOf('.aether-candidates__bar'))
    // Wide enough to reach `&--open`, which is the modifier that unblocks sticky.
    const sub = floorCss.slice(floorCss.indexOf('.floor-sub {'),
                               floorCss.indexOf('.floor-sub {') + 1200)

    it('the list scrolls', () => {
        expect(container).toMatch(/overflow-y:\s*auto/)
    })

    it('a row refuses to shrink, so the list is what overflows', () => {
        // The guard followed the markup twice: `__run` when the list was event-first, the
        // table when it went ticker-first, and now .floor-sub, because the rows ARE the
        // Floor's rows. Same failure each time if it is missing — the child shrinks, the
        // parent never overflows, and the list is silently cut with no scrollbar.
        expect(sub).toMatch(/flex:\s*0 0 auto/)
    })

    it('every direct child of the list holds its height', () => {
        for (const rule of ['__bar', '__more']) {
            const block = css.slice(css.indexOf(`.aether-candidates${rule}`))
            expect(block.slice(0, 260)).toMatch(/flex:\s*0 0 auto/)
        }
    })

    it('the open row pins to the top of the scrolling list', () => {
        // A drawer holds a block per event and runs past a screen, so the row naming the
        // company scrolls away first and the reader loses which name they are reading about.
        const pinned = css.slice(css.indexOf('.aether-candidates .floor-sub--open .floor-rowhost'))
        expect(pinned.slice(0, 300)).toMatch(/position:\s*sticky/)
        expect(pinned.slice(0, 300)).toMatch(/top:\s*0/)
    })

    it('the pinned row is opaque, or the drawer reads through it', () => {
        const pinned = css.slice(css.indexOf('.aether-candidates .floor-sub--open .floor-rowhost'))
        expect(pinned.slice(0, 400)).toMatch(/background:\s*var\(--bg-base\)/)
    })

    it('sticky is pinned on the HOST, so the actions overlay travels with it', () => {
        // .floor-rowhost__actions is absolutely positioned against the host. Sticking the
        // row alone would leave its buttons behind at the old scroll offset.
        expect(css).toMatch(/\.floor-sub--open \.floor-rowhost \{/)
        expect(css).not.toMatch(/\.floor-sub--open \.floor-row \{/)
    })

    it('nothing between the pinned row and the scroller clips it', () => {
        // `overflow: hidden` on ANY ancestor silently defeats position: sticky — no error,
        // it just stops sticking. .floor-sub is hidden while collapsed and switches to
        // visible when open, which is the whole reason that rule exists in Floor.scss.
        expect(sub).toMatch(/&--open \{[^}]*overflow:\s*visible/s)
    })

    it('no orphaned rule is still claiming to do the scrolling', () => {
        // `__run` then `__table` each carried this fix in turn. A dead rule that looks like
        // the guard is worse than no rule: the next reader stops looking.
        expect(css).not.toMatch(/\.aether-candidates__run \{/)
        expect(css).not.toMatch(/\.aether-candidates__table \{/)
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
        // FOURTEEN, not the 43 the live run produced. The property is "more than
        // SHORTLIST", and this is the only test here that renders the full list TWICE —
        // at 43 rows it took 11s and timed out under the suite's parallel load. The row
        // count was realism, not the assertion.
        render(<AetherCandidates runs={[many(14)]} />)
        fireEvent.click(screen.getByRole('button', { name: /4 more/ }))
        expect(screen.getByText('T13')).toBeTruthy()

        fireEvent.click(screen.getByRole('button', { name: /Show the top 10/ }))
        expect(screen.queryByText('T13')).toBeNull()
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
        expect(screen.queryByText(/\(\d+ events\)/)).toBeNull()
    })

    it('a company named twice says so on its row', () => {
        render(<AetherCandidates runs={[r2('a', 'Canada', [c2()]), r2('b', 'Congo', [c2()])]} />)
        expect(screen.getByText('(2 events)')).toBeTruthy()
    })

    it('opening the row shows both events, each with its own why', () => {
        render(<AetherCandidates runs={[
            r2('a', 'Canada', [c2({ mechanism: 'steel input cost' })]),
            r2('b', 'Congo', [c2({ mechanism: 'cobalt supply' })]),
        ]} />)
        fireEvent.click(screen.getByText('NUE').closest('button'))
        expect(screen.getByText('steel input cost')).toBeTruthy()
        expect(screen.getByText('cobalt supply')).toBeTruthy()
    })

    it('each event is named on its own block inside the row', () => {
        render(<AetherCandidates runs={[r2('a', 'Canada', [c2()]), r2('b', 'Congo', [c2()])]} />)
        fireEvent.click(screen.getByText('NUE').closest('button'))
        expect(screen.getByText(/Canada/)).toBeTruthy()
        expect(screen.getByText(/Congo/)).toBeTruthy()
    })
})

describe('AetherCandidates run progress', () => {
    // "Running" for a run whose stages take twenty seconds, six and a half minutes and
    // then as long as EDGAR feels like tells the reader nothing — and on the day the Iran
    // run died it looked identical to a run that was working.
    it('names the stage the engine has reached', async () => {
        getDiscoveryStatus.mockResolvedValue({
            running: true,
            progress: { stage: 'verifying', detail: '20 of 41 against EDGAR', event: 1, events: 2 },
        })
        render(<AetherCandidates runs={[RUN]} />)
        await waitFor(() => expect(btn().textContent).toMatch(/checking filings/i))
    })

    it('says which event of how many, once it has reached one', async () => {
        getDiscoveryStatus.mockResolvedValue({
            running: true,
            progress: { stage: 'proposing', detail: 'Iran tankers', event: 2, events: 2 },
        })
        render(<AetherCandidates runs={[RUN]} />)
        await waitFor(() => expect(btn().textContent).toMatch(/event 2 of 2/))
    })

    it('does not claim an event before the engine has started one', async () => {
        // `events` is the ceiling the run was given, not where it is.
        getDiscoveryStatus.mockResolvedValue({
            running: true,
            progress: { stage: 'triage', detail: 'reading 218 of 239 headlines', event: 0, events: 2 },
        })
        render(<AetherCandidates runs={[RUN]} />)
        await waitFor(() => expect(btn().textContent).toMatch(/reading the news queue/i))
        expect(btn().textContent).not.toMatch(/event/i)
    })

    it('finds a run THIS browser did not start', async () => {
        // A reload mid-run used to leave the button reading "Run discovery" over a live
        // engine, with only the server's 409 stopping a second press.
        getDiscoveryStatus.mockResolvedValue({ running: true, progress: { stage: 'proposing' } })
        render(<AetherCandidates runs={[RUN]} />)
        await waitFor(() => expect(btn().disabled).toBe(true))
        expect(startDiscovery).not.toHaveBeenCalled()
    })

    it('an unrecognised stage still reads as running rather than as nothing', async () => {
        // The stages are parsed off the engine's log lines, so a changed Python string
        // stops the updates. That has to degrade to the old chip, not to a blank button.
        getDiscoveryStatus.mockResolvedValue({ running: true, progress: { stage: 'who-knows' } })
        render(<AetherCandidates runs={[RUN]} />)
        await waitFor(() => expect(btn().textContent).toMatch(/running/i))
    })

    it('returns to idle when the run ends', async () => {
        getDiscoveryStatus.mockResolvedValue({ running: true, progress: { stage: 'verifying' } })
        render(<AetherCandidates runs={[RUN]} />)
        await waitFor(() => expect(btn().disabled).toBe(true))

        getDiscoveryStatus.mockResolvedValue({ running: false, progress: null, last: { ok: true } })
        await waitFor(() => expect(btn().textContent).toMatch(/run discovery/i), { timeout: 6000 })
    })

    it('a status read that fails does not break the button', async () => {
        getDiscoveryStatus.mockRejectedValue(new Error('network'))
        render(<AetherCandidates runs={[RUN]} />)
        await waitFor(() => expect(btn()).toBeTruthy())
        expect(btn().textContent).toMatch(/run discovery/i)
    })

    it('a member never polls at all', async () => {
        AUTH = MEMBER
        render(<AetherCandidates runs={[RUN]} />)
        await waitFor(() => expect(btn()).toBeNull())
        expect(getDiscoveryStatus).not.toHaveBeenCalled()
    })
})

describe('lastEventDate', () => {
    // `event_date` is when the event TOOK EFFECT — the day the market could first react,
    // and the day the move is measured from. That is the date worth reading on a row.
    const app = (over = {}) => ({ run_id: 'r', event_date: '2026-09-08', ...over })

    it('takes the most recent of the events that named it', () => {
        // Not the best appearance's date: the row is answering "how current is this", and
        // the freshest event is what makes it current even if the older one is better evidenced.
        expect(lastEventDate({ appearances: [
            app({ run_id: 'a', event_date: '2026-09-08', rank: 9 }),
            app({ run_id: 'b', event_date: '2026-10-02', rank: 1 }),
        ] })).toBe('2026-10-02')
    })

    it('falls back to when it was found, as the engine does', () => {
        // The same fallback _anchor() makes, for the same reason: better the day it was
        // found than nothing at all.
        expect(lastEventDate({ appearances: [
            app({ event_date: '', created_at: '2026-09-09T00:00:00+00:00' }),
        ] })).toBe('2026-09-09')
    })

    it('prefers a real event date over the discovery date', () => {
        expect(lastEventDate({ appearances: [
            app({ event_date: '2026-09-08', created_at: '2026-09-09T00:00:00+00:00' }),
        ] })).toBe('2026-09-08')
    })

    it('is empty rather than wrong when neither is known', () => {
        expect(lastEventDate({ appearances: [{ run_id: 'r' }] })).toBe('')
        expect(lastEventDate({ appearances: [] })).toBe('')
        expect(lastEventDate()).toBe('')
    })
})

describe('AetherCandidates row date', () => {
    const c2 = (over = {}) => ({ ticker: 'NUE', side: 'hurt', tier: 2, rank: 5,
                                 verdict: 'quantified', ...over })
    const r2 = (id, subject, date, candidates) => ({ run_id: id, subject, event: `${subject} thing`,
                                                     event_date: date, candidates })

    it('shows the event date on the row', () => {
        render(<AetherCandidates runs={[r2('a', 'Canada', '2026-09-08', [c2()])]} />)
        expect(screen.getByText('Sep 8')).toBeTruthy()
    })

    it('shows the most recent when a name has two events', () => {
        render(<AetherCandidates runs={[
            r2('a', 'Canada', '2026-09-08', [c2()]),
            r2('b', 'Congo', '2026-10-02', [c2()]),
        ]} />)
        expect(screen.getByText('Oct 2')).toBeTruthy()
        expect(screen.queryByText('Sep 8')).toBeNull()
    })

    it('says it is the most recent of several, on hover', () => {
        render(<AetherCandidates runs={[
            r2('a', 'Canada', '2026-09-08', [c2()]),
            r2('b', 'Congo', '2026-10-02', [c2()]),
        ]} />)
        expect(screen.getByTitle(/most recent of its 2 events/)).toBeTruthy()
    })

    it('renders no date cell rather than an empty one', () => {
        render(<AetherCandidates runs={[r2('a', 'Canada', '', [c2()])]} />)
        expect(document.querySelector('.floor-row__when')).toBeNull()
    })
})

describe('AetherCandidates empty vs failed', () => {
    // These were the same screen until 2026-09-10, when a DNS wobble at Atlas took down
    // every read in the app — setups, ideas, coverage, scans — and this list calmly
    // reported "No events in the window. Nothing has run recently." Twice, costing two
    // rounds of looking in the wrong place before the log said otherwise.
    //
    // An empty list is a claim about the WORLD. A failed fetch is a claim about the
    // CONNECTION. They must not render the same.

    it('an empty window says nothing has run', () => {
        render(<AetherCandidates runs={[]} />)
        expect(screen.getByText(/No events in the window/)).toBeTruthy()
    })

    it('a failed read says the read failed, not that nothing ran', () => {
        render(<AetherCandidates runs={[]} error="could not reach the server" />)
        expect(screen.getByText(/Could not read the candidate list/)).toBeTruthy()
        expect(screen.queryByText(/No events in the window/)).toBeNull()
    })

    it('the failure keeps the server’s own words', () => {
        // "could not reach the server" and "Could not read event candidates" send the
        // reader to completely different places.
        render(<AetherCandidates runs={[]} error="getaddrinfo ENOTFOUND mongodb.net" />)
        expect(screen.getByText(/ENOTFOUND/)).toBeTruthy()
    })

    it('a failed read still offers the run button', () => {
        render(<AetherCandidates runs={[]} error="boom" />)
        expect(btn()).toBeTruthy()
    })

    it('a poll failing does NOT blank a list already on screen', () => {
        // Throwing away what the reader is looking at because a refresh five minutes later
        // failed would be worse than showing it.
        render(<AetherCandidates runs={[RUN]} error="network" />)
        expect(screen.getByText('NUE')).toBeTruthy()
    })

    it('...but says the list has stopped refreshing', () => {
        render(<AetherCandidates runs={[RUN]} error="network" />)
        expect(screen.getByText(/not refreshing/)).toBeTruthy()
    })

    it('a healthy list carries no caveat', () => {
        render(<AetherCandidates runs={[RUN]} />)
        expect(screen.queryByText(/not refreshing/)).toBeNull()
        expect(screen.queryByText(/Could not read/)).toBeNull()
    })

    it('loading beats both — it is neither empty nor failed yet', () => {
        render(<AetherCandidates runs={[]} loading error="stale from a previous poll" />)
        expect(screen.getByText('Loading…')).toBeTruthy()
    })
})

describe('AetherCandidates run button — capability, not identity', () => {
    // Two admins on two hosts: one with a local engine checkout, one on the deployed app.
    // Discovery spawns a Python process on the SERVER's filesystem, so what decides the
    // button is whether this host has an engine — never which admin is looking.
    //
    // Gating on the person would be wrong in both directions: it would offer the run to
    // whoever it named while they were using the deployed app, where nothing can be
    // spawned, and hide it from the second admin whose local checkout works perfectly.

    it('is offered where the engine exists', async () => {
        getDiscoveryStatus.mockResolvedValue({ running: false, available: true })
        render(<AetherCandidates runs={[RUN]} />)
        await waitFor(() => expect(btn()).toBeTruthy())
    })

    it('is withheld where it does not, from an admin', async () => {
        // Marce on Render, or Roy on Render — same host, same answer.
        getDiscoveryStatus.mockResolvedValue({
            running: false, available: false,
            unavailableReason: 'no engine on this host — AETHER_ENGINE_PATH is not set',
        })
        render(<AetherCandidates runs={[RUN]} />)
        await waitFor(() => expect(btn()).toBeNull())
    })

    it('the list itself is unaffected — only the button goes', async () => {
        getDiscoveryStatus.mockResolvedValue({ running: false, available: false })
        render(<AetherCandidates runs={[RUN]} />)
        await waitFor(() => expect(btn()).toBeNull())
        expect(screen.getByText('NUE')).toBeTruthy()
    })

    it('shows while the answer is still unknown, and hides only on a real no', async () => {
        // UNKNOWN IS TREATED AS AVAILABLE, and the alternative is worse. Hiding until the
        // first status read means a status endpoint that is slow or failing takes the
        // button away from a host that can run perfectly well — a silent loss of the only
        // way to start a run. Showing it costs a brief flash on a host that cannot, and
        // pressing it there answers 503 with the reason, which is a bad second but a
        // recoverable one.
        getDiscoveryStatus.mockReturnValue(new Promise(() => {}))   // never resolves
        render(<AetherCandidates runs={[RUN]} />)
        expect(btn()).toBeTruthy()
    })

    it('a status endpoint that keeps failing does not remove the button', async () => {
        getDiscoveryStatus.mockRejectedValue(new Error('network'))
        render(<AetherCandidates runs={[RUN]} />)
        await waitFor(() => expect(btn()).toBeTruthy())
    })

    it('an older server that does not report the field still offers it', async () => {
        // `available` absent means the field predates this deploy, not that the engine is
        // missing — and the server refuses with a 503 anyway, so the button is safe.
        getDiscoveryStatus.mockResolvedValue({ running: false })
        render(<AetherCandidates runs={[RUN]} />)
        await waitFor(() => expect(btn()).toBeTruthy())
    })
})
