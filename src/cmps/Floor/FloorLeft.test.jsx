import { describe, it, expect, afterEach, vi } from 'vitest'
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

    // A paper/manual account has no broker number, so it falls back to its id — long enough that
    // an unshrinkable cell would shove the count out from under it. The number truncates instead
    // (CSS, so jsdom can't see it), which is why it has to carry itself as a tooltip: that is the
    // only place the hidden tail stays readable.
    it('keeps the count beside a long fallback account id, and titles the id with itself', () => {
        const long = 'paper-8f3c1d9a-44b2-4e77-9b10-2c6f5a1e3d84'
        render(<FloorLeft positions={[pos({ broker: 'paper', accountId: long, accountNo: undefined })]} />)

        const no = screen.getByText(long)
        expect(no.getAttribute('title')).toBe(long)
        expect(no.nextElementSibling.textContent).toBe('(1)')
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

    // ── Closing ──────────────────────────────────────────────────────────────
    //
    // The column withheld these for a while (fcf7b27), on the grounds that closing lived in the
    // Positions tab. The Floor then REPLACED that tab, which left the only ✕ inside a pop-out
    // window opened from a row — so a book showed exposure it gave you no way out of. They are
    // back, with the two guards that answered the original worry: hover-revealed rather than
    // resting, and every one of them opens the confirm rather than firing.

    it('offers no close control when the caller hands it no close handlers', () => {
        render(<FloorLeft positions={[pos(), pos({ id: 'p2', symbol: 'SPY' })]} ideas={[idea()]} />)
        openAcct()

        expect(document.querySelector('.icon-btn')).toBeNull()
    })

    it('gives a leg a ✕ that asks before it fires', () => {
        const onClosePosition = vi.fn()
        render(<FloorLeft positions={[pos({ id: 'p2', symbol: 'SPY' })]} onClosePosition={onClosePosition} />)
        openAcct()

        const btn = document.querySelector('.floor-rowhost__actions .icon-btn')
        expect(btn.getAttribute('title')).toBe('Close SPY at market')

        fireEvent.click(btn)
        // The confirm, not the broker — a click on the row's ✕ must never BE the close.
        expect(onClosePosition).not.toHaveBeenCalled()
        // 'Close position' is both the dialog header and its confirm — pin the button.
        expect(document.querySelector('.close-position__btn--confirm').textContent).toBe('Close position')
    })

    // A refused close used to leave the dialog exactly as it was, with the reason only in the
    // console — so a venue outage looked like a click that didn't register, and the user pressed
    // it again. Whatever the backend said has to reach the person who asked.
    it('reports a refused close in the dialog instead of swallowing it', async () => {
        const onClosePosition = vi.fn().mockRejectedValue({
            response: { data: { error: 'paper: no price for ZTS' } },
        })
        render(<FloorLeft positions={[pos({ symbol: 'ZTS' })]} onClosePosition={onClosePosition} />)
        openAcct()

        fireEvent.click(document.querySelector('.floor-rowhost__actions .icon-btn'))
        fireEvent.click(document.querySelector('.close-position__btn--confirm'))

        expect(await screen.findByText('paper: no price for ZTS')).toBeTruthy()
        // Still open, still closable — a failure is not a dismissal.
        expect(document.querySelector('.close-position__btn--confirm')).toBeTruthy()
    })

    it('gives a book one ✕ for every leg under it, and names how many', () => {
        const positions = [pos(), pos({ id: 'p2', symbol: 'SPY' })]
        const ideas = [idea(), idea({
            id: 'i2', brokerOrders: [{ positionId: 'p2', broker: 'ctrader', accountId: 'a1' }],
        })]
        render(<FloorLeft positions={positions} ideas={ideas} onClosePositions={vi.fn()} />)
        openAcct()

        // The book row is collapsed — its ✕ is reachable without opening it, which is the point:
        // closing the book is an act on the book, not on the legs you'd have to expand to see.
        const bookBtn = document.querySelector('.floor-book .floor-rowhost__actions .icon-btn')
        expect(bookBtn.getAttribute('title')).toBe('Close all 2 positions in Core at market')
        expect(document.querySelector('.floor-pos')).toBeNull()
    })

    // The two handlers are independent: a surface may pass one and not the other, and the row that
    // has no handler must not sprout a dead button.
    it('gives a leg no ✕ when only the group handler is supplied', () => {
        render(<FloorLeft positions={[pos()]} ideas={[idea()]} onClosePositions={vi.fn()} />)
        openAcct()
        fireEvent.click(screen.getByText('Core'))

        expect(document.querySelector('.floor-pos')).toBeTruthy()
        expect(document.querySelector('.floor-book .floor-rowhost__actions .icon-btn')).toBeTruthy()
        expect(document.querySelectorAll('.icon-btn')).toHaveLength(1)
    })

    // ── One line per HOLDING ─────────────────────────────────────────────────
    //
    // A scale-in on a hedging venue can't grow a position, so it opens a sibling — and the book then
    // listed the same ticker twice, at two prices, neither of them what the user owns. The holding is
    // the unit they think in, so it gets one line at the blended average.

    // Two positions of ONE holding: 10 @ 987.24 and 3 @ 1018.41 — the MU case.
    const twoLegHolding = () => ({
        positions: [
            pos({ id: 'p1', symbol: 'MU', volume: 10, entryPrice: 987.24, currentPrice: 1000, pnl: 128 }),
            pos({ id: 'p2', symbol: 'MU', volume: 3,  entryPrice: 1018.41, currentPrice: 1000, pnl: -55 }),
        ],
        ideas: [idea({ brokerOrders: [
            { positionId: 'p1', broker: 'ctrader', accountId: 'a1' },
            { positionId: 'p2', broker: 'ctrader', accountId: 'a1' },
        ] })],
    })

    const openBook = () => { openAcct(); fireEvent.click(screen.getByText('Core')) }

    it('shows a two-position holding as ONE line, at the summed size', () => {
        render(<FloorLeft {...twoLegHolding()} />)
        openBook()

        const rows = document.querySelectorAll('.floor-pos')
        expect(rows).toHaveLength(1)
        expect(rows[0].className).toContain('floor-pos--folded')
        expect(rows[0].querySelector('.floor-pos__qty').textContent).toBe('13')
        // The leg count rides beside the ticker, so the line says it stands for more than one.
        expect(rows[0].querySelector('.floor-pos__legs').textContent).toBe('×2')
    })

    it('sums the holding’s money P&L across its legs', () => {
        render(<FloorLeft {...twoLegHolding()} />)
        openBook()

        expect(document.querySelector('.floor-pos__pnl').textContent).toContain('73')   // 128 − 55
    })

    it('opens the legs on click, and each leg keeps its own size', () => {
        render(<FloorLeft {...twoLegHolding()} />)
        openBook()

        fireEvent.click(document.querySelector('.floor-pos--folded'))
        const qtys = [...document.querySelectorAll('.floor-pos')].map(r => r.querySelector('.floor-pos__qty').textContent)
        expect(qtys).toEqual(['13', '10', '3'])
    })

    // The ✕ on a folded line is the holding's, not one arbitrary leg's — "close MU" has never meant
    // half of MU. Per-leg ✕s are still there once the legs are showing.
    it('closes the whole holding from the folded line', () => {
        render(<FloorLeft {...twoLegHolding()} onClosePositions={vi.fn()} onClosePosition={vi.fn()} />)
        openBook()

        const btn = document.querySelector('.floor-pos--folded')
            .closest('.floor-rowhost').querySelector('.icon-btn')
        expect(btn.getAttribute('title')).toBe('Close all 2 MU positions at market')
    })

    // The common case must be untouched: one position, one plain row, no caret, no leg count.
    it('leaves a single-position holding exactly as it was', () => {
        render(<FloorLeft positions={[pos()]} ideas={[idea()]} />)
        openBook()

        const row = document.querySelector('.floor-pos')
        expect(row.className).not.toContain('floor-pos--folded')
        expect(row.querySelector('.floor-pos__legs')).toBeNull()
    })
})
