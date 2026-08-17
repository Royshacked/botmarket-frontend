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

    it('an OPENED card is still unresolved — that is the whole rule', () => {
        // "I opened it and got distracted" must read as outstanding. If this ever returns
        // resolved:true, every actionable card silently dies on navigation again.
        expect(readResolution({ status: 'pending', resolveOutcome: 'opened' }))
            .toEqual({ resolved: false, status: null, outcome: null })
    })

    it('superseded is terminal — a fresher card replaced this one', () => {
        // Without this the backend retires the old card and the client keeps rendering it, so the
        // one-live-ask-per-entity guarantee breaks exactly where the user can see it.
        expect(readResolution({ status: 'superseded', resolveOutcome: 'superseded' }))
            .toEqual({ resolved: true, status: 'superseded', outcome: 'superseded' })
    })
})

// THE RULE, tested on the shell rather than on any one card — because the shell is where it now
// lives. A bubble supplies only the side effect; it cannot opt itself out.
describe('the stays-alive rule', () => {
    afterEach(cleanup)
    const base = {
        id: 'm1', type: 'coverage_event', content: 'ZTS thesis broken.',
        payload: { kind: 'coverage', symbol: 'ZTS', coverageId: 'cov1', state: 'thesis_broken' },
    }

    it('a WORK card stays pending when opened, and shows that it is still owed', async () => {
        const onResolve = vi.fn()
        render(<CoverageEventBubble
            msg={{ ...base, actions: { primary: { label: 'Open coverage', resolvesOn: 'work' }, dismiss: true } }}
            onResolve={onResolve} onClose={vi.fn()} />)

        fireEvent.click(screen.getByText('Open coverage'))
        expect(onResolve).toHaveBeenCalledWith('m1', { status: 'pending', outcome: 'opened' })

        // and once that lands, the card is still there — touched, not gone
        cleanup()
        render(<CoverageEventBubble
            msg={{ ...base, status: 'pending', resolveOutcome: 'opened',
                   actions: { primary: { label: 'Open coverage', resolvesOn: 'work' }, dismiss: true } }}
            onResolve={vi.fn()} onClose={vi.fn()} />)
        expect(screen.getByText('Open coverage')).toBeTruthy()
        expect(screen.getByText(/still waiting on you/i)).toBeTruthy()
    })

    it('a card with no resolvesOn (legacy history) is treated as WORK', () => {
        const onResolve = vi.fn()
        render(<CoverageEventBubble
            msg={{ ...base, actions: { primary: { label: 'Open coverage' }, dismiss: true } }}
            onResolve={onResolve} onClose={vi.fn()} />)

        fireEvent.click(screen.getByText('Open coverage'))
        expect(onResolve).toHaveBeenCalledWith('m1', { status: 'pending', outcome: 'opened' })
    })

    it('Dismiss is still a real resolution — the user said no', () => {
        const onResolve = vi.fn()
        render(<CoverageEventBubble
            msg={{ ...base, actions: { primary: { label: 'Open coverage' }, dismiss: true } }}
            onResolve={onResolve} onClose={vi.fn()} />)

        fireEvent.click(screen.getByText('Dismiss'))
        expect(onResolve).toHaveBeenCalledWith('m1', { status: 'dismissed', outcome: 'dismissed' })
    })
})

describe('CoverageEventBubble', () => {
    beforeEach(() => vi.spyOn(eventBus, 'emit'))
    afterEach(() => { vi.restoreAllMocks(); cleanup() })

    const msg = {
        id: 'm1', type: 'coverage_event', content: 'NVDA reached our price target.',
        payload: { kind: 'coverage', symbol: 'NVDA', coverageId: 'cov1', state: 'target_hit' },
    }

    // A verdict card ASKS for a revision, so it must open the thesis in update mode — `mode` is what
    // carries that. Without it the handler could only open a blank Prometheus, on a card that names
    // the very thesis it wanted revised.
    it('primary "Open coverage" opens that thesis in REVISE mode — and LEAVES IT PENDING', () => {
        const onResolve = vi.fn(), onClose = vi.fn()
        render(<CoverageEventBubble msg={msg} onClose={onClose} onResolve={onResolve} />)

        fireEvent.click(screen.getByText('Open coverage'))

        expect(eventBus.emit).toHaveBeenCalledWith(OPEN_COVERAGE, { coverageId: 'cov1', symbol: 'NVDA', mode: 'revise' })
        expect(onResolve).toHaveBeenCalledWith('m1', { status: 'pending', outcome: 'opened' })
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

    it('primary "Resume review" reopens the portfolio review — and LEAVES IT PENDING', () => {
        const onResolve = vi.fn(), onClose = vi.fn()
        render(<CoverageRefreshedBubble msg={fromReview} onClose={onClose} onResolve={onResolve} />)

        fireEvent.click(screen.getByText('Resume review'))

        expect(eventBus.emit).toHaveBeenCalledWith(PORTFOLIO_REVIEW, { portfolioId: 'pf1', reviewMode: true })
        expect(onResolve).toHaveBeenCalledWith('m2', { status: 'pending', outcome: 'opened' })
        expect(onClose).toHaveBeenCalled()
    })

    // 'open', not 'revise': this thesis was rewritten seconds ago. Re-modelling it to read it would
    // burn a multi-minute research run answering a question that was just answered.
    it('with no portfolioId, primary opens the coverage to READ it', () => {
        const onResolve = vi.fn()
        const standalone = { ...fromReview, payload: { ...fromReview.payload, portfolioId: null } }
        render(<CoverageRefreshedBubble msg={standalone} onClose={vi.fn()} onResolve={onResolve} />)

        fireEvent.click(screen.getByText('Open coverage'))

        expect(eventBus.emit).toHaveBeenCalledWith(OPEN_COVERAGE, { coverageId: 'cov1', symbol: 'NVDA', mode: 'open' })
        expect(onResolve).toHaveBeenCalledWith('m2', { status: 'pending', outcome: 'opened' })
    })

    it('a failed refresh (ok:false) still shows the resume action', () => {
        render(<CoverageRefreshedBubble msg={{ ...fromReview, payload: { ...fromReview.payload, ok: false } }} onClose={vi.fn()} onResolve={vi.fn()} />)
        expect(screen.getByText(/refresh failed/)).toBeTruthy()
        expect(screen.getByText('Resume review')).toBeTruthy()
    })
})
