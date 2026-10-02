import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

// The phone's read of one Prometheus thesis (2026-10-02). The book's column is display:none under
// 767px, so "Open coverage" from a social-chat card switched an invisible tab and looked dead. This
// page is where that read lands now: it must SHOW the thesis without a second tap, and its pencil
// must leave the page for the revise doorway rather than stack a desk under a full-screen page.

vi.mock('../context/AuthContext.jsx', async (orig) => {
    const { authModule } = await import('../testUtils/authStub.js')
    return authModule(await orig())
})

const getCoverage = vi.fn()
vi.mock('../services/analyst/analyst.service.remote.js', () => ({
    analystService: { getCoverage: (...a) => getCoverage(...a) },
}))

const { CoveragePage } = await import('./CoveragePage.jsx')
const { eventBus, OPEN_COVERAGE } = await import('../services/event-bus.service')

const DOC = {
    id: 'cov_TSLA_1', symbol: 'TSLA', sector: 'Consumer Discretionary', status: 'active', rating: 'hold',
    thesis: 'Deliveries are re-basing; the Street still prices the robotaxi option at par.',
    kill_criteria: ['Q4 deliveries under 400k'], catalysts: [], revisions: [{}],
}

beforeEach(() => { getCoverage.mockReset(); localStorage.clear() })
afterEach(() => cleanup())

describe('CoveragePage', () => {
    it('opens expanded — the thesis is on screen without another tap', async () => {
        getCoverage.mockResolvedValue(DOC)
        render(<CoveragePage entityId="cov_TSLA_1" onClose={vi.fn()} />)
        expect(await screen.findByText(/robotaxi option/)).toBeTruthy()
        expect(screen.getByText('Q4 deliveries under 400k')).toBeTruthy()
        expect(getCoverage).toHaveBeenCalledWith('cov_TSLA_1')
    })

    it('a doc that will not load still shows the way back', async () => {
        getCoverage.mockResolvedValue(null)
        const onClose = vi.fn()
        render(<CoveragePage entityId="gone" onClose={onClose} />)
        await waitFor(() => expect(screen.getByText('Coverage not found')).toBeTruthy())
        fireEvent.click(screen.getByRole('button', { name: 'Back' }))
        expect(onClose).toHaveBeenCalled()
    })

    it('the pencil leaves the page and asks for the revise doorway on this doc', async () => {
        getCoverage.mockResolvedValue(DOC)
        const onClose = vi.fn()
        const seen = []
        const off = eventBus.on(OPEN_COVERAGE, p => seen.push(p))
        render(<CoveragePage entityId="cov_TSLA_1" onClose={onClose} />)
        await screen.findByText(/robotaxi option/)

        fireEvent.click(screen.getByTitle('Re-open Prometheus on this thesis'))

        expect(onClose).toHaveBeenCalled()
        expect(seen).toEqual([{ coverageId: 'cov_TSLA_1', symbol: 'TSLA', mode: 'revise' }])
        off()
    })
})
