import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AetherCandidates, urgencyOf, byTicker, recurring, lastEventDate, tradable, buildAetherSeed, scorecardLine } from './AetherCandidates.jsx'
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
const getScorecard = vi.fn(async () => null)
const quickRead = vi.fn()
vi.mock('../../services/aether/aether.service.remote.js', () => ({
    aetherService: {
        startDiscovery: (...a) => startDiscovery(...a),
        getDiscoveryStatus: (...a) => getDiscoveryStatus(...a),
        getScorecard: (...a) => getScorecard(...a),
        quickRead: (...a) => quickRead(...a),
    },
}))

afterEach(() => {
    cleanup()
    startDiscovery.mockReset()
    getDiscoveryStatus.mockReset()
    getDiscoveryStatus.mockResolvedValue({ running: false, progress: null, last: null })
    getScorecard.mockReset()
    getScorecard.mockResolvedValue(null)
    quickRead.mockReset()
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

// EVENT-FIRST: a name lives inside its event, so most assertions open the event first.
// By subject, which is what the event row prints.
const openEvent = (subject = 'Canada') =>
    fireEvent.click(screen.getByText(subject).closest('button'))
// ...and then the name, whose own drawer is one level further down. Scoped to the open
// event's body: the recurrence strip above the list prints the same ticker.
const openName = (ticker = 'NUE') =>
    fireEvent.click(within(document.querySelector('.floor-sub__body')).getByText(ticker).closest('button'))

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
        expect(screen.getByText('Canada')).toBeTruthy()
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

    it('the event row names the subject, its kind and its date, closed', () => {
        // The event is the unit a reader reasons about — "this happened, and these names
        // are exposed to it" — so it is the row, and the names are inside it.
        render(<AetherCandidates runs={[RUN]} />)
        expect(screen.getByText('Canada')).toBeTruthy()
        expect(screen.getByText('trade')).toBeTruthy()
        expect(screen.getByText('Sep 8')).toBeTruthy()
        expect(screen.queryByText('NUE')).toBeNull()
    })

    it('the names are inside the event, one click down', () => {
        render(<AetherCandidates runs={[RUN]} />)
        openEvent()
        expect(screen.getByText('NUE')).toBeTruthy()
        expect(screen.getByText('Canada imposes retaliatory tariffs')).toBeTruthy()
    })

    it('a run stored before the kind existed shows no kind rather than a wrong one', () => {
        render(<AetherCandidates runs={[{ ...RUN, event_category: '' }]} />)
        expect(screen.queryByText('trade')).toBeNull()
        expect(screen.getByTitle('kind not recorded')).toBeTruthy()
    })

    it('the event row says how many of its names the filings sized', () => {
        const run = { ...RUN, evidence: { n_survived: 45, n_quantified: 8, discloses: false } }
        render(<AetherCandidates runs={[run]} />)
        expect(screen.getByText('8/45 sized')).toBeTruthy()
        expect(screen.getByTitle(/does not land on a line item/)).toBeTruthy()
    })

    it('a run without the evidence summary shows a dash, never a number', () => {
        render(<AetherCandidates runs={[RUN]} />)
        expect(screen.getByTitle(/nothing to size/)).toBeTruthy()
    })

    it('an unmeasured magnitude never reads as small', () => {
        // The whole reason the shock feed was retired: it showed "large"/"medium" on 170
        // cards and never "small", off a channel state three months stale. Nothing in this
        // cell may imply a size the engine did not measure.
        render(<AetherCandidates runs={[RUN]} />)
        openEvent()
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
        openEvent()
        expect(screen.getByText('figure')).toBeTruthy()
    })

    it('a name its filings only mention reads as named, not as a dash', () => {
        const run = { ...RUN, candidates: [{ ...RUN.candidates[0], verdict: 'mentioned' }] }
        render(<AetherCandidates runs={[run]} />)
        openEvent()
        expect(screen.getByText('named')).toBeTruthy()
    })

    it('a name EDGAR found nothing for is marked as resting on the press alone', () => {
        // `silent` is information, not an error — a company visibly exposed in the press and
        // silent in its filings is the interesting case. It must be legible as that.
        const run = { ...RUN, candidates: [{ ...RUN.candidates[0], verdict: 'silent' }] }
        render(<AetherCandidates runs={[run]} />)
        openEvent()
        expect(screen.getByText('press only')).toBeTruthy()
        expect(screen.getByTitle(/rests on the press mechanism alone/)).toBeTruthy()
    })

    it('a disclosed percentage still outranks the label', () => {
        const run = { ...RUN, candidates: [{ ...RUN.candidates[0], impact_pct_revenue: 0.021 }] }
        render(<AetherCandidates runs={[run]} />)
        openEvent()
        expect(screen.getByText('2.10%')).toBeTruthy()
        expect(screen.queryByText('figure')).toBeNull()
    })

    it('a verdict that is not a reading of a filing gets no word implying one', () => {
        // no_filer, skipped and unverified are all real values. `unverified` especially:
        // it means EDGAR could not be asked, which is not a finding about the filing.
        const run = { ...RUN, candidates: [{ ...RUN.candidates[0], verdict: 'unverified' }] }
        render(<AetherCandidates runs={[run]} />)
        openEvent()
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
        const pinned = css.slice(css.indexOf('.aether-candidates .floor-sub--open > .floor-rowhost'))
        expect(pinned.slice(0, 300)).toMatch(/position:\s*sticky/)
        expect(pinned.slice(0, 300)).toMatch(/top:\s*0/)
    })

    it('the pinned row is opaque, or the drawer reads through it', () => {
        const pinned = css.slice(css.indexOf('.aether-candidates .floor-sub--open > .floor-rowhost'))
        expect(pinned.slice(0, 400)).toMatch(/background:\s*var\(--bg-base\)/)
    })

    it('sticky is pinned on the HOST, so the actions overlay travels with it', () => {
        // .floor-rowhost__actions is absolutely positioned against the host. Sticking the
        // row alone would leave its buttons behind at the old scroll offset.
        expect(css).toMatch(/\.floor-sub--open > \.floor-rowhost \{/)
        expect(css).not.toMatch(/\.floor-sub--open > \.floor-row \{/)
    })

    it('only the EVENT row pins — the names inside it scroll', () => {
        // The names are RowHosts too, one level down. A descendant selector would pin every
        // one of them at top: 0 as it scrolled past, fifteen rows stacking on the event row.
        expect(css).toMatch(/\.floor-sub--open > \.floor-rowhost \{/)
        expect(css).not.toMatch(/\.floor-sub--open \.floor-rowhost \{/)
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
        openEvent()
        expect(screen.getByText('T0')).toBeTruthy()
        expect(screen.getByText('T9')).toBeTruthy()
        expect(screen.queryByText('T10')).toBeNull()
    })

    it('says how many it is not showing', () => {
        render(<AetherCandidates runs={[many(43)]} />)
        openEvent()
        expect(screen.getByRole('button', { name: /33 more, lower ranked/ })).toBeTruthy()
    })

    it('one click gets the rest, and another puts them back', () => {
        // FOURTEEN, not the 43 the live run produced. The property is "more than
        // SHORTLIST", and this is the only test here that renders the full list TWICE —
        // at 43 rows it took 11s and timed out under the suite's parallel load. The row
        // count was realism, not the assertion.
        render(<AetherCandidates runs={[many(14)]} />)
        openEvent()
        fireEvent.click(screen.getByRole('button', { name: /4 more/ }))
        expect(screen.getByText('T13')).toBeTruthy()

        fireEvent.click(screen.getByRole('button', { name: /Show the top 10/ }))
        expect(screen.queryByText('T13')).toBeNull()
    })

    it('a short run is not truncated and offers no button', () => {
        render(<AetherCandidates runs={[many(4)]} />)
        openEvent()
        expect(screen.getByText('T3')).toBeTruthy()
        expect(screen.queryByRole('button', { name: /more, lower ranked/ })).toBeNull()
    })

    it('exactly ten offers no button either', () => {
        // Off-by-one here would put a "0 more" button under a complete list.
        render(<AetherCandidates runs={[many(10)]} />)
        openEvent()
        expect(screen.queryByRole('button', { name: /more, lower ranked/ })).toBeNull()
    })

    it('each event keeps its own shortlist, and only the open one shows it', () => {
        // "33 more" is a statement about one run's ranks, not about the screen: two events
        // over 43 names each are two shortlists, one per accordion.
        const a = { ...many(43), run_id: 'a', subject: 'Canada' }
        const b = { ...many(43), run_id: 'b', subject: 'Congo' }
        render(<AetherCandidates runs={[a, b]} />)
        expect(screen.queryByRole('button', { name: /more, lower ranked/ })).toBeNull()
        openEvent('Canada')
        expect(screen.getAllByRole('button', { name: /33 more, lower ranked/ })).toHaveLength(1)
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

    // EVENT-FIRST CANNOT SHOW THIS ON ITS OWN — a name three events reached is one row in
    // each of three closed accordions — so it is said three ways: a strip above the list,
    // a ×N badge on the name's row inside each event, and the other events as jumps in the
    // name's own drawer. That is the one thing the ticker-first layout could show, kept.

    it('a company named once carries no badge, and there is no strip', () => {
        render(<AetherCandidates runs={[r2('a', 'Canada', [c2()])]} />)
        expect(document.querySelector('.aether-candidates__recur')).toBeNull()
        openEvent()
        expect(screen.queryByText(/^×\d+$/)).toBeNull()
    })

    it('the strip names a company two events reached, with its count', () => {
        render(<AetherCandidates runs={[r2('a', 'Canada', [c2()]), r2('b', 'Congo', [c2()])]} />)
        const chip = document.querySelector('.aether-candidates__chip')
        expect(chip.textContent).toContain('NUE')
        expect(chip.textContent).toContain('×2')
        expect(chip.title).toMatch(/Canada/)
        expect(chip.title).toMatch(/Congo/)
    })

    it('the badge rides the name inside each event', () => {
        render(<AetherCandidates runs={[r2('a', 'Canada', [c2()]), r2('b', 'Congo', [c2()])]} />)
        openEvent('Canada')
        expect(within(document.querySelector('.floor-sub__body')).getByText('×2')).toBeTruthy()
        expect(screen.getByTitle(/also named by 1 other event: Congo/)).toBeTruthy()
    })

    it('the drawer lists the other event, and the jump opens it', () => {
        render(<AetherCandidates runs={[
            r2('a', 'Canada', [c2({ mechanism: 'steel input cost' })]),
            r2('b', 'Congo', [c2({ mechanism: 'cobalt supply' })]),
        ]} />)
        openEvent('Canada')
        openName()
        expect(screen.getByText('steel input cost')).toBeTruthy()
        expect(screen.queryByText('cobalt supply')).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: 'Congo' }))
        // Congo is the open event now; Canada's names are gone and the drawer is closed.
        expect(screen.queryByText('steel input cost')).toBeNull()
        openName()
        expect(screen.getByText('cobalt supply')).toBeTruthy()
    })

    it('a name two events pull opposite ways is marked, on the strip and on the row', () => {
        // Two live claims about the same company, not a contradiction to hide.
        render(<AetherCandidates runs={[
            r2('a', 'Canada', [c2({ side: 'hurt' })]),
            r2('b', 'Congo', [c2({ side: 'helped' })]),
        ]} />)
        expect(document.querySelector('.aether-candidates__chip--conflicted')).toBeTruthy()
        expect(screen.getByLabelText('opposite directions')).toBeTruthy()
        openEvent('Canada')
        expect(screen.getByTitle(/pulling in opposite directions/)).toBeTruthy()
    })

    it('the strip shows twelve and says how many it is not showing', () => {
        // 27 recurring names the day this was built — four rows of chips pushed the events
        // below the fold, which inverts what the strip is for.
        const cand = t => ({ ticker: t, side: 'hurt', rank: 1, verdict: 'silent' })
        const names = Array.from({ length: 15 }, (_, i) => `R${i}`)
        render(<AetherCandidates runs={[
            r2('a', 'Canada', names.map(cand)),
            r2('b', 'Congo', names.map(cand)),
        ]} />)
        expect(document.querySelectorAll('.aether-candidates__chip:not(.aether-candidates__chip--more)')).toHaveLength(12)
        fireEvent.click(screen.getByRole('button', { name: '+3 more' }))
        expect(document.querySelectorAll('.aether-candidates__chip:not(.aether-candidates__chip--more)')).toHaveLength(15)
        fireEvent.click(screen.getByRole('button', { name: 'fewer' }))
        expect(document.querySelectorAll('.aether-candidates__chip:not(.aether-candidates__chip--more)')).toHaveLength(12)
    })

    it('twelve or fewer recurring names need no toggle', () => {
        render(<AetherCandidates runs={[r2('a', 'Canada', [c2()]), r2('b', 'Congo', [c2()])]} />)
        expect(screen.queryByRole('button', { name: /more$/ })).toBeNull()
    })

    it('agreement is not marked', () => {
        render(<AetherCandidates runs={[r2('a', 'Canada', [c2()]), r2('b', 'Congo', [c2()])]} />)
        expect(document.querySelector('.aether-candidates__chip--conflicted')).toBeNull()
    })
})

describe('recurring', () => {
    const c = (ticker, rank, side = 'hurt') => ({ ticker, side, rank, verdict: 'silent' })
    const r = (id, candidates) => ({ run_id: id, subject: id, candidates })

    it('is only the names more than one event reached', () => {
        const rows = recurring([r('a', [c('X', 5), c('Y', 9)]), r('b', [c('X', 4)])])
        expect(rows.map(x => x.ticker)).toEqual(['X'])
    })

    it('most-recurring first, then best rank, then ticker', () => {
        const rows = recurring([
            r('a', [c('X', 5), c('Y', 9), c('Z', 9)]),
            r('b', [c('X', 4), c('Y', 1), c('Z', 1)]),
            r('c', [c('X', 1)]),
        ])
        expect(rows.map(x => x.ticker)).toEqual(['X', 'Y', 'Z'])
    })

    it('survives an empty payload', () => {
        expect(recurring([])).toEqual([])
        expect(recurring()).toEqual([])
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

    it('each event shows its own date', () => {
        render(<AetherCandidates runs={[
            r2('a', 'Canada', '2026-09-08', [c2()]),
            r2('b', 'Congo', '2026-10-02', [c2()]),
        ]} />)
        expect(screen.getByText('Oct 2')).toBeTruthy()
        expect(screen.getByText('Sep 8')).toBeTruthy()
    })

    it('says it is the day the event took effect, on hover', () => {
        render(<AetherCandidates runs={[r2('a', 'Canada', '2026-09-08', [c2()])]} />)
        expect(screen.getByTitle('the event took effect 2026-09-08')).toBeTruthy()
    })

    it('falls back to the day the event was found, as the engine does', () => {
        render(<AetherCandidates runs={[{ ...r2('a', 'Canada', '', [c2()]), created_at: '2026-09-10T14:00:00Z' }]} />)
        expect(screen.getByText('Sep 10')).toBeTruthy()
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
        expect(screen.getByText('Canada')).toBeTruthy()
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
        expect(screen.getByText('Canada')).toBeTruthy()
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

describe('AetherCandidates — the ticker charts, the row expands', () => {
    // WHAT THIS REPLACED. The chart used to hang off a lone `open` button in RowHost's
    // actions slot, and that overlay is positioned absolutely over the row's right edge and
    // revealed on hover — which here sits on top of the score and status cells. Reaching for
    // a row's urgency label charted a symbol in a different panel instead of expanding it.
    //
    // It also only happened in the workspace tab: FloorLists renders this same component
    // with no onSymbolClick at all, so one list behaved two ways depending on where you
    // were looking at it.

    it('clicking the ticker asks for its chart', () => {
        const onSymbolClick = vi.fn()
        render(<AetherCandidates runs={[RUN]} onSymbolClick={onSymbolClick} />)
        openEvent()
        fireEvent.click(screen.getByText('NUE'))
        expect(onSymbolClick).toHaveBeenCalledWith('NUE')
    })

    it('clicking the ticker does NOT open the name', () => {
        // The two are different questions — "show me the chart" and "why is this name here"
        // — so one press must not answer both.
        const onSymbolClick = vi.fn()
        render(<AetherCandidates runs={[RUN]} onSymbolClick={onSymbolClick} />)
        openEvent()
        fireEvent.click(screen.getByText('NUE'))
        expect(screen.queryByText('quantified')).toBeNull()
    })

    it('clicking the name row opens its drawer, and charts nothing', () => {
        const onSymbolClick = vi.fn()
        render(<AetherCandidates runs={[RUN]} onSymbolClick={onSymbolClick} />)
        openEvent()
        openName()
        expect(screen.getByText('quantified')).toBeTruthy()
        expect(onSymbolClick).not.toHaveBeenCalled()
    })

    it('the ticker on the recurrence strip charts too', () => {
        const onSymbolClick = vi.fn()
        const twice = [{ ...RUN }, { ...RUN, run_id: 'b', subject: 'Congo' }]
        render(<AetherCandidates runs={twice} onSymbolClick={onSymbolClick} />)
        fireEvent.click(document.querySelector('.aether-candidates__chip-sym'))
        expect(onSymbolClick).toHaveBeenCalledWith('NUE')
    })

    it('no separate open button rides over the status cells any more', () => {
        render(<AetherCandidates runs={[RUN]} onSymbolClick={() => {}} />)
        expect(screen.queryByTitle(/^Open NUE$/)).toBeNull()
        expect(document.querySelector('.aether-actions')).toBeNull()
    })

    it('the list reads the same where no chart panel exists', () => {
        // Floor Lists passes no handler. The rows must still be there and still expand —
        // only the chart is absent.
        render(<AetherCandidates runs={[RUN]} />)
        openEvent()
        openName()
        expect(screen.getByText('quantified')).toBeTruthy()
    })
})


describe('tradable — the gate on the hand-off', () => {
    // These names are for SWING trades, and a swing is offered only while the clock runs and
    // the name has not moved. A `moved` name is the part Aether exists to get in FRONT of.
    const NOW = new Date('2026-09-14T12:00:00Z').getTime()
    const quiet = (over = {}) => ({ side: 'hurt', excess_pct: 0.004, extension: 0.3,
                                    created_at: '2026-09-13T00:00:00Z', expires_at: '2026-10-28', ...over })

    it('a quiet, fresh name with a running clock is a trade', () => {
        expect(tradable(quiet(), NOW).ok).toBe(true)
    })

    it('a name that has moved is not — that already happened', () => {
        const t = tradable(quiet({ extension: 2.4 }), NOW)
        expect(t.ok).toBe(false)
        expect(t.why).toMatch(/already happened/)
    })

    it('a stale name is not, until re-checked', () => {
        const t = tradable(quiet({ created_at: '2026-08-01T00:00:00Z' }), NOW)
        expect(t.ok).toBe(false)
        expect(t.why).toMatch(/re-check/)
    })

    it('an expired name is not — its print has landed', () => {
        const t = tradable(quiet({ expires_at: '2026-09-01' }), NOW)
        expect(t.ok).toBe(false)
        expect(t.why).toMatch(/expired 2026-09-01/)
    })

    it('a name with no move measured yet still is — unmeasured is not wrong', () => {
        expect(tradable(quiet({ excess_pct: null, extension: null }), NOW).ok).toBe(true)
    })

    it('a name with no expiry is not blocked by one', () => {
        expect(tradable(quiet({ expires_at: '' }), NOW).ok).toBe(true)
    })

    it('a name with no side has nothing to build a lean on', () => {
        expect(tradable(quiet({ side: 'mixed' }), NOW).ok).toBe(false)
        expect(tradable({}, NOW).ok).toBe(false)
    })
})

describe('buildAetherSeed — what the user says to Mentor', () => {
    // Spoken as the USER's turn, like the calendar seeds — but where the earnings seed leaves
    // direction open, here the side is the desk's read, so it is stated as Aether's claim and
    // the user's lean for Mentor to examine. Every line traces to a stored field.
    const run = { run_id: 'Strait of Hormuz:2026-09-13', subject: 'Strait of Hormuz',
                  event: 'Saudi Arabia shut its East-West oil pipeline', event_category: 'disruption',
                  event_date: '2026-09-13' }
    const c = { ticker: 'FRO', company: 'Frontline plc', side: 'helped', verdict: 'silent',
                mechanism: 'Replacement barrels for Asia and Europe must come by sea.',
                press_evidence: 'Frontline operates the largest listed VLCC fleet.',
                source_url: 'https://example.com/fro', excess_pct: 0.012, extension: 0.4,
                price_asof: '2026-09-14', expires_at: '2026-10-28', next_earnings: '2026-10-28' }

    it('opens with the ticker, the event and its kind and date', () => {
        const seed = buildAetherSeed(c, run)
        expect(seed).toMatch(/^I want to build a swing setup on FRO \(Frontline plc\) off an Aether event — Strait of Hormuz \(disruption, 2026-09-13\): "Saudi Arabia shut/)
    })

    it("states the side as Aether's claim and the lean as the user's", () => {
        const seed = buildAetherSeed(c, run)
        expect(seed).toMatch(/Aether has it LONG: Replacement barrels/)
        expect(seed).toMatch(/My lean is long unless you see a reason not to/)
    })

    it('hurt is a short lean', () => {
        expect(buildAetherSeed({ ...c, side: 'hurt' }, run)).toMatch(/Aether has it SHORT/)
        expect(buildAetherSeed({ ...c, side: 'hurt' }, run)).toMatch(/My lean is short/)
    })

    it('carries the press fact with its source', () => {
        expect(buildAetherSeed(c, run)).toMatch(/Press: Frontline operates the largest listed VLCC fleet\. \(https:\/\/example\.com\/fro\)/)
    })

    it('a silent filing is said to be silent, not omitted', () => {
        expect(buildAetherSeed(c, run)).toMatch(/Its filings: silent — nothing it has filed mentions this/)
    })

    it('a quantified filing carries its sentence', () => {
        const seed = buildAetherSeed({ ...c, verdict: 'quantified', filing_evidence: 'tariffs cost $19 million' }, run)
        expect(seed).toMatch(/Its filings: quantified — "tariffs cost \$19 million"/)
    })

    it('the move is stated against SPY with its sigma and date', () => {
        expect(buildAetherSeed(c, run)).toMatch(/Since the event it is 1\.2% vs SPY \(0\.4σ of its own trailing move\), as of 2026-09-14 — still quiet\./)
    })

    it('an unmeasured move is said to be unmeasured, never zero', () => {
        const seed = buildAetherSeed({ ...c, excess_pct: null, extension: null }, run)
        expect(seed).toMatch(/No move measured yet\./)
        expect(seed).not.toMatch(/0\.0%/)
    })

    it('the clock names the expiry and that it is the next report', () => {
        expect(buildAetherSeed(c, run)).toMatch(/Clock: it expires 2026-10-28 \(-?\d+d\), at its next report — the setup should be done by then\./)
    })

    it('survives a run with no fields', () => {
        const seed = buildAetherSeed({ ticker: 'X', side: 'hurt' }, {})
        expect(seed).toMatch(/off an Aether event — an event \(date unknown\)\./)
        expect(seed).toMatch(/Aether has it SHORT\./)
        expect(seed).not.toMatch(/undefined|null/)
    })
})

describe('AetherCandidates — Trade with Mentor', () => {
    const NOW_RUN = {
        ...RUN,
        candidates: [{ ticker: 'NUE', side: 'hurt', tier: 2, verdict: 'quantified',
                       mechanism: 'steel input cost', excess_pct: 0.003, extension: 0.2,
                       created_at: new Date().toISOString(), expires_at: '2099-01-01' }],
    }

    it('is offered under the evidence once the name is open', () => {
        const onTradeWithMentor = vi.fn()
        render(<AetherCandidates runs={[NOW_RUN]} onTradeWithMentor={onTradeWithMentor} />)
        openEvent()
        expect(screen.queryByRole('button', { name: /Trade with Mentor/ })).toBeNull()
        openName()
        fireEvent.click(screen.getByRole('button', { name: /Trade with Mentor/ }))
        expect(onTradeWithMentor).toHaveBeenCalledTimes(1)
        const [ticker, message] = onTradeWithMentor.mock.calls[0]
        expect(ticker).toBe('NUE')
        expect(message).toMatch(/swing setup on NUE/)
        expect(message).toMatch(/Canada/)
        expect(message).toMatch(/steel input cost/)
    })

    it('is disabled, with the reason beside it, for a name that has moved', () => {
        const moved = { ...NOW_RUN, candidates: [{ ...NOW_RUN.candidates[0], extension: 3.1 }] }
        render(<AetherCandidates runs={[moved]} onTradeWithMentor={vi.fn()} />)
        openEvent()
        openName()
        const b = screen.getByRole('button', { name: /Trade with Mentor/ })
        expect(b.disabled).toBe(true)
        expect(screen.getByText(/already happened/)).toBeTruthy()
    })

    it('is not offered at all where there is no Mentor to hand to', () => {
        // The Floor renders this list too, and a test renders it with nothing behind it.
        render(<AetherCandidates runs={[NOW_RUN]} />)
        openEvent()
        openName()
        expect(screen.queryByRole('button', { name: /Trade with Mentor/ })).toBeNull()
    })
})


describe('scorecardLine — what the names did, as one sentence', () => {
    // The two empty states are different sentences: "nothing graded, first grade on
    // <date>" is a desk not yet tested; "nothing to grade" is a desk with nothing to test;
    // and no card at all is the nightly not having run.

    it('no card is the nightly not having run', () => {
        expect(scorecardLine(null).text).toMatch(/nightly refresh has not run/)
    })

    it('nothing graded with names pending says when the first grade comes', () => {
        const l = scorecardLine({ overall: { n: 0 }, pending: 182, next_expiry: '2026-09-27' })
        expect(l.text).toMatch(/nothing graded yet · 182 pending, first grade Sep 27/)
    })

    it('nothing graded and nothing pending is nothing to grade', () => {
        expect(scorecardLine({ overall: { n: 0 }, pending: 0 }).text).toMatch(/nothing to grade/)
    })

    it('a graded card reads counts, the rate of the decided and the mean move', () => {
        const l = scorecardLine({
            overall: { n: 12, hit: 7, miss: 4, flat: 1, unpriced: 0, hit_rate: 0.636, avg_signed_pct: 0.014 },
            by_verdict: { quantified: { hit: 4, miss: 1, hit_rate: 0.8 }, silent: { hit: 3, miss: 3, hit_rate: 0.5 } },
            by_survived: { survived: { hit_rate: 0.7 }, dropped: { hit_rate: 0.4 } },
            pending: 170,
        })
        expect(l.text).toBe('scorecard · 12 graded · 7 hit / 4 miss / 1 flat · 64% of decided · +1.4% avg vs SPY · 170 pending')
        expect(l.hint).toMatch(/by filing: quantified: 4\/5 hit · silent: 3\/6 hit/)
        expect(l.hint).toMatch(/by survival: survived: 70% · dropped: 40%/)
    })

    it('unpriced names are counted when there are any, and silent when there are none', () => {
        const base = { n: 3, hit: 1, miss: 1, flat: 0, hit_rate: 0.5, avg_signed_pct: -0.002 }
        expect(scorecardLine({ overall: { ...base, unpriced: 1 } }).text).toMatch(/1 unpriced/)
        expect(scorecardLine({ overall: { ...base, unpriced: 0 } }).text).not.toMatch(/unpriced/)
    })

    it('a negative mean move keeps its sign', () => {
        expect(scorecardLine({ overall: { n: 2, hit: 0, miss: 2, flat: 0, unpriced: 0, hit_rate: 0, avg_signed_pct: -0.031 } }).text)
            .toMatch(/0% of decided · -3\.1% avg vs SPY/)
    })

    it('a missing rate is a dash, never a number', () => {
        expect(scorecardLine({ overall: { n: 1, hit: 0, miss: 0, flat: 1, unpriced: 0, hit_rate: null, avg_signed_pct: null } }).text)
            .toMatch(/— of decided · — avg vs SPY/)
    })
})

describe('AetherCandidates scorecard line', () => {
    it('reads the card once and shows it above the events', async () => {
        getScorecard.mockResolvedValue({ overall: { n: 0 }, pending: 182, next_expiry: '2026-09-27' })
        render(<AetherCandidates runs={[RUN]} />)
        await waitFor(() => expect(screen.getByText(/182 pending/)).toBeTruthy())
        expect(getScorecard).toHaveBeenCalledTimes(1)
    })

    it('says the nightly has not run when there is no card', async () => {
        render(<AetherCandidates runs={[RUN]} />)
        await waitFor(() => expect(screen.getByText(/nightly refresh has not run/)).toBeTruthy())
    })

    it('a card that will not load costs no line and no error', async () => {
        getScorecard.mockRejectedValue(new Error('network'))
        render(<AetherCandidates runs={[RUN]} />)
        await waitFor(() => expect(getScorecard).toHaveBeenCalled())
        expect(document.querySelector('.aether-candidates__score')).toBeNull()
        expect(screen.getByText('Canada')).toBeTruthy()
    })
})


describe('AetherCandidates — Prometheus quick read', () => {
    const READ = { verdict: 'contradicted', confidence: 0.8, read: 'It hedged the exposure in the 10-Q.',
                   evidence: [{ fact: 'Hedged 90% of 2026 volumes', source: '10-Q 2026-08-01' }] }
    const cand = (over = {}) => ({ ticker: 'NUE', side: 'hurt', tier: 2, verdict: 'quantified',
                                   mechanism: 'steel input cost', excess_pct: 0.003, extension: 0.2,
                                   created_at: new Date().toISOString(), expires_at: '2099-01-01', ...over })

    it('offers the button when no read exists, and shows the read once produced', async () => {
        quickRead.mockResolvedValue(READ)
        render(<AetherCandidates runs={[{ ...RUN, candidates: [cand()] }]} />)
        openEvent()
        openName()
        fireEvent.click(screen.getByRole('button', { name: 'Ask Prometheus' }))
        expect(quickRead).toHaveBeenCalledWith('Canada:2026-09-08', 'NUE')
        await waitFor(() => expect(screen.getByText('contradicted')).toBeTruthy())
        expect(screen.getByText('It hedged the exposure in the 10-Q.')).toBeTruthy()
        expect(screen.getByText(/Hedged 90% of 2026 volumes/)).toBeTruthy()
        expect(screen.getByText('80%')).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'Ask Prometheus' })).toBeNull()
    })

    it('a read already on the candidate shows without a button', () => {
        render(<AetherCandidates runs={[{ ...RUN, candidates: [cand({ quick_read: { verdict: 'priced_in', read: 'Estimates moved.' } })] }]} />)
        openEvent()
        openName()
        expect(screen.getByText('priced in')).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'Ask Prometheus' })).toBeNull()
    })

    it('a failed read keeps the button and says why', async () => {
        quickRead.mockRejectedValue(new Error('budget'))
        render(<AetherCandidates runs={[{ ...RUN, candidates: [cand()] }]} />)
        openEvent()
        openName()
        fireEvent.click(screen.getByRole('button', { name: 'Ask Prometheus' }))
        await waitFor(() => expect(screen.getByText(/budget/)).toBeTruthy())
        expect(screen.getByRole('button', { name: 'Ask Prometheus' })).toBeTruthy()
    })

    it('the read rides in the Mentor seed', async () => {
        quickRead.mockResolvedValue(READ)
        const onTradeWithMentor = vi.fn()
        render(<AetherCandidates runs={[{ ...RUN, candidates: [cand()] }]} onTradeWithMentor={onTradeWithMentor} />)
        openEvent()
        openName()
        fireEvent.click(screen.getByRole('button', { name: 'Ask Prometheus' }))
        await waitFor(() => expect(screen.getByText('contradicted')).toBeTruthy())
        fireEvent.click(screen.getByRole('button', { name: /Trade with Mentor/ }))
        const [, message] = onTradeWithMentor.mock.calls[0]
        expect(message).toMatch(/Prometheus's quick read: contradicted \(80% confidence\) — It hedged the exposure in the 10-Q\./)
    })

    it('the seed carries no Prometheus line when there was no read', () => {
        expect(buildAetherSeed(cand(), RUN)).not.toMatch(/Prometheus/)
    })
})
