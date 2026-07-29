import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
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

    it('opens the trading floor by default and leaves the others closed', () => {
        render(<FloorLists calls={[call()]} />)
        expect(deskBtn('Trading floor').getAttribute('aria-expanded')).toBe('true')
        expect(deskBtn('Coverage').getAttribute('aria-expanded')).toBe('false')
    })

    it('opening one desk closes the one that was open', () => {
        render(<FloorLists calls={[call()]} coverage={[{ symbol: 'AAPL', status: 'active' }]} />)
        fireEvent.click(deskBtn('Coverage'))
        expect(deskBtn('Coverage').getAttribute('aria-expanded')).toBe('true')
        expect(deskBtn('Trading floor').getAttribute('aria-expanded')).toBe('false')
    })

    // All-closed is a legitimate state: the column becomes a table of contents.
    it('clicking the open desk closes it, leaving all four collapsed', () => {
        render(<FloorLists calls={[call()]} />)
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
        render(<FloorLists calls={[call()]} setups={[setup()]} />)
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
        />)
        const labels = [...document.querySelectorAll('.floor-grp__label')].map(n => n.textContent)
        expect(labels).toEqual(['Ready', 'In position', 'Not watched'])
    })

    it('shows an empty state per desk instead of a blank body', () => {
        render(<FloorLists />)
        expect(screen.getByText(/no calls or setups/i)).toBeTruthy()
    })

    it('a row click opens that entity’s pop-out', () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        render(<FloorLists calls={[call()]} />)
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
