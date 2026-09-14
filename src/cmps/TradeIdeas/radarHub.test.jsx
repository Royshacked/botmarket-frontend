import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ADMIN, MEMBER } from '../../testUtils/authStub.js'

// The Radar hub's Forecasts card opens Pythia's board, and Pythia is admin-only (2026-09-14): the
// tilt read behind the board is requireAdmin, so a trader's card would open onto an empty board.
// The card is the courtesy; the server is the guard. The four other radar cards stay for everyone.

let AUTH = ADMIN
vi.mock('../../context/AuthContext.jsx', async (orig) => {
    const actual = await orig()
    return { ...actual, useAuth: () => AUTH }
})

vi.mock('../../services/portfolio/portfolio.service.remote.js', () => ({
    portfolioService: { getPendingReviews: vi.fn(async () => []) },
}))

import { TradeIdeasList } from './TradeIdeasList.jsx'

afterEach(() => { cleanup(); AUTH = ADMIN })

const radar = { tab: 'scans', onTabChange: vi.fn(), scans: [], coverage: [], earnings: [], fed: [], ipo: [], tilt: null }

describe('Radar hub — the Forecasts card', () => {
    it('is offered to an admin', () => {
        render(<TradeIdeasList ideas={[]} radar={radar} />)
        expect(screen.getByRole('button', { name: /Forecasts/ })).toBeTruthy()
    })

    it('is absent for a trader, while the other radar cards remain', () => {
        AUTH = MEMBER
        render(<TradeIdeasList ideas={[]} radar={radar} />)
        expect(screen.queryByRole('button', { name: /Forecasts/ })).toBeNull()
        // The accessible name carries the glyph's title first ("ArgusScans"), so match the label span.
        for (const label of ['Fed', 'Scans', 'Earnings', 'Coverage']) {
            expect(screen.getByText(label, { selector: '.trade-ideas-list__hub-card-label' })).toBeTruthy()
        }
    })
})
