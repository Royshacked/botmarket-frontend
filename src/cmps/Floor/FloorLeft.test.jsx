import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { FloorLeft } from './FloorLeft.jsx'

// `globals` is off in vite.config, so nothing unmounts between tests on its own — without this a
// later test querying the document sees the previous test's rows. Same line every other suite runs.
afterEach(cleanup)

const pos = (o = {}) => ({
    id: 'p1', broker: 'ctrader', accountId: 'a1', accountNo: '5001',
    symbol: 'NVDA', direction: 'long', volume: 1, pnl: 10, currency: 'USD', ...o,
})

const idea = (o = {}) => ({
    id: 'i1', portfolioId: 'pf1', portfolioName: 'Core',
    brokerOrders: [{ positionId: 'p1', broker: 'ctrader', accountId: 'a1' }],
    ...o,
})

// Accounts start collapsed, so anything that inspects the rows underneath has to open one first.
const openAcct = (no = '5001') => fireEvent.click(screen.getByText(no))

describe('FloorLeft', () => {
    // A refresh opens nothing on the reader's behalf — the column lands as a table of contents,
    // the same rule the Lists column follows.
    it('starts every account collapsed', () => {
        render(<FloorLeft positions={[pos()]} ideas={[idea()]} />)

        expect(screen.getByText('5001').closest('button').getAttribute('aria-expanded')).toBe('false')
        expect(document.querySelector('.floor-acct__body')).toBeNull()
    })

    // Same convention as the Lists column: a count is part of the name it counts, so it is
    // parenthesised and adjacent — not a bare number parked in a column of its own.
    it('prints an account’s position count in parentheses beside the account number', () => {
        render(<FloorLeft positions={[pos(), pos({ id: 'p2', symbol: 'SPY' })]} />)

        const no = screen.getByText('5001')
        expect(no.nextElementSibling.textContent).toBe('(2)')
    })

    it('keeps the account P&L on the right edge now that the count no longer pushes it there', () => {
        render(<FloorLeft positions={[pos()]} />)

        const pnl = document.querySelector('.floor-acct__pnl')
        expect(pnl).toBeTruthy()
        expect(pnl.previousElementSibling.className).toContain('floor-acct__count')
    })

    // The point of the middle tier: a book stands in for its legs until you ask for them. If they
    // rendered anyway the row would be decoration.
    it('collapses a portfolio into one row, hiding its legs until it is opened', () => {
        render(<FloorLeft positions={[pos()]} ideas={[idea()]} />)
        openAcct()

        expect(screen.getByText('Core')).toBeTruthy()
        expect(document.querySelector('.floor-pos')).toBeNull()

        fireEvent.click(screen.getByText('Core'))
        expect(screen.getByText('NVDA')).toBeTruthy()
        expect(document.querySelector('.floor-pos--sub')).toBeTruthy()
    })

    // A position in no portfolio has nothing to collapse under, so it keeps hanging straight off
    // the account — no wrapper row, no extra indent.
    it('leaves a portfolio-less position flat under its account', () => {
        render(<FloorLeft positions={[pos({ id: 'p2', symbol: 'SPY' })]} ideas={[idea()]} />)
        openAcct()

        expect(document.querySelector('.floor-book')).toBeNull()
        const row = document.querySelector('.floor-pos')
        expect(row).toBeTruthy()
        expect(row.className).not.toContain('floor-pos--sub')
    })

    // The Floor is for WATCHING the book. Closing lives in the Positions tab and the pop-out a row
    // opens, so there is one place to go to act on a position — and no ✕ sitting a stray click away
    // from a market order on the surface the user keeps open all day. This once shipped with close
    // controls on both the leg and the book row; pinned so it can't drift back.
    it('carries no close controls — not on a leg, not on a book row', () => {
        render(<FloorLeft positions={[pos(), pos({ id: 'p2', symbol: 'SPY' })]} ideas={[idea()]} />)
        openAcct()

        expect(document.querySelector('.floor-rowhost')).toBeNull()
        expect(document.querySelector('.icon-btn')).toBeNull()
        expect(document.querySelector('.close-position__backdrop')).toBeNull()
    })
})
