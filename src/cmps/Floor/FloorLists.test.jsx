import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FloorLists } from './FloorLists.jsx'
import { closePanel } from '../DetailPanel/detailPanel.store.js'

// FloorLists renders CoverageActions (in the Forecasts map's company page), which calls useAuth();
// unprovided it is null and the destructure throws. See testUtils/authStub.js.
vi.mock('../../context/AuthContext.jsx', async (orig) => {
    const { authModule } = await import('../../testUtils/authStub.js')
    return authModule(await orig())
})

// The Forecasts desk mounts ForecastPanel, which reads the map when it opens — mocked for the same reason.
vi.mock('../../services/strategy/strategy.service.remote.js', () => ({
    strategyService: {
        getForecastMap: vi.fn(async () => ({ asof: null, tiles: [], unmapped: [], covered_at: {} })),
        getIndustryCompanies: vi.fn(async () => ({ companies: [] })),
        getAssessmentDetail: vi.fn(async () => null),
    },
}))

// The Calendar desk mounts CalendarPanel, which reads the month when it opens — never over the wire
// from a unit test (CR 2026-10-14: one case was making a real request and passing on its failure).
vi.mock('../../services/calendar/calendar.service.remote.js', () => ({
    calendarService: { getCounts: vi.fn(async () => ({ days: {} })), getDay: vi.fn(async () => ({ earnings: [], fed: [], ipo: [] })) },
}))

// The Floor's right column is an ACCORDION — one desk open at a time. That rule is the whole
// reason the column stays readable at four desks, and it is the kind of thing that silently
// regresses into "all open" the first time someone adds a fifth.

afterEach(() => { cleanup(); vi.restoreAllMocks(); closePanel() })

// `call` was the exemplar trade row here until Kairos was archived (2026-08-18). Every case it
// covered is kind-blind, so `setup` carries them now.
const setup  = (over = {}) => ({ id: 's1', asset: 'SPY',  direction: 'short', status: 'waiting', ...over })
const setup2 = (over = {}) => setup({ id: 's2', asset: 'NVDA', ...over })

// The desk HEADER — the strip's chip carries the same name while a desk is open.
const deskBtn = name => {
    const heads = screen.getAllByRole('button', { name: new RegExp(name, 'i') })
        .filter(b => b.classList.contains('floor-desk__head'))
    if (heads.length !== 1) throw new Error(`expected one desk header for ${name}, got ${heads.length}`)
    return heads[0]
}

describe('FloorLists', () => {
    it('renders all four desks', () => {
        render(<FloorLists />)
        for (const label of ['Your trades', 'Your portfolios', 'Watchlists']) {
            expect(deskBtn(label)).toBeTruthy()
        }
    })

    // A refresh must not pick a desk for the reader: the column lands as a table of contents.
    it('opens no desk by default', () => {
        render(<FloorLists setups={[setup2()]} coverage={[{ symbol: 'AAPL', status: 'active' }]} />)
        for (const label of ['Your trades', 'Your portfolios', 'Watchlists']) {
            expect(deskBtn(label).getAttribute('aria-expanded')).toBe('false')
        }
    })

    it('opening one desk closes the one that was open', () => {
        render(<FloorLists setups={[setup2()]} initialDesk="trade" />)
        fireEvent.click(deskBtn('Watchlists'))
        expect(deskBtn('Watchlists').getAttribute('aria-expanded')).toBe('true')
        expect(deskBtn('Your trades').getAttribute('aria-expanded')).toBe('false')
    })

    // All-closed is a legitimate state: the column becomes a table of contents.
    it('clicking the open desk closes it, leaving all four collapsed', () => {
        render(<FloorLists setups={[setup2()]} initialDesk="trade" />)
        fireEvent.click(deskBtn('Your trades'))
        for (const label of ['Your trades', 'Your portfolios', 'Watchlists']) {
            expect(deskBtn(label).getAttribute('aria-expanded')).toBe('false')
        }
    })

    // With every desk closed the COLUMN scrolls, and the "Lists" header must not scroll off with
    // the desk buttons (Roy, 2026-10-14). jsdom can't scroll, so guard the rule itself.
    it('pins the column header while the closed desks scroll', () => {
        const css = readFileSync(resolve(__dirname, 'Floor.scss'), 'utf8')
        const column = css.slice(css.indexOf('.floor-lists {'), css.indexOf('.floor-strip {'))
        expect(column).toMatch(/>\s*\.floor-sec\s*\{[^}]*position:\s*sticky[^}]*top:\s*0/)
    })

    // Axl's <show> reaches every list (Roy, 2026-10-22: "the user should be able to see all lists through Axl") —
    // including the three with no header of their own in the column until they are open.
    describe('every list opens from an outside ask', () => {
        const name = () => screen.getByRole('dialog').getAttribute('aria-label')
        it('positions — the book in a window, its header in the column only while open', () => {
            render(<FloorLists book={{ positions: [], loading: false }} deskRequest={{ key: 'positions' }} />)
            expect(name()).toBe('Positions')
            expect(screen.getByText('No open positions.')).toBeTruthy()
            expect(deskBtn('Positions').getAttribute('aria-expanded')).toBe('true')
            act(() => closePanel())
            expect(screen.queryByRole('button', { name: /^Positions/ })).toBeNull()
        })
        it('the forecast board', () => {
            render(<FloorLists assessments={{ assessments: [], record: null }} deskRequest={{ key: 'board' }} />)
            expect(name()).toBe('Forecast board')
        })
        it('the research queue — for an admin; for anyone else it opens nothing', () => {
            render(<FloorLists isAdmin deskRequest={{ key: 'research_queue' }} />)
            expect(name()).toBe('Research queue')
            cleanup(); act(() => closePanel())
            render(<FloorLists deskRequest={{ key: 'research_queue' }} />)
            expect(screen.queryByRole('dialog')).toBeNull()
        })
    })

    // Every list opens in the DETAIL WINDOW over the chat (Roy, 2026-10-22): the column is the launcher — a header opens
    // its list's window, the column itself never changes.
    describe('the column is a launcher', () => {
        it('a header opens its list in the window; another header switches; its own header closes it', () => {
            render(<FloorLists setups={[setup2()]} />)
            fireEvent.click(deskBtn('Your trades'))
            expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Your trades')
            expect(deskBtn('Your trades').getAttribute('aria-expanded')).toBe('true')
            expect(deskBtn('Your trades').getAttribute('aria-haspopup')).toBe('dialog')
            fireEvent.click(deskBtn('Watchlists'))
            expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Watchlists')
            expect(deskBtn('Your trades').getAttribute('aria-expanded')).toBe('false')
            fireEvent.click(deskBtn('Watchlists'))
            expect(screen.queryByRole('dialog')).toBeNull()
        })

        it('opening a list never folds the column — every header and its count stay in place, and no strip', () => {
            const { container } = render(<FloorLists setups={[setup2()]} queued={[{ id: 'q1' }, { id: 'q2' }]} initialDesk="trade" />)
            expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Your trades')
            expect(container.querySelector('.floor-desk--folded')).toBeNull()
            expect(container.querySelector('.floor-lists').className).not.toMatch(/floor-lists--focused/)
            expect(screen.queryByRole('navigation', { name: 'Desks' })).toBeNull()
            expect(within(deskBtn('Awaiting orders')).getByText('(2)')).toBeTruthy()
        })

        // "Without header" (Roy): the list starts at the top, a small ✕ in the corner; the column's header names it.
        it('a list window has no header — a corner ✕, which closes it', () => {
            render(<FloorLists setups={[setup2()]} initialDesk="trade" />)
            const dialog = screen.getByRole('dialog')
            expect(dialog.querySelector('.detail-panel__head')).toBeNull()
            expect(dialog.querySelector('.detail-panel__kicker')).toBeNull()
            fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
            expect(screen.queryByRole('dialog')).toBeNull()
        })
    })

    // An empty desk stays where it is, dimmed — hiding it would move every header below it each
    // time a count crossed zero (Roy, 2026-10-14).
    describe('empty desks', () => {
        const deskOf = label => deskBtn(label).closest('.floor-desk')

        it('keeps an empty desk in the column, dimmed, and a full one not', () => {
            render(<FloorLists setups={[setup2()]} />)
            expect(deskOf('Watchlists').className).toMatch(/floor-desk--empty/)
            expect(deskOf('Your trades').className).not.toMatch(/floor-desk--empty/)
        })

        // The research desk's COUNT is only what is still queued — but a backlog that is all in
        // research still has rows, so it is not empty.
        it('goes by rows, not the header count: an all-in-research queue is not dimmed', () => {
            render(<FloorLists isAdmin researchQueue={[{ id: 'r1', symbol: 'AAPL', status: 'in_research' }]} />)
            expect(deskOf('Research queue').className).not.toMatch(/floor-desk--empty/)
        })

        it('never dims the uncounted desks — Calendar and Forecasts', () => {
            render(<FloorLists />)
            expect(deskOf('Calendar').className).not.toMatch(/floor-desk--empty/)
            expect(deskOf('Forecasts').className).not.toMatch(/floor-desk--empty/)
        })

        it('says who fills an empty desk', () => {
            render(<FloorLists initialDesk="scans" />)
            expect(screen.getByText(/ask Argus/)).toBeTruthy()
        })
    })

    // The open desk TAKES THE COLUMN — the other headers fold away so the list gets the full
    // height. They stay MOUNTED through it (that is what lets the column animate back into its
    // original order), so "gone" has to be asserted on the fold class, not on the DOM.
    describe('takeover', () => {

        // Closing puts every desk back — same components, same order as a fresh load.
        it('unfolds all of them in their original order when the desk closes', () => {
            const { container } = render(<FloorLists setups={[setup2()]} initialDesk="trade" />)
            fireEvent.click(deskBtn('Your trades'))
            const desks = [...container.querySelectorAll('.floor-desk')]
            expect(desks.some(d => d.className.includes('floor-desk--folded'))).toBe(false)
            expect(desks.map(d => d.querySelector('.floor-desk__label').textContent))
                .toEqual(['Awaiting orders', 'Your trades', 'Your portfolios', 'Watchlists', 'Hotlist',
                          'Calendar', 'Forecasts'])
        })

        // Roy, 2026-10-14: Events radar hidden for now; the admin's Research queue sits LAST.
        it('hides Events radar and puts the Research queue at the bottom', () => {
            const { container } = render(<FloorLists isAdmin aetherCandidates={{ runs: [{ run_id: 'r', candidates: [{}] }] }} />)
            const labels = [...container.querySelectorAll('.floor-desk__label')].map(l => l.textContent)
            expect(labels).not.toContain('Events radar')
            expect(labels.at(-1)).toBe('Research queue')
        })

        // A request for a desk that is not on screen must not fold the column around nothing.
        it('ignores an initial desk that is hidden', () => {
            const { container } = render(<FloorLists initialDesk="aether" />)
            expect(container.querySelector('.floor-lists').className).not.toMatch(/floor-lists--focused/)
            expect(container.querySelector('.floor-desk--folded')).toBeNull()
            expect(screen.queryByRole('navigation', { name: 'Desks' })).toBeNull()
        })

        // The list has to be able to USE the height it just took: the open desk grows, and it is
        // the only child that does. `flex: 0 1 auto` here would leave a short list stranded at the
        // top with the reclaimed space empty below it.
        it('gives the open desk the leftover column height', () => {
            const css = readFileSync(resolve(__dirname, 'Floor.scss'), 'utf8')
            const open = css.slice(css.indexOf('&--open {'), css.indexOf('&--folded {'))
            expect(open).toMatch(/flex:\s*1 1 auto/)
        })
    })

    // The count is how many items are in the list, on every desk including this one. Readiness is
    // the ROW's business — counting only the pressable rows left the desk silent off-hours, which is
    // exactly when things are queued.
    describe('the queued count', () => {
        const q = (over = {}) => ({ id: 'q1', asset: 'NVDA', ready: true, action: { type: 'exit' }, ...over })

        it('counts every row waiting on the user, ready or not', () => {
            render(<FloorLists queued={[q(), q({ id: 'q2', ready: false }), q({ id: 'q3', ready: false })]} />)
            expect(within(deskBtn('Awaiting orders')).getByText('(3)')).toBeTruthy()
        })

        it('still shows a count off-hours, when NOTHING is ready yet', () => {
            // The regression this guards: two decisions queued for Monday used to render no badge at
            // all, so the desk looked as empty as one with nothing in it.
            render(<FloorLists queued={[q({ ready: false }), q({ id: 'q2', ready: false })]} />)
            expect(within(deskBtn('Awaiting orders')).getByText('(2)')).toBeTruthy()
        })

        it('leaves which rows are pressable to the rows themselves', () => {
            render(<FloorLists queued={[q({ ready: false })]} initialDesk="queued" />)
            expect(screen.getByText('waiting for the open')).toBeTruthy()
        })

        it('shows nothing at all when the queue is empty', () => {
            render(<FloorLists queued={[]} />)
            expect(within(deskBtn('Awaiting orders')).queryByText(/\(/)).toBeNull()
        })

        // The queued row is the ONE row in this column that must not truncate. Every other desk is a
        // doorway — a clipped value there is one click from being read in full — but a queued row has
        // nothing to open, so the sentence is the whole item. It was ellipsising: the only elastic
        // cell on a nowrap line, in a narrow column, next to two buttons that never shrink.
        // jsdom lays nothing out, so guard the rules that make it wrap.
        it('lets a queued row wrap rather than clipping the sentence', () => {
            const css  = readFileSync(resolve(process.cwd(), 'src/cmps/Floor/Floor.scss'), 'utf8')
            const line = css.slice(css.indexOf('.floor-queued {'), css.indexOf('.floor-desk__body .floor-rowhost'))
            const row  = css.slice(css.indexOf('.floor-desk__body .floor-rowhost:has(.floor-queued__line)'))

            expect(row).toMatch(/flex-wrap:\s*wrap/)
            // The sentence keeps a floor, so the tail wraps under it instead of shaving it to a ribbon.
            expect(line).toMatch(/&__line\s*\{[^}]*min-width:\s*14ch/)
            // …and none of the three truncation rules came back.
            expect(line).not.toMatch(/&__line\s*\{[^}]*text-overflow/)
            expect(line).not.toMatch(/&__line\s*\{[^}]*white-space:\s*nowrap/)
        })
    })

    it('counts every trade row on the trading floor', () => {
        render(<FloorLists setups={[setup(), setup2(), setup({ id: 's3' })]} />)
        expect(within(deskBtn('Your trades')).getByText('(3)')).toBeTruthy()
    })

    it('hides the count when a desk is empty rather than showing a zero', () => {
        render(<FloorLists />)
        expect(within(deskBtn('Watchlists')).queryByText('0')).toBeNull()
    })

    it('merges the trade rows into one list, each labelled by kind', () => {
        // The per-row kind label reads as redundant with one kind and is kept deliberately: a
        // second trade kind is the expected case here, not a special one.
        render(<FloorLists setups={[setup2(), setup()]} initialDesk="trade" />)
        expect(screen.getByText('NVDA')).toBeTruthy()
        expect(screen.getByText('SPY')).toBeTruthy()
        expect(screen.getAllByText('setup').length).toBe(2)
    })

    // Urgency order, not ladder order — a row awaiting confirm must sit above a live position.
    it('orders lifecycle groups most-urgent first', () => {
        render(<FloorLists
            setups={[setup({ id: 's1', asset: 'AAA', status: 'waiting' }),
                     setup({ id: 's2', asset: 'BBB', status: 'hit' }),
                     setup({ id: 's3', asset: 'CCC', status: 'long' })]}
            initialDesk="trade"
        />)
        const labels = [...document.querySelectorAll('.floor-grp__label')].map(n => n.textContent)
        expect(labels).toEqual(['Ready', 'In position', 'Not watched'])
    })

    it('shows an empty state per desk instead of a blank body', () => {
        render(<FloorLists initialDesk="trade" />)
        expect(screen.getByText(/no setups/i)).toBeTruthy()
    })

    it('a row click opens that entity’s pop-out', () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        render(<FloorLists setups={[setup2()]} initialDesk="trade" />)
        fireEvent.click(screen.getByText('NVDA').closest('button'))
        expect(open).toHaveBeenCalledTimes(1)
        expect(open.mock.calls[0][0]).toContain('/setup/s2')
    })

    // A portfolio has no record of its own — it IS the set of ideas sharing a portfolioId — so the
    // holdings under it are those records, labelled as holdings rather than as ideas.
    it('expands a portfolio into its holdings', () => {
        const ideas = [
            { id: 'i1', portfolioId: 'p1', portfolioName: 'Core', asset: 'SPY', direction: 'long', status: 'looking', allocationRatio: 0.6 },
            { id: 'i2', portfolioId: 'p1', portfolioName: 'Core', asset: 'TLT', direction: 'long', status: 'waiting', allocationRatio: 0.4 },
        ]
        render(<FloorLists ideas={ideas} />)
        fireEvent.click(deskBtn('Your portfolios'))
        expect(screen.getByText('(2 holdings)')).toBeTruthy()
        expect(screen.queryByText('SPY')).toBeNull()

        fireEvent.click(screen.getByText('Core').closest('button'))
        expect(screen.getByText('SPY')).toBeTruthy()
        expect(screen.getByText('TLT')).toBeTruthy()
    })

    // allocationRatio is stored 0–1; showing it raw would read as "0.6%".
    it('renders a holding weight as a percentage', () => {
        const ideas = [{ id: 'i1', portfolioId: 'p1', portfolioName: 'Core', asset: 'SPY', direction: 'long', status: 'looking', allocationRatio: 0.6 }]
        render(<FloorLists ideas={ideas} />)
        fireEvent.click(deskBtn('Your portfolios'))
        fireEvent.click(screen.getByText('Core').closest('button'))
        expect(screen.getByText('60%')).toBeTruthy()
    })

    // `long` as a status means "in a live position", but printed next to the direction arrow it
    // reads as the arrow repeated in words.
    it('shows an in-position holding as a stage, not as a second copy of the direction', () => {
        const ideas = [{ id: 'i1', portfolioId: 'p1', portfolioName: 'Core', asset: 'SPY', direction: 'long', status: 'long', allocationRatio: 1 }]
        render(<FloorLists ideas={ideas} />)
        fireEvent.click(deskBtn('Your portfolios'))
        fireEvent.click(screen.getByText('Core').closest('button'))
        expect(screen.getByText('in position')).toBeTruthy()
        expect(screen.queryByText('long')).toBeNull()
    })

    it('a holding click opens that idea’s pop-out', () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        const ideas = [{ id: 'i1', portfolioId: 'p1', portfolioName: 'Core', asset: 'SPY', direction: 'long', status: 'looking', allocationRatio: 1 }]
        render(<FloorLists ideas={ideas} />)
        fireEvent.click(deskBtn('Your portfolios'))
        fireEvent.click(screen.getByText('Core').closest('button'))
        fireEvent.click(screen.getByText('SPY').closest('button'))
        expect(open.mock.calls[0][0]).toContain('/idea/i1')
    })

    // FORECASTS is a panel desk (2026-10-14): its header opens the heat map over the chat, and it
    // replaced "Analyst companies" — a covered name is reached through its industry (ForecastPanel.test).
    it('the Forecasts header opens the heat map in the panel, not a list in the column', async () => {
        const { container } = render(<FloorLists />)
        const head = deskBtn('Forecasts')
        expect(head.getAttribute('aria-haspopup')).toBe('dialog')
        fireEvent.click(head)
        await act(async () => { await Promise.resolve() })
        expect(screen.getByRole('dialog', { name: 'Industries' })).toBeTruthy()
        expect(container.querySelector('.floor-desk--open')).toBeNull()
        expect(head.getAttribute('aria-expanded')).toBe('true')
    })

    // Pythia's board (track record, week, themes, structure, Assess now) is one click from the map, and opens in the window
    // too (2026-10-22): its rows open panels of their own, which keep the board under them (detailPanel.store's step back).
    it('the map’s Board button opens Pythia’s board in the window, and the board leads back to the map', async () => {
        render(<FloorLists assessments={{ assessments: [], record: null }} />)
        expect(screen.queryByRole('button', { name: /Forecast board/ })).toBeNull()
        fireEvent.click(deskBtn('Forecasts'))
        await act(async () => { await Promise.resolve() })
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Board' }))
        expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Forecast board')
        expect(deskBtn('Forecast board').getAttribute('aria-expanded')).toBe('true')
        expect(screen.getByRole('tab', { name: 'Themes' })).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Open the heat map' }))
        await act(async () => { await Promise.resolve() })
        expect(screen.getByRole('dialog', { name: 'Industries' })).toBeTruthy()
        // The board's window closed with the switch, and its header went with it.
        expect(screen.queryByRole('button', { name: /^Forecast board/ })).toBeNull()
    })

    it('has no "Analyst companies" desk any more', () => {
        render(<FloorLists isAdmin coverage={[{ symbol: 'AAPL', status: 'active' }]} />)
        expect(screen.queryByRole('button', { name: /Analyst companies/ })).toBeNull()
    })

    it('an outside ask for a covered name opens the map on that company', async () => {
        const coverage = [{ id: 'cv1', symbol: 'AAPL', status: 'active', thesis: 'Services mix re-rates.' }]
        render(<FloorLists coverage={coverage} deskRequest={{ key: 'forecasts', symbol: 'AAPL' }} />)
        await act(async () => { await Promise.resolve() })
        const panel = screen.getByRole('dialog')
        expect(panel.querySelector('.detail-panel__title').textContent).toBe('AAPL')
        expect(within(panel).getByText('Services mix re-rates.')).toBeTruthy()
    })

    // A COLLAPSED row is one line. jsdom lays nothing out, so this guards the rules that make it
    // one: the cells are multi-word ("strong buy", "thesis broken", "412 / 12M"), and a flex item
    // wraps at those spaces unless told not to — which the fixed row height then clips.
    it('pins a collapsed row to a single line', () => {
        const css = readFileSync(resolve(process.cwd(), 'src/cmps/Floor/Floor.scss'), 'utf8')
        const row = css.slice(css.indexOf('.floor-row {'), css.indexOf('.floor-rowhost'))
        // The ROW's own declarations, before the first nested cell — two cells carry a nowrap of
        // their own, so an unscoped match here would pass with the row's rule deleted.
        const base = row.slice(0, row.indexOf('\n    &'))

        expect(base).toMatch(/white-space:\s*nowrap/)
        // The fixed cells hold their width…
        expect(row).toMatch(/&__rating\s*\{[^}]*flex-shrink:\s*0/)
        expect(row).toMatch(/&__status\s*\{[^}]*flex-shrink:\s*0/)
        // …so the one elastic cell is what gives, and it truncates rather than wrapping.
        expect(row).toMatch(/\.price-target\s*\{[^}]*min-width:\s*0/)
        expect(row).toMatch(/\.price-target\s*\{[^}]*text-overflow:\s*ellipsis/)
    })

    // Same accordion as the coverage rows above, and same history — 3bbfa59.
    it('expands a scan into its candidates, one scan at a time', () => {
        const scans = [
            { id: 'x', thesis: 'Semis', direction: 'long', candidates: [{ ticker: 'NVDA', score: { total: 82 } }] },
            { id: 'y', thesis: 'Banks', direction: 'long', candidates: [{ ticker: 'JPM',  score: { total: 61 } }] },
        ]
        render(<FloorLists scans={scans} />)
        fireEvent.click(deskBtn('Watchlists'))
        expect(screen.queryByText('NVDA')).toBeNull()

        fireEvent.click(screen.getByText('Semis').closest('button'))
        expect(screen.getByText('NVDA')).toBeTruthy()

        fireEvent.click(screen.getByText('Banks').closest('button'))
        expect(screen.getByText('JPM')).toBeTruthy()
        expect(screen.queryByText('NVDA')).toBeNull()
    })

    // A count is part of the name it counts, so it is parenthesised and adjacent — not a bare
    // number parked in a column of its own on the right edge.
    it('prints a scan’s candidate count in parentheses immediately after the thesis', () => {
        const scans = [{ id: 'x', thesis: 'Semis', direction: 'long', candidates: [{ ticker: 'NVDA' }, { ticker: 'AMD' }] }]
        render(<FloorLists scans={scans} />)
        fireEvent.click(deskBtn('Watchlists'))

        const name = screen.getByText('Semis')
        expect(name.nextElementSibling.textContent).toBe('(2)')
    })

    // ── The calendar ──────────────────────────────────────────────────────────
    // Earnings / Fed / IPO were three week-long desks; since 2026-10-14 they are ONE Calendar desk
    // that opens a month grid in the detail panel (CalendarPanel has its own tests).
    describe('calendar desk', () => {
        it('is one Calendar desk — the three dated feeds are no longer desks of their own', () => {
            render(<FloorLists />)
            expect(deskBtn('Calendar')).toBeTruthy()
            for (const label of ['Earnings', 'Fed', 'IPO']) {
                expect(screen.queryByRole('button', { name: new RegExp(`^${label}`) })).toBeNull()
            }
        })

        it('opens the calendar window from its header, and closes it from the same header', () => {
            render(<FloorLists setups={[setup2()]} initialDesk="trade" />)
            const head = deskBtn('Calendar')
            expect(head.getAttribute('aria-haspopup')).toBe('dialog')
            fireEvent.click(head)
            expect(screen.getByRole('dialog', { name: /20\d\d/ })).toBeTruthy()
            expect(head.getAttribute('aria-expanded')).toBe('true')
            expect(deskBtn('Your trades').getAttribute('aria-expanded')).toBe('false')
            fireEvent.click(head)
            expect(screen.queryByRole('dialog')).toBeNull()
        })

        it('opens its window when asked for as the initial one', () => {
            render(<FloorLists initialDesk="calendar" />)
            expect(screen.getByRole('dialog', { name: /20\d\d/ })).toBeTruthy()
        })

        // The house's industry views are a broadcast (2026-10-05): the board is for everyone, and only
        // authoring them — Pythia's desk — is admin-only.
        it('shows the Forecasts board to everyone, trader and admin alike', () => {
            const { unmount } = render(<FloorLists />)
            expect(deskBtn('Forecasts')).toBeTruthy()
            unmount()
            render(<FloorLists isAdmin />)
            expect(deskBtn('Forecasts')).toBeTruthy()
        })

        // One flat run of desks — no "Admin" / "Calendar" captions (Roy, 2026-10-14).
        it('puts no group captions in the column', () => {
            const { container } = render(<FloorLists isAdmin />)
            expect(container.querySelector('.floor-lists__grp')).toBeNull()
            expect(screen.queryByText('Admin')).toBeNull()
        })

        // The board carries its own answered count; a desk count beside it would read as a second one.
        it('puts no count on Forecasts', () => {
            render(<FloorLists isAdmin industries={[]} />)
            expect(within(deskBtn('Forecasts')).queryByText(/\(/)).toBeNull()
            expect(within(deskBtn('Calendar')).queryByText(/\(/)).toBeNull()
        })
    })

    // Which box scrolls is a CSS question, so jsdom can't measure it — but it is exactly the kind
    // of thing that regresses back to "put overflow on the container" the next time something
    // overflows. Guard the rules themselves, the way the row-actions reveal is guarded below.
    it('scrolls the open desk’s list, and the column only when every desk is shut', () => {
        // Read from disk: vitest stubs stylesheet imports, so `?raw` would hand back an empty string.
        const css    = readFileSync(resolve(process.cwd(), 'src/cmps/Floor/Floor.scss'), 'utf8')
        const column = css.slice(css.indexOf('.floor-lists {'), css.indexOf('.floor-desk {'))
        const desk   = css.slice(css.indexOf('.floor-desk {'))

        // Never sideways: a wide row must ellipsis, not push the column out of the viewport.
        expect(column).toMatch(/overflow-x:\s*hidden/)

        // The column's Y axis USED to be `hidden` outright, and this asserted that — a scrolling
        // column carries the "Lists" heading and the closed desk headers away with the rows, which
        // was the original complaint. It is `auto` now (3bbfa59) and that is deliberate: the desk
        // list has grown to eleven, so a fully-collapsed column of pure header buttons can be
        // taller than the viewport and would otherwise have unreachable desks at the bottom.
        //
        // The original complaint stays fixed by a different mechanism, which is the part worth
        // asserting: when a desk IS open every sibling collapses to max-height:0, so the column
        // content fits inside 100% height and the scrollbar never appears in that state.
        expect(column).toMatch(/overflow-y:\s*auto/)
        expect(desk).toMatch(/&--folded\s*\{[^}]*max-height:\s*0/)

        // The open desk is the only one allowed to shrink, so it absorbs every bit of overflow…
        // (it grows too, now that it takes the column — see the takeover cases above).
        expect(desk).toMatch(/&--open\s*\{[^}]*flex:\s*1 1 auto/)
        // …and its list is what actually scrolls. No height cap: the shrink already sized it.
        expect(desk).toMatch(/&__body\s*\{[^}]*overflow-y:\s*auto/)
        expect(desk).not.toMatch(/max-height:\s*60vh/)
    })
})

// ── Row actions ───────────────────────────────────────────────────────────────
// Edit/delete on the row are a second SURFACE onto the same entities, not a second set of rules
// about them: the same handlers, the same live-position locks, the same "a candidate isn't a
// record" line the rest of the app draws.

describe('FloorLists row actions', () => {
    it('offers edit and delete on a trading-floor row, wired to that entity', () => {
        const onEditSetup = vi.fn(), onDeleteSetup = vi.fn()
        render(<FloorLists setups={[setup()]} onEditSetup={onEditSetup} onDeleteSetup={onDeleteSetup} initialDesk="trade" />)

        fireEvent.click(screen.getByTitle('Edit setup in Mentor chat'))
        fireEvent.click(screen.getByTitle('Delete setup'))
        expect(onEditSetup.mock.calls[0][0].id).toBe('s1')    // the setup itself — it seeds the chat
        // NB the setup contract hands the whole ENTITY to delete, where the call contract handed
        // the bare id. Not a slip: SetupCard does the same, and the dialog it opens needs the doc.
        expect(onDeleteSetup.mock.calls[0][0].id).toBe('s1')
    })

    // The row opens a pop-out; the buttons on it must not.
    it('does not open the pop-out when an action is clicked', () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        render(<FloorLists setups={[setup()]} onDeleteSetup={vi.fn()} initialDesk="trade" />)

        fireEvent.click(screen.getByTitle('Delete setup'))
        expect(open).not.toHaveBeenCalled()
    })

    // Past entry the plan can't be re-run in the chat — changes go through management cards — and
    // the bin is locked because the server refuses it (409 in_position) for every kind.
    it('drops the pencil and locks the bin once a trade is past entry', () => {
        render(<FloorLists setups={[setup({ status: 'long' })]} onEditSetup={vi.fn()} onDeleteSetup={vi.fn()} initialDesk="trade" />)
        expect(screen.queryByTitle('Edit setup in Mentor chat')).toBeNull()
        expect(screen.getByTitle(/close it at the broker first/i).disabled).toBe(true)
    })

    it('locks a live setup’s bin too', () => {
        render(<FloorLists setups={[setup({ status: 'short' })]} onDeleteSetup={vi.fn()} initialDesk="trade" />)
        expect(screen.getByTitle(/close it at the broker first/i).disabled).toBe(true)
    })

    it('offers the setup pencil while it is still pre-entry', () => {
        const onEditSetup = vi.fn()
        render(<FloorLists setups={[setup()]} onEditSetup={onEditSetup} initialDesk="trade" />)
        fireEvent.click(screen.getByTitle('Edit setup in Mentor chat'))
        expect(onEditSetup.mock.calls[0][0].id).toBe('s1')
    })

    it('renders no actions at all when no handlers are given', () => {
        render(<FloorLists setups={[setup2()]} initialDesk="trade" />)
        expect(document.querySelector('.floor-rowhost__actions')).toBeNull()
    })

    // The overlay's reveal lives in CSS, so jsdom can't exercise it — but the rule regressed once
    // already: :focus-within kept the buttons pinned to a row after a MOUSE click opened its thesis,
    // and only unmounting the desk released them. Guard the selector itself.
    it('reveals the overlay on keyboard focus, never on a lingering mouse focus', () => {
        // Read from disk: vitest stubs stylesheet imports, so `?raw` would hand back an empty string.
        const css = readFileSync(resolve(process.cwd(), 'src/cmps/Floor/Floor.scss'), 'utf8')
        const reveal = css.slice(css.indexOf('.floor-rowhost'))
        expect(reveal).toMatch(/:has\(:focus-visible\)\s+&__actions/)
        expect(reveal).not.toMatch(/&:focus-within\s+&__actions/)
    })

    // One live leg locks the WHOLE book: deleting it deletes every leg plus the chat.
    it('locks a portfolio’s bin when any holding is live, but not the healthy holdings’ own bins', () => {
        const ideas = [
            { id: 'i1', portfolioId: 'p1', portfolioName: 'Core', asset: 'SPY', direction: 'long', status: 'long' },
            { id: 'i2', portfolioId: 'p1', portfolioName: 'Core', asset: 'TLT', direction: 'long', status: 'waiting' },
        ]
        render(<FloorLists ideas={ideas} onDeletePortfolio={vi.fn()} onDeleteIdea={vi.fn()} />)
        fireEvent.click(deskBtn('Your portfolios'))
        expect(screen.getByTitle(/close it first to delete this portfolio/i).disabled).toBe(true)

        fireEvent.click(screen.getByText('Core').closest('button'))
        const bins = screen.getAllByTitle('Delete holding')
        expect(bins).toHaveLength(1)              // the live leg's bin is locked, not titled 'Delete holding'
        expect(bins[0].disabled).toBe(false)
    })

    // A built book sits at 'waiting' doing nothing, and this list used to offer no way to say go —
    // pencil and bin were the whole vocabulary, so the only route to activation was the other list.
    describe('activating a book', () => {
        const waiting = [
            { id: 'i1', portfolioId: 'p1', portfolioName: 'Core', asset: 'SPY', direction: 'long', status: 'waiting' },
            { id: 'i2', portfolioId: 'p1', portfolioName: 'Core', asset: 'TLT', direction: 'long', status: 'waiting' },
        ]

        function openBook(props) {
            render(<FloorLists ideas={waiting} {...props} />)
            fireEvent.click(deskBtn('Your portfolios'))
        }

        it('says on the row that the book is waiting, so it cannot sit un-activated unnoticed', () => {
            openBook({ onActivatePortfolio: vi.fn() })
            expect(screen.getByText('waiting')).toBeTruthy()
        })

        it('a book with every leg still waiting offers activation', () => {
            openBook({ onActivatePortfolio: vi.fn() })
            expect(screen.getByTitle(/Activate this portfolio/i)).toBeTruthy()
        })

        // Half-working is managed leg by leg — re-firing it as a book would re-enter the parts
        // already working.
        it('a book already part-working does not', () => {
            const mixed = [waiting[0], { ...waiting[1], status: 'long' }]
            render(<FloorLists ideas={mixed} onActivatePortfolio={vi.fn()} />)
            fireEvent.click(deskBtn('Your portfolios'))
            expect(screen.queryByTitle(/Activate this portfolio/i)).toBeNull()
            expect(screen.queryByText('waiting')).toBeNull()
        })

        // The gate, not the act: activating fires every leg at market at once, so the press opens
        // the same pre-activation dialog the ideas table puts in front of it.
        it('pressing it asks before firing anything', () => {
            const onActivate = vi.fn()
            openBook({ onActivatePortfolio: onActivate })
            fireEvent.click(screen.getByTitle(/Activate this portfolio/i))

            expect(onActivate).not.toHaveBeenCalled()
            expect(screen.getByText(/last gate before real exposure/i)).toBeTruthy()

            fireEvent.click(screen.getByText('Activate now'))
            expect(onActivate).toHaveBeenCalledWith('p1')
        })

        it('"Review first" opens the book in review instead of firing it', () => {
            const onActivate = vi.fn(), onEdit = vi.fn()
            openBook({ onActivatePortfolio: onActivate, onEditPortfolio: onEdit })
            fireEvent.click(screen.getByTitle(/Activate this portfolio/i))
            fireEvent.click(screen.getByText('Review first'))

            expect(onActivate).not.toHaveBeenCalled()
            expect(onEdit).toHaveBeenCalledWith('p1', { reviewMode: true })
        })

        // A surface that cannot activate must not grow a button that does nothing.
        it('no handler, no button', () => {
            openBook({})
            expect(screen.queryByTitle(/Activate this portfolio/i)).toBeNull()
        })
    })

    // A holding is edited by reopening the BOOK — its weight only means something against the
    // other legs — and the per-holding chat that would have edited one alone is the archived Idea
    // agent. So the pencil lives on the book row and nowhere below it.
    it('gives the portfolio row a pencil and the holdings none', () => {
        const ideas = [{ id: 'i1', portfolioId: 'p1', portfolioName: 'Core', asset: 'SPY', direction: 'long', status: 'waiting' }]
        render(<FloorLists ideas={ideas} onEditPortfolio={vi.fn()} onDeleteIdea={vi.fn()} />)
        fireEvent.click(deskBtn('Your portfolios'))
        fireEvent.click(screen.getByText('Core').closest('button'))

        expect(screen.getAllByTitle('Edit portfolio in chat')).toHaveLength(1)
        expect(screen.getByTitle('Delete holding')).toBeTruthy()
        expect(screen.queryByTitle(/Edit holding/)).toBeNull()
    })

    // Reopening a book in positions is a REVIEW, not a re-plan — re-planning sends every holding
    // back to 'waiting' and would take an open position off monitoring. handleEditPortfolio makes
    // that call from the book's state, so this pencil passes no mode; what it must not do is promise
    // an edit. It said "Edit portfolio in chat" on a live book for as long as the Floor has existed.
    it('says a live book opens a REVIEW, since that is what pressing it does', () => {
        const ideas = [
            { id: 'i1', portfolioId: 'p1', portfolioName: 'Core', asset: 'SPY', direction: 'long', status: 'long' },
            { id: 'i2', portfolioId: 'p1', portfolioName: 'Core', asset: 'QQQ', direction: 'long', status: 'waiting' },
        ]
        const onEditPortfolio = vi.fn()
        render(<FloorLists ideas={ideas} onEditPortfolio={onEditPortfolio} onDeleteIdea={vi.fn()} />)
        fireEvent.click(deskBtn('Your portfolios'))
        fireEvent.click(screen.getByText('Core').closest('button'))

        expect(screen.queryByTitle('Edit portfolio in chat')).toBeNull()
        fireEvent.click(screen.getByTitle('In position — opens a review in chat'))
        // No mode argument: the book decides, and a second copy of that judgment here could disagree.
        expect(onEditPortfolio).toHaveBeenCalledWith('p1')
    })

    // A candidate is a line in a scan's result, not a record — there is nothing to delete.
    it('puts the scan’s actions on the list, never on a candidate', () => {
        const scans = [{ id: 'x', thesis: 'Semis', direction: 'long', candidates: [{ ticker: 'NVDA' }] }]
        const onDeleteScan = vi.fn()
        render(<FloorLists scans={scans} onEditScan={vi.fn()} onDeleteScan={onDeleteScan} />)
        fireEvent.click(deskBtn('Watchlists'))
        fireEvent.click(screen.getByText('Semis').closest('button'))

        expect(screen.getByText('NVDA').closest('.floor-rowhost')).toBeNull()
        expect(screen.getAllByTitle('Delete list')).toHaveLength(1)
        fireEvent.click(screen.getByTitle('Delete list'))
        expect(onDeleteScan).toHaveBeenCalledWith('x')
    })
})

describe('every ticker in the column opens its chart', () => {
    // THE POINT IS THAT NO LIST IS MISSED. "In all lists, clicking the ticker gives the
    // chart" is a promise about the whole column, and the way it breaks is one list being
    // forgotten — which is exactly how it was before, where the Aether list had a chart in
    // the workspace tab and none here.
    //
    // Read off the source rather than rendered: mounting all six desks with enough fixture
    // data to reach every row is a far larger test that would still only prove the ones it
    // happened to populate.

    const SRC = readFileSync(resolve(__dirname, 'FloorLists.jsx'), 'utf8')

    /** The source between a marker and the next closing character after it. */
    const between = (open, close) => {
        const i = SRC.indexOf(open)
        return i < 0 ? '' : SRC.slice(i, SRC.indexOf(close, i) + 1)
    }

    it('no raw ticker span is left behind', () => {
        // A plain <span className="floor-row__sym">{x.ticker}</span> is the shape that was
        // there before. The two `--wide` cells are not tickers — they carry a portfolio
        // name and a scan thesis — and must stay exactly as they are.
        expect(SRC).not.toContain('<span className="floor-row__sym">')
    })

    it('every symbol cell is the shared one, carrying the handler', () => {
        const cells = SRC.match(/<SymbolCell[^>]*?\/>/gs) ?? []
        expect(cells.length).toBeGreaterThanOrEqual(4)
        for (const cell of cells) {
            expect(cell).toContain('onSymbolClick={onSymbolClick}')
            expect(cell).toContain('className="floor-row__sym"')
        }
    })

    it('the handler reaches every list that renders one', () => {
        // A cell wired to a prop its component never received renders a dead ticker, and
        // nothing at runtime says so.
        for (const list of ['TradeRows', 'PortfolioRows', 'ScanRows',
                            'ResearchQueueRows']) {
            // Plain string slicing rather than a built regex: expressing `function Foo({`
            // as a pattern needs escaping that is its own source of bugs, and "the text
            // between here and the next bracket" needs none of it.
            expect(between(`function ${list}(`, ')'), `${list} signature`)
                .toContain('onSymbolClick')
            // No line ending in the marker: this file is CRLF on Windows and LF in CI, and
            // a `\n` in the search string silently matches neither there.
            expect(between(`<${list}`, '>'), `${list} usage`)
                .toContain('onSymbolClick={onSymbolClick}')
        }
    })

    it('the queued desk is deliberately left out', () => {
        // It renders an action SENTENCE, not a ticker cell — there is nothing to click.
        expect(between('function QueuedRow(', ')')).not.toContain('onSymbolClick')
    })
})

// Argus screens a sector, not the book: a covered name lands in the queue like any other, and the
// row is where the admin should learn that BEFORE opening Prometheus on it.
describe('research queue · covered names', () => {
    const rq = (symbol, over = {}) => ({ id: `rq_${symbol}`, symbol, source: 'argus', status: 'queued', ...over })
    const noop = () => {}
    const renderQueue = (researchQueue, coverage) => render(
        <FloorLists
            isAdmin initialDesk="research_queue"
            researchQueue={researchQueue} coverage={coverage}
            onStartResearch={noop} onMarkResearchDone={noop} onRejectResearch={noop}
        />,
    )

    it('badges a queued name the house already covers, and only that one', () => {
        renderQueue([rq('JNJ'), rq('UNH')], [{ id: 'cv1', symbol: 'JNJ', status: 'active' }])
        const jnj = screen.getByText('JNJ').closest('.floor-rowhost')
        const unh = screen.getByText('UNH').closest('.floor-rowhost')
        expect(within(jnj).getByText('covered')).toBeTruthy()
        expect(within(unh).queryByText('covered')).toBeNull()
    })

    it('matches any coverage status and either ticker case — retired coverage still forces an update', () => {
        renderQueue([rq('MRK')], [{ id: 'cv2', symbol: 'mrk', status: 'retired' }])
        expect(screen.getByText('covered')).toBeTruthy()
    })

    it('says what Start will do on a covered name', () => {
        renderQueue([rq('VRTX')], [{ id: 'cv3', symbol: 'VRTX', status: 'active' }])
        expect(screen.getByRole('button', { name: 'Start' }).title).toMatch(/update/i)
    })

    // Start hands the whole item up, because the opener needs the symbol and the mandate context,
    // not just an id to flip. The ROW does not: starting a four-minute research stream is a
    // decision, and it must not hang on a mis-aimed click on a list you are scanning.
    it('Start hands the item to the opener; the row itself does nothing', () => {
        const onStart = vi.fn()
        const item = rq('UNH', { context: { sector: 'Healthcare', active_bp: 200 } })
        render(<FloorLists isAdmin initialDesk="research_queue" researchQueue={[item]}
            onStartResearch={onStart} onMarkResearchDone={noop} onRejectResearch={noop} />)
        fireEvent.click(screen.getByText('UNH').closest('.floor-row'))
        expect(onStart).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole('button', { name: 'Start' }))
        expect(onStart).toHaveBeenCalledTimes(1)
        expect(onStart.mock.calls[0][0]).toBe(item)
    })

    // The run strip: Start all when names wait and nothing is going; progress + Stop while the
    // server works the queue; the tally afterwards.
    describe('the run strip', () => {
        const renderRun = (run, items, onStart = noop, onStop = noop) => render(
            <FloorLists isAdmin initialDesk="research_queue" researchQueue={items} coverage={[]}
                onStartResearch={noop} onMarkResearchDone={noop} onRejectResearch={noop}
                researchRun={run} onStartResearchRun={onStart} onStopResearchRun={onStop} />,
        )

        it('offers Start all over a queue with names, and hands the click up', () => {
            const onStart = vi.fn()
            renderRun(null, [rq('A'), rq('B')], onStart)
            fireEvent.click(screen.getByRole('button', { name: 'Start all' }))
            expect(onStart).toHaveBeenCalledTimes(1)
        })

        it('offers nothing over an empty queue with no run behind it', () => {
            renderRun(null, [])
            expect(screen.queryByRole('button', { name: 'Start all' })).toBeNull()
            expect(screen.getByText(/no names queued/i)).toBeTruthy()
        })

        it('shows where a running run is, and Stop instead of Start all', () => {
            const onStop = vi.fn()
            renderRun({ status: 'running', current: 'LLY', position: 3, total: 26, covered: 2, skipped: 1, passed: 0, failed: 0 }, [rq('LLY', { status: 'in_research' }), rq('B')], noop, onStop)
            expect(screen.getByText('LLY', { selector: 'strong' })).toBeTruthy()
            expect(screen.getByText(/3\/26/)).toBeTruthy()
            expect(screen.getByText(/2 covered · 1 skipped/)).toBeTruthy()
            expect(screen.queryByRole('button', { name: 'Start all' })).toBeNull()
            fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
            expect(onStop).toHaveBeenCalledTimes(1)
        })

        it('a run that failed on the account says why', () => {
            render(<FloorLists isAdmin initialDesk="research_queue" researchQueue={[rq('AZN', { status: 'in_research' })]} coverage={[]}
                onStartResearch={noop} onMarkResearchDone={noop} onRejectResearch={noop}
                researchRun={{ status: 'failed', error: 'Your credit balance is too low to access the Anthropic API.', current: null, position: 6, total: 29, covered: 2, skipped: 2, passed: 1, failed: 1 }}
                onStartResearchRun={noop} onStopResearchRun={noop} onRequeueStalledResearch={noop} />)
            expect(screen.getByText(/credit balance is too low/)).toBeTruthy()
            expect(screen.queryByRole('button', { name: 'Start all' })).toBeNull()   // nothing queued yet
        })

        // The count is the QUEUE's — rows in progress — so the button is there after a server
        // restart wiped the run, which is exactly when it is needed.
        it('offers Requeue for every name in progress, run or no run', () => {
            const onRequeue = vi.fn()
            render(<FloorLists isAdmin initialDesk="research_queue" coverage={[]}
                researchQueue={[rq('AZN', { status: 'in_research' }), rq('TMO', { status: 'in_research' }), rq('B')]}
                onStartResearch={noop} onMarkResearchDone={noop} onRejectResearch={noop}
                researchRun={null} onStartResearchRun={noop} onStopResearchRun={noop} onRequeueStalledResearch={onRequeue} />)
            fireEvent.click(screen.getByRole('button', { name: 'Requeue 2' }))
            expect(onRequeue).toHaveBeenCalledTimes(1)
            expect(screen.getByRole('button', { name: 'Start all' })).toBeTruthy()
        })

        it('keeps the tally of a finished run, and offers Start all again if names remain', () => {
            renderRun({ status: 'done', current: null, position: 26, total: 26, covered: 22, skipped: 3, passed: 1, failed: 0 }, [rq('C')])
            expect(screen.getByText(/run done — 22 covered · 3 skipped · 1 passed/i)).toBeTruthy()
            expect(screen.getByRole('button', { name: 'Start all' })).toBeTruthy()
        })
    })

    it('a claimed name offers Open (re-open without a second claim) beside Done', () => {
        const onStart = vi.fn()
        const item = rq('LLY', { status: 'in_research' })
        render(<FloorLists isAdmin initialDesk="research_queue" researchQueue={[item]}
            onStartResearch={onStart} onMarkResearchDone={noop} onRejectResearch={noop} />)
        expect(screen.queryByRole('button', { name: 'Start' })).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Open' }))
        expect(onStart).toHaveBeenCalledWith(item)
        expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy()
    })

    it('reads as the other desks — a .floor-row with the sector Argus screened', () => {
        renderQueue([rq('JPM', { context: { sector: 'Financial Services' } })], [])
        const row = screen.getByText('JPM').closest('.floor-row')
        expect(row).toBeTruthy()
        expect(within(row).getByText(/Argus · Financial Services/)).toBeTruthy()
    })
})

// Every list can be sorted from one bar at the top of the open desk. The options are the desk's
// own (floor.sort.js, tested there); what is pinned here is the bar itself — when it shows, that it
// reorders the rows on screen, and that the choice survives a reload.
describe('FloorLists — sorting', () => {
    afterEach(() => { try { localStorage.clear() } catch { /* no storage */ } })

    // Watchlists carry these since the coverage desk went (2026-10-14); a scan's row shows its thesis.
    const scans = [
        { id: 'c1', thesis: 'MSFT', candidates: [{}] },
        { id: 'c2', thesis: 'AAPL', candidates: [{}, {}, {}] },
        { id: 'c3', thesis: 'NVDA', candidates: [{}, {}] },
    ]
    const rowSyms = () => [...document.querySelectorAll('.floor-panel .floor-row')]
        .map(r => r.querySelector('.floor-row__sym')?.textContent)
    const sortSelect = () => screen.getByRole('combobox')
    const dirBtn     = () => screen.getByRole('button', { name: /ascending|descending/i })

    it('shows no sort bar over a single row', () => {
        render(<FloorLists scans={[scans[0]]} initialDesk="scans" />)
        expect(screen.queryByRole('combobox')).toBeNull()
    })

    it('opens on the default order, with the arrow disabled', () => {
        render(<FloorLists scans={scans} initialDesk="scans" />)
        expect(sortSelect().value).toBe('default')
        expect(dirBtn().disabled).toBe(true)
        expect(rowSyms()).toEqual(['MSFT', 'AAPL', 'NVDA'])
    })

    it('reorders the rows by the picked field, and the arrow flips it', () => {
        render(<FloorLists scans={scans} initialDesk="scans" />)
        fireEvent.change(sortSelect(), { target: { value: 'thesis' } })
        expect(rowSyms()).toEqual(['AAPL', 'MSFT', 'NVDA'])
        fireEvent.click(dirBtn())
        expect(rowSyms()).toEqual(['NVDA', 'MSFT', 'AAPL'])
        // Candidates starts high-to-low, whatever the previous option's direction was.
        fireEvent.change(sortSelect(), { target: { value: 'candidates' } })
        expect(rowSyms()).toEqual(['AAPL', 'NVDA', 'MSFT'])
    })

    it('back to Default restores the server order', () => {
        render(<FloorLists scans={scans} initialDesk="scans" />)
        fireEvent.change(sortSelect(), { target: { value: 'thesis' } })
        fireEvent.change(sortSelect(), { target: { value: 'default' } })
        expect(rowSyms()).toEqual(['MSFT', 'AAPL', 'NVDA'])
    })

    it('remembers the choice per desk across a remount', () => {
        const { unmount } = render(<FloorLists scans={scans} initialDesk="scans" />)
        fireEvent.change(sortSelect(), { target: { value: 'thesis' } })
        unmount()
        render(<FloorLists scans={scans} initialDesk="scans" />)
        expect(sortSelect().value).toBe('thesis')
        expect(rowSyms()).toEqual(['AAPL', 'MSFT', 'NVDA'])
    })

    // Books are built inside the desk from their ideas, so the sort has to happen there too.
    it('sorts portfolio books', () => {
        const ideas = [
            { id: 'i1', portfolioId: 'p1', portfolioName: 'Zeta',  asset: 'SPY', status: 'waiting', savedAt: 2 },
            { id: 'i2', portfolioId: 'p2', portfolioName: 'Alpha', asset: 'TLT', status: 'waiting', savedAt: 1 },
        ]
        render(<FloorLists ideas={ideas} initialDesk="portfolio" />)
        expect(rowSyms()).toEqual(['Zeta', 'Alpha'])
        fireEvent.change(sortSelect(), { target: { value: 'name' } })
        expect(rowSyms()).toEqual(['Alpha', 'Zeta'])
    })
})
