import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FloorLeft } from './FloorLeft.jsx'

const pos = (o = {}) => ({
    id: 'p1', broker: 'ctrader', accountId: 'a1', accountNo: '5001',
    symbol: 'NVDA', direction: 'long', volume: 1, pnl: 10, currency: 'USD', ...o,
})

describe('FloorLeft', () => {
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
})
