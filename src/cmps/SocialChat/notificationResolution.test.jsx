import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { readResolution } from './cardResolution.js'
import { CoverageEventBubble, CoverageRefreshedBubble } from './ChatWindow.jsx'
import { eventBus, OPEN_COVERAGE, PORTFOLIO_REVIEW } from '../../services/event-bus.service.js'

vi.mock('../../services/manual/manual.service.remote', () => ({ manualService: {} }))

// readResolution is the ONE resolution read shared by every card: top-level `status` is the
// source of truth; legacy `payload.resolved` / `dismissed` are a fallback so old history collapses.
describe('readResolution', () => {
    it('reads the unified top-level status first', () => {
        expect(readResolution({ status: 'done', resolveOutcome: 'confirmed' })).toEqual({ resolved: true, status: 'done', outcome: 'confirmed' })
        expect(readResolution({ status: 'dismissed', resolveOutcome: null })).toEqual({ resolved: true, status: 'dismissed', outcome: null })
    })

    it('falls back to legacy payload.resolved (portfolio review)', () => {
        expect(readResolution({ payload: { resolved: true, outcome: 'updated' } })).toEqual({ resolved: true, status: 'done', outcome: 'updated' })
        expect(readResolution({ payload: { resolved: true, outcome: 'dismissed' } })).toEqual({ resolved: true, status: 'dismissed', outcome: 'dismissed' })
    })

    it('falls back to legacy dismissed flag', () => {
        expect(readResolution({ dismissed: true, dismissOutcome: 'editing' })).toEqual({ resolved: true, status: 'dismissed', outcome: 'editing' })
    })

    it('is unresolved when nothing is set (a fresh pending card)', () => {
        expect(readResolution({ status: 'pending' })).toEqual({ resolved: false, status: null, outcome: null })
        expect(readResolution({})).toEqual({ resolved: false, status: null, outcome: null })
    })
})

describe('CoverageEventBubble', () => {
    beforeEach(() => vi.spyOn(eventBus, 'emit'))
    afterEach(() => { vi.restoreAllMocks(); cleanup() })

    const msg = {
        id: 'm1', type: 'coverage_event', content: 'NVDA reached our price target.',
        payload: { kind: 'coverage', symbol: 'NVDA', coverageId: 'cov1', state: 'target_hit' },
    }

    it('primary "Open coverage" routes to the Analyst + resolves done', () => {
        const onResolve = vi.fn(), onClose = vi.fn()
        render(<CoverageEventBubble msg={msg} onClose={onClose} onResolve={onResolve} />)

        fireEvent.click(screen.getByText('Open coverage'))

        expect(eventBus.emit).toHaveBeenCalledWith(OPEN_COVERAGE, { coverageId: 'cov1', symbol: 'NVDA' })
        expect(onResolve).toHaveBeenCalledWith('m1', { status: 'done', outcome: 'opened' })
        expect(onClose).toHaveBeenCalled()
    })

    it('collapses to a chip once resolved, dropping the actions', () => {
        render(<CoverageEventBubble msg={{ ...msg, status: 'done', resolveOutcome: 'opened' }} onResolve={vi.fn()} />)
        expect(screen.getByText(/Opened/)).toBeTruthy()
        expect(screen.queryByText('Open coverage')).toBeNull()
    })
})

describe('CoverageRefreshedBubble', () => {
    beforeEach(() => vi.spyOn(eventBus, 'emit'))
    afterEach(() => { vi.restoreAllMocks(); cleanup() })

    const fromReview = {
        id: 'm2', type: 'coverage_refreshed', content: 'Fresh research on NVDA is ready.',
        payload: { kind: 'coverage', symbol: 'NVDA', coverageId: 'cov1', portfolioId: 'pf1', ok: true },
    }

    it('primary "Resume review" reopens the portfolio review + resolves done', () => {
        const onResolve = vi.fn(), onClose = vi.fn()
        render(<CoverageRefreshedBubble msg={fromReview} onClose={onClose} onResolve={onResolve} />)

        fireEvent.click(screen.getByText('Resume review'))

        expect(eventBus.emit).toHaveBeenCalledWith(PORTFOLIO_REVIEW, { portfolioId: 'pf1', reviewMode: true })
        expect(onResolve).toHaveBeenCalledWith('m2', { status: 'done', outcome: 'resumed' })
        expect(onClose).toHaveBeenCalled()
    })

    it('with no portfolioId, primary opens coverage instead', () => {
        const onResolve = vi.fn()
        const standalone = { ...fromReview, payload: { ...fromReview.payload, portfolioId: null } }
        render(<CoverageRefreshedBubble msg={standalone} onClose={vi.fn()} onResolve={onResolve} />)

        fireEvent.click(screen.getByText('Open coverage'))

        expect(eventBus.emit).toHaveBeenCalledWith(OPEN_COVERAGE, { coverageId: 'cov1', symbol: 'NVDA' })
        expect(onResolve).toHaveBeenCalledWith('m2', { status: 'done', outcome: 'opened' })
    })

    it('a failed refresh (ok:false) still shows the resume action', () => {
        render(<CoverageRefreshedBubble msg={{ ...fromReview, payload: { ...fromReview.payload, ok: false } }} onClose={vi.fn()} onResolve={vi.fn()} />)
        expect(screen.getByText(/refresh failed/)).toBeTruthy()
        expect(screen.getByText('Resume review')).toBeTruthy()
    })
})
