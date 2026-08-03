import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FloorLists } from './FloorLists.jsx'

// The Floor's right column is an ACCORDION — one desk open at a time. That rule is the whole
// reason the column stays readable at four desks, and it is the kind of thing that silently
// regresses into "all open" the first time someone adds a fifth.

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const call  = (over = {}) => ({ id: 'c1', asset: 'NVDA', direction: 'long',  status: 'looking', ...over })
const setup = (over = {}) => ({ id: 's1', asset: 'SPY',  direction: 'short', status: 'waiting', ...over })

const deskBtn = name => screen.getByRole('button', { name: new RegExp(name, 'i') })

describe('FloorLists', () => {
    it('renders all four desks', () => {
        render(<FloorLists />)
        for (const label of ['Trading floor', 'Portfolio floor', 'Scans', 'Coverage']) {
            expect(deskBtn(label)).toBeTruthy()
        }
    })

    // A refresh must not pick a desk for the reader: the column lands as a table of contents.
    it('opens no desk by default', () => {
        render(<FloorLists calls={[call()]} coverage={[{ symbol: 'AAPL', status: 'active' }]} />)
        for (const label of ['Trading floor', 'Portfolio floor', 'Scans', 'Coverage']) {
            expect(deskBtn(label).getAttribute('aria-expanded')).toBe('false')
        }
    })

    it('opening one desk closes the one that was open', () => {
        render(<FloorLists calls={[call()]} coverage={[{ symbol: 'AAPL', status: 'active' }]} initialDesk="trade" />)
        fireEvent.click(deskBtn('Coverage'))
        expect(deskBtn('Coverage').getAttribute('aria-expanded')).toBe('true')
        expect(deskBtn('Trading floor').getAttribute('aria-expanded')).toBe('false')
    })

    // All-closed is a legitimate state: the column becomes a table of contents.
    it('clicking the open desk closes it, leaving all four collapsed', () => {
        render(<FloorLists calls={[call()]} initialDesk="trade" />)
        fireEvent.click(deskBtn('Trading floor'))
        for (const label of ['Trading floor', 'Portfolio floor', 'Scans', 'Coverage']) {
            expect(deskBtn(label).getAttribute('aria-expanded')).toBe('false')
        }
    })

    it('counts calls and setups together on the trading floor', () => {
        render(<FloorLists calls={[call(), call({ id: 'c2' })]} setups={[setup()]} />)
        expect(within(deskBtn('Trading floor')).getByText('(3)')).toBeTruthy()
    })

    it('hides the count when a desk is empty rather than showing a zero', () => {
        render(<FloorLists />)
        expect(within(deskBtn('Coverage')).queryByText('0')).toBeNull()
    })

    it('merges calls and setups into one list, each labelled by kind', () => {
        render(<FloorLists calls={[call()]} setups={[setup()]} initialDesk="trade" />)
        expect(screen.getByText('NVDA')).toBeTruthy()
        expect(screen.getByText('SPY')).toBeTruthy()
        expect(screen.getByText('call')).toBeTruthy()
        expect(screen.getByText('setup')).toBeTruthy()
    })

    // Urgency order, not ladder order — a row awaiting confirm must sit above a live position.
    it('orders lifecycle groups most-urgent first', () => {
        render(<FloorLists
            calls={[call({ id: 'c1', asset: 'AAA', status: 'waiting' }), call({ id: 'c2', asset: 'BBB', status: 'hit' })]}
            setups={[setup({ id: 's1', asset: 'CCC', status: 'long' })]}
            initialDesk="trade"
        />)
        const labels = [...document.querySelectorAll('.floor-grp__label')].map(n => n.textContent)
        expect(labels).toEqual(['Ready', 'In position', 'Not watched'])
    })

    it('shows an empty state per desk instead of a blank body', () => {
        render(<FloorLists initialDesk="trade" />)
        expect(screen.getByText(/no calls or setups/i)).toBeTruthy()
    })

    it('a row click opens that entity’s pop-out', () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        render(<FloorLists calls={[call()]} initialDesk="trade" />)
        fireEvent.click(screen.getByText('NVDA').closest('button'))
        expect(open).toHaveBeenCalledTimes(1)
        expect(open.mock.calls[0][0]).toContain('/call/c1')
    })

    // A portfolio has no record of its own — it IS the set of ideas sharing a portfolioId — so the
    // holdings under it are those records, labelled as holdings rather than as ideas.
    it('expands a portfolio into its holdings', () => {
        const ideas = [
            { id: 'i1', portfolioId: 'p1', portfolioName: 'Core', asset: 'SPY', direction: 'long', status: 'looking', allocationRatio: 0.6 },
            { id: 'i2', portfolioId: 'p1', portfolioName: 'Core', asset: 'TLT', direction: 'long', status: 'waiting', allocationRatio: 0.4 },
        ]
        render(<FloorLists ideas={ideas} />)
        fireEvent.click(deskBtn('Portfolio floor'))
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
        fireEvent.click(deskBtn('Portfolio floor'))
        fireEvent.click(screen.getByText('Core').closest('button'))
        expect(screen.getByText('60%')).toBeTruthy()
    })

    // `long` as a status means "in a live position", but printed next to the direction arrow it
    // reads as the arrow repeated in words.
    it('shows an in-position holding as a stage, not as a second copy of the direction', () => {
        const ideas = [{ id: 'i1', portfolioId: 'p1', portfolioName: 'Core', asset: 'SPY', direction: 'long', status: 'long', allocationRatio: 1 }]
        render(<FloorLists ideas={ideas} />)
        fireEvent.click(deskBtn('Portfolio floor'))
        fireEvent.click(screen.getByText('Core').closest('button'))
        expect(screen.getByText('in position')).toBeTruthy()
        expect(screen.queryByText('long')).toBeNull()
    })

    it('a holding click opens that idea’s pop-out', () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        const ideas = [{ id: 'i1', portfolioId: 'p1', portfolioName: 'Core', asset: 'SPY', direction: 'long', status: 'looking', allocationRatio: 1 }]
        render(<FloorLists ideas={ideas} />)
        fireEvent.click(deskBtn('Portfolio floor'))
        fireEvent.click(screen.getByText('Core').closest('button'))
        fireEvent.click(screen.getByText('SPY').closest('button'))
        expect(open.mock.calls[0][0]).toContain('/idea/i1')
    })

    it('expands a coverage row into its thesis', () => {
        const coverage = [{ id: 'cv1', symbol: 'AAPL', status: 'active', thesis: 'Services mix re-rates the multiple.', kill_criteria: ['Services growth < 8%'] }]
        render(<FloorLists coverage={coverage} />)
        fireEvent.click(deskBtn('Coverage'))
        expect(screen.queryByText(/services mix/i)).toBeNull()

        fireEvent.click(screen.getByText('AAPL').closest('button'))
        expect(screen.getByText(/services mix/i)).toBeTruthy()
        expect(screen.getByText('Services growth < 8%')).toBeTruthy()
    })

    // A chevron that opens an empty box is worse than no chevron.
    it('offers no expander on a coverage row with nothing to show', () => {
        const coverage = [{ id: 'cv1', symbol: 'AAPL', status: 'active' }]
        render(<FloorLists coverage={coverage} />)
        fireEvent.click(deskBtn('Coverage'))
        const row = screen.getByText('AAPL').closest('button')
        expect(row.getAttribute('aria-expanded')).toBeNull()
        expect(row.querySelector('.floor-row__chev')).toBeNull()
    })

    it('expands a scan into its candidates, and several scans can be open at once', () => {
        const scans = [
            { id: 'x', thesis: 'Semis', direction: 'long', candidates: [{ ticker: 'NVDA', score: { total: 82 } }] },
            { id: 'y', thesis: 'Banks', direction: 'long', candidates: [{ ticker: 'JPM',  score: { total: 61 } }] },
        ]
        render(<FloorLists scans={scans} />)
        fireEvent.click(deskBtn('Scans'))
        expect(screen.queryByText('NVDA')).toBeNull()

        fireEvent.click(screen.getByText('Semis').closest('button'))
        fireEvent.click(screen.getByText('Banks').closest('button'))
        expect(screen.getByText('NVDA')).toBeTruthy()
        expect(screen.getByText('JPM')).toBeTruthy()
    })

    // A count is part of the name it counts, so it is parenthesised and adjacent — not a bare
    // number parked in a column of its own on the right edge.
    it('prints a scan’s candidate count in parentheses immediately after the thesis', () => {
        const scans = [{ id: 'x', thesis: 'Semis', direction: 'long', candidates: [{ ticker: 'NVDA' }, { ticker: 'AMD' }] }]
        render(<FloorLists scans={scans} />)
        fireEvent.click(deskBtn('Scans'))

        const name = screen.getByText('Semis')
        expect(name.nextElementSibling.textContent).toBe('(2)')
    })
})

// ── Row actions ───────────────────────────────────────────────────────────────
// Edit/delete on the row are a second SURFACE onto the same entities, not a second set of rules
// about them: the same handlers, the same live-position locks, the same "a candidate isn't a
// record" line the rest of the app draws.

describe('FloorLists row actions', () => {
    it('offers edit and delete on a trading-floor row, wired to that entity', () => {
        const onEditCall = vi.fn(), onDeleteCall = vi.fn()
        render(<FloorLists calls={[call()]} onEditCall={onEditCall} onDeleteCall={onDeleteCall} initialDesk="trade" />)

        fireEvent.click(screen.getByTitle('Edit call in Kairos chat'))
        fireEvent.click(screen.getByTitle('Delete call'))
        expect(onEditCall.mock.calls[0][0].id).toBe('c1')     // the call itself — it seeds the chat
        expect(onDeleteCall).toHaveBeenCalledWith('c1')       // the id — same contract as CallCard
    })

    // The row opens a pop-out; the buttons on it must not.
    it('does not open the pop-out when an action is clicked', () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        render(<FloorLists calls={[call()]} onDeleteCall={vi.fn()} initialDesk="trade" />)

        fireEvent.click(screen.getByTitle('Delete call'))
        expect(open).not.toHaveBeenCalled()
    })

    // Past entry the plan can't be re-run in the chat — changes go through management cards — and
    // the bin is locked because the server refuses it (409 in_position) for every kind.
    it('drops the pencil and locks the bin once a call is past entry', () => {
        render(<FloorLists calls={[call({ status: 'long' })]} onEditCall={vi.fn()} onDeleteCall={vi.fn()} initialDesk="trade" />)
        expect(screen.queryByTitle('Edit call in Kairos chat')).toBeNull()
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
        render(<FloorLists calls={[call()]} initialDesk="trade" />)
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
        fireEvent.click(deskBtn('Portfolio floor'))
        expect(screen.getByTitle(/close it first to delete this portfolio/i).disabled).toBe(true)

        fireEvent.click(screen.getByText('Core').closest('button'))
        const bins = screen.getAllByTitle('Delete holding')
        expect(bins).toHaveLength(1)              // the live leg's bin is locked, not titled 'Delete holding'
        expect(bins[0].disabled).toBe(false)
    })

    // A holding is edited by reopening the BOOK — its weight only means something against the
    // other legs — and the per-holding chat that would have edited one alone is the archived Idea
    // agent. So the pencil lives on the book row and nowhere below it.
    it('gives the portfolio row a pencil and the holdings none', () => {
        const ideas = [{ id: 'i1', portfolioId: 'p1', portfolioName: 'Core', asset: 'SPY', direction: 'long', status: 'waiting' }]
        render(<FloorLists ideas={ideas} onEditPortfolio={vi.fn()} onDeleteIdea={vi.fn()} />)
        fireEvent.click(deskBtn('Portfolio floor'))
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
        fireEvent.click(deskBtn('Portfolio floor'))
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
        fireEvent.click(deskBtn('Scans'))
        fireEvent.click(screen.getByText('Semis').closest('button'))

        expect(screen.getByText('NVDA').closest('.floor-rowhost')).toBeNull()
        expect(screen.getAllByTitle('Delete list')).toHaveLength(1)
        fireEvent.click(screen.getByTitle('Delete list'))
        expect(onDeleteScan).toHaveBeenCalledWith('x')
    })
})
