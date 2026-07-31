import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { FloorLeft } from './FloorLeft.jsx'

// The close-confirm dialog gates a market close on live venue status; keep every venue open here
// so the tests exercise the close path rather than the market-closed block.
vi.mock('../../services/market/market.service.remote', () => ({
    marketService: { getStatus: vi.fn().mockResolvedValue({ open: true, isCrypto: false, nextOpenMs: null }) },
}))

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
})

// ── Closing at market from the book ───────────────────────────────────────────
// The controls ride in RowHost's overlay (CSS-revealed on hover); jsdom applies no stylesheet, so
// the tests click them directly — what's under test is the wiring, not the reveal.
describe('FloorLeft — close at market', () => {
    const confirmBtn = () => document.querySelector('.close-position__btn--confirm')

    it('closes a single position through the confirm dialog', async () => {
        const onClosePosition = vi.fn().mockResolvedValue(undefined)
        render(<FloorLeft positions={[pos()]} onClosePosition={onClosePosition} onClosePositions={vi.fn()} />)
        openAcct()

        fireEvent.click(document.querySelector('.floor-rowhost .icon-btn'))

        // Nothing fires on the click alone — the dialog reviews it first.
        expect(onClosePosition).not.toHaveBeenCalled()
        expect(screen.getByText(/closes the/i)).toBeTruthy()

        fireEvent.click(confirmBtn())
        await waitFor(() => expect(onClosePosition).toHaveBeenCalledWith('ctrader', 'p1', 'a1'))
    })

    it('closes every leg of a book from the portfolio row, in one confirm', async () => {
        const onClosePositions = vi.fn().mockResolvedValue({ closed: 2, failed: [] })
        const positions = [pos(), pos({ id: 'p2', symbol: 'AMD' })]
        const ideas = [idea(), idea({
            id: 'i2', brokerOrders: [{ positionId: 'p2', broker: 'ctrader', accountId: 'a1' }],
        })]
        render(<FloorLeft positions={positions} ideas={ideas} onClosePosition={vi.fn()} onClosePositions={onClosePositions} />)
        openAcct()

        // The book row's control — the legs are still collapsed, so this is the only one on screen.
        fireEvent.click(document.querySelector('.floor-book .icon-btn'))

        expect(document.querySelectorAll('.close-position__list-item')).toHaveLength(2)
        fireEvent.click(confirmBtn())
        await waitFor(() => expect(onClosePositions).toHaveBeenCalledTimes(1))
        expect(onClosePositions.mock.calls[0][0].map(p => p.id)).toEqual(['p1', 'p2'])
    })

    it('reports a partial book close and keeps only the legs that are still open', async () => {
        const onClosePositions = vi.fn().mockResolvedValue({
            closed: 1, failed: [{ position: pos({ id: 'p2', symbol: 'AMD' }), error: 'market closed' }],
        })
        const positions = [pos(), pos({ id: 'p2', symbol: 'AMD' })]
        const ideas = [idea(), idea({
            id: 'i2', brokerOrders: [{ positionId: 'p2', broker: 'ctrader', accountId: 'a1' }],
        })]
        render(<FloorLeft positions={positions} ideas={ideas} onClosePositions={onClosePositions} />)
        openAcct()
        fireEvent.click(document.querySelector('.floor-book .icon-btn'))
        fireEvent.click(confirmBtn())

        await waitFor(() => expect(document.querySelector('.close-position__error')).toBeTruthy())
        expect(document.querySelector('.close-position__error').textContent).toContain('AMD')
        // Retrying must not re-fire at the leg that already closed.
        expect(document.querySelectorAll('.close-position__list-item')).toHaveLength(1)
    })

    // The column is read-only for anyone who can't close — no handler, no control.
    it('renders no close controls without the handlers', () => {
        render(<FloorLeft positions={[pos()]} ideas={[idea()]} />)
        openAcct()
        expect(document.querySelector('.icon-btn')).toBeNull()
    })
})
