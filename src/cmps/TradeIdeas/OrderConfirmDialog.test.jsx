import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

// The market clock reads the live time; the point here is the price, so the market is open.
vi.mock('../../customHooks/useMarketStatus.js', () => ({
    useMarketStatus: () => ({ market: {}, marketClosed: false }),
}))

import { OrderConfirmDialog } from './OrderConfirmDialog.jsx'

afterEach(cleanup)

// A confirmed setup entry goes out at MARKET. When the server re-prices at Confirm and the price has
// left the plan, it refuses with the numbers (409 price_moved) and the dialog has to show them —
// EXPD (2026-10-20) was planned at 196 and paid 198.81 with nothing on screen saying so.

const SETUP  = { id: 'setup_EXPD_1', asset: 'EXPD', direction: 'long' }
const ORDERS = [{ broker: 'paper', accountId: 'a1', accountNo: 'a1', quantity: 16, type: 'market' }]
const LEVELS = [{ kind: 'entry', price: 196 }, { kind: 'stop', price: 190.01 }, { kind: 'tp', price: 207.14 }]
const DRIFT  = { planned: 196, live: 198.81, slippage: 2.81, plannedRr: 1.86, liveRr: 0.95, pastStop: false, adverse: true }

const mount = (props = {}) => render(
    <OrderConfirmDialog idea={SETUP} orders={ORDERS} levels={LEVELS} placing={false}
        onConfirm={() => {}} onDismiss={() => {}} {...props} />,
)

describe('OrderConfirmDialog — the price at Confirm', () => {
    it('with no refusal yet: the ordinary button, no price warning', () => {
        mount()
        expect(screen.getByRole('button', { name: 'Confirm & place' })).toBeTruthy()
        expect(screen.queryByText(/This order fills at market/)).toBeNull()
    })

    it('after a price_moved refusal: the live price, the gap and the R:R it now carries', () => {
        mount({ drift: DRIFT })
        const warning = screen.getByText(/This order fills at market/)
        expect(warning.textContent).toMatch(/Price is 198\.81/)
        expect(warning.textContent).toMatch(/2\.81 above your 196(\.00)? plan/)
        expect(warning.textContent).toMatch(/R:R now 0\.95 \(planned 1\.86\)/)
    })

    it('the second press is labelled for what it does, and still confirms', () => {
        const onConfirm = vi.fn()
        mount({ drift: DRIFT, onConfirm })
        fireEvent.click(screen.getByRole('button', { name: 'Buy at market anyway' }))
        expect(onConfirm).toHaveBeenCalledWith(SETUP, ORDERS)
    })

    it('past the stop: says the plan is broken, not merely expensive', () => {
        mount({ drift: { ...DRIFT, live: 189.5, slippage: -6.5, liveRr: null, pastStop: true } })
        expect(screen.getByText(/already past your stop/)).toBeTruthy()
    })
})
