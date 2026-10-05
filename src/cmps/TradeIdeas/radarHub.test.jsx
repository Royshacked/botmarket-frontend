import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ADMIN, MEMBER } from '../../testUtils/authStub.js'

// The Radar hub's Forecasts card opens the house's industry views — a broadcast every user reads
// (2026-10-05). Only authoring them, Pythia's desk, is admin-only.

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

const radar = { tab: 'scans', onTabChange: vi.fn(), scans: [], coverage: [], earnings: [], fed: [], ipo: [],
    industries: [{ code: 'a', view: { status: 'answered' } }, { code: 'b', view: null }] }

describe('Radar hub — the Forecasts card', () => {
    it('is offered to an admin, with how many industries Pythia has answered', () => {
        render(<TradeIdeasList ideas={[]} radar={radar} />)
        expect(screen.getByRole('button', { name: /Forecasts/ })).toBeTruthy()
        expect(screen.getByText('1/2 industries')).toBeTruthy()
    })

    it('is offered to a trader too, beside the other radar cards', () => {
        AUTH = MEMBER
        render(<TradeIdeasList ideas={[]} radar={radar} />)
        expect(screen.getByRole('button', { name: /Forecasts/ })).toBeTruthy()
        for (const label of ['Fed', 'Scans', 'Earnings', 'Coverage']) {
            expect(screen.getByText(label, { selector: '.trade-ideas-list__hub-card-label' })).toBeTruthy()
        }
    })
})
