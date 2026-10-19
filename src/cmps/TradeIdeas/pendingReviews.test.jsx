import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { ADMIN } from '../../testUtils/authStub.js'

// The pending-reviews read follows the BOOKS, not the array's identity (8f drive, 2026-10-18): MainPage rebuilt the
// list on every streamed token, the read fired per token, and the API limiter refused the whole page mid-build.

vi.mock('../../context/AuthContext.jsx', async (orig) => {
    const actual = await orig()
    return { ...actual, useAuth: () => ADMIN }
})

const { getPendingReviews } = vi.hoisted(() => ({ getPendingReviews: vi.fn(async () => []) }))
vi.mock('../../services/portfolio/portfolio.service.remote.js', () => ({ portfolioService: { getPendingReviews } }))

import { TradeIdeasList } from './TradeIdeasList.jsx'

afterEach(() => { cleanup(); getPendingReviews.mockClear() })

const book = (status = 'waiting') => [{ id: 'i1', asset: 'MSFT', portfolioId: 'p1', portfolioName: 'Book', status }]

describe('TradeIdeasList — pending reviews', () => {
    it('a re-render with an equal (new) list does not read again', () => {
        const { rerender } = render(<TradeIdeasList ideas={book()} />)
        for (let n = 0; n < 5; n++) rerender(<TradeIdeasList ideas={book()} />)
        expect(getPendingReviews).toHaveBeenCalledTimes(1)
    })

    it('a holding that moved status reads again', () => {
        const { rerender } = render(<TradeIdeasList ideas={book()} />)
        rerender(<TradeIdeasList ideas={book('looking')} />)
        expect(getPendingReviews).toHaveBeenCalledTimes(2)
    })
})
