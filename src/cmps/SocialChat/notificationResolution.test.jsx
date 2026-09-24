import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { readResolution } from './cardResolution.js'
import { CoverageEventBubble, CoverageRefreshedBubble, QueueReadyBubble } from './ChatWindow.jsx'
import { eventBus, OPEN_COVERAGE, PORTFOLIO_REVIEW, OPEN_QUEUED_LIST } from '../../services/event-bus.service.js'

vi.mock('../../services/manual/manual.service.remote', () => ({ manualService: {} }))

// readResolution is the ONE resolution read shared by every card: top-level `status` is the
// source of truth; legacy `payload.resolved` / `dismissed` are a fallback so old history collapses.
describe('readResolution', () => {
    it('reads the unified top-level status first', () => {
        expect(readResolution({ status: 'done', resolveOutcome: 'confirmed' })).toEqual({ resolved: true, status: 'done', outcome: 'confirmed', note: null })
        expect(readResolution({ status: 'dismissed', resolveOutcome: null })).toEqual({ resolved: true, status: 'dismissed', outcome: null, note: null })
    })

    it('carries the resolver\u2019s note — what the work DID — alongside the outcome', () => {
        expect(readResolution({ status: 'done', resolveOutcome: 'revised', resolveNote: 'Re-modelled — PT 85 → 92' }))
            .toEqual({ resolved: true, status: 'done', outcome: 'revised', note: 'Re-modelled — PT 85 → 92' })
    })

    it('falls back to legacy payload.resolved (portfolio review)', () => {
        expect(readResolution({ payload: { resolved: true, outcome: 'updated' } })).toEqual({ resolved: true, status: 'done', outcome: 'updated', note: null })
        expect(readResolution({ payload: { resolved: true, outcome: 'dismissed' } })).toEqual({ resolved: true, status: 'dismissed', outcome: 'dismissed', note: null })
    })

    it('falls back to legacy dismissed flag', () => {
        expect(readResolution({ dismissed: true, dismissOutcome: 'editing' })).toEqual({ resolved: true, status: 'dismissed', outcome: 'editing', note: null })
    })

    it('is unresolved when nothing is set (a fresh pending card)', () => {
        expect(readResolution({ status: 'pending' })).toEqual({ resolved: false, status: null, outcome: null, note: null })
        expect(readResolution({})).toEqual({ resolved: false, status: null, outcome: null, note: null })
    })

    it('an OPENED card is still unresolved — that is the whole rule', () => {
        // "I opened it and got distracted" must read as outstanding. If this ever returns
        // resolved:true, every actionable card silently dies on navigation again.
        expect(readResolution({ status: 'pending', resolveOutcome: 'opened' }))
            .toEqual({ resolved: false, status: null, outcome: null, note: null })
    })

    it('superseded is terminal — a fresher card replaced this one', () => {
        // Without this the backend retires the old card and the client keeps rendering it, so the
        // one-live-ask-per-entity guarantee breaks exactly where the user can see it.
        expect(readResolution({ status: 'superseded', resolveOutcome: 'superseded' }))
            .toEqual({ resolved: true, status: 'superseded', outcome: 'superseded', note: null })
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
    // The label is "Revise thesis", not "Open coverage": the refresh card below also said "Open
    // coverage" and only THIS one starts a revise turn, so in the feed the two were the same button.
    it('primary "Revise thesis" opens that thesis in REVISE mode — and LEAVES IT PENDING', () => {
        const onResolve = vi.fn(), onClose = vi.fn()
        render(<CoverageEventBubble msg={msg} onClose={onClose} onResolve={onResolve} />)

        fireEvent.click(screen.getByText('Revise thesis'))

        expect(eventBus.emit).toHaveBeenCalledWith(OPEN_COVERAGE, { coverageId: 'cov1', symbol: 'NVDA', mode: 'revise' })
        expect(onResolve).toHaveBeenCalledWith('m1', { status: 'pending', outcome: 'opened' })
        expect(onClose).toHaveBeenCalled()
    })

    it('collapses to a chip once resolved, dropping the actions', () => {
        render(<CoverageEventBubble msg={{ ...msg, status: 'done', resolveOutcome: 'opened' }} onResolve={vi.fn()} />)
        expect(screen.getByText(/Opened/)).toBeTruthy()
        expect(screen.queryByText('Revise thesis')).toBeNull()
    })

    // A card already in someone's history was posted with the OLD words. The stored label wins over
    // the component's fallback, so scrolling back does not silently rewrite what the card said.
    it('a card posted with its own label keeps it', () => {
        const stored = { ...msg, actions: { primary: { label: 'Open coverage', resolvesOn: 'work' }, dismiss: true } }
        render(<CoverageEventBubble msg={stored} onClose={vi.fn()} onResolve={vi.fn()} />)
        expect(screen.getByText('Open coverage')).toBeTruthy()
        expect(screen.queryByText('Revise thesis')).toBeNull()
    })

    // THE WORK LANDED. The revision the card asked for was saved on the desk, the server closed the
    // card with the analyst's own account of what moved, and the chip has to SAY it — a "Done" that
    // sends the reader back into the thesis to learn whether anything changed is not an answer.
    it('resolved by the revision landing: reads "Revised" and shows what moved', () => {
        render(<CoverageEventBubble msg={{ ...msg, status: 'done', resolveOutcome: 'revised', resolveNote: 'Re-modelled — rating sell → hold, PT 85 → 92' }} onResolve={vi.fn()} />)
        expect(screen.getByText(/✓ Revised/)).toBeTruthy()
        expect(screen.getByText('Re-modelled — rating sell → hold, PT 85 → 92')).toBeTruthy()
        // The original ask stays beneath, so a scrolled-back card still says what it was.
        expect(screen.getByText('NVDA reached our price target.')).toBeTruthy()
        expect(screen.queryByText('Revise thesis')).toBeNull()
    })

    it('a resolution without a note renders the chip as before — no empty line', () => {
        const { container } = render(<CoverageEventBubble msg={{ ...msg, status: 'done', resolveOutcome: 'retired' }} onResolve={vi.fn()} />)
        expect(screen.getByText(/✓ Retired/)).toBeTruthy()
        expect(container.querySelector('.social-chat__invalidation-alert-note')).toBeNull()
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

    // THE BUG (2026-09-24). A scheduled re-model that stored NOTHING is now posted with a Dismiss
    // and no primary (chat.service `dismissOnly`) — it has nothing to open, and the "Open coverage"
    // it used to carry only switched to the Analyst desk, which shows whatever was last researched
    // there. The shell must honour that shape: Dismiss alone, and the card still clearable.
    it('a house refresh that stored nothing renders Dismiss and NO primary', () => {
        const onResolve = vi.fn()
        const nothing = {
            ...fromReview,
            payload: { ...fromReview.payload, portfolioId: null, ok: false, house: true },
            actions: { dismiss: true },
        }
        render(<CoverageRefreshedBubble msg={nothing} onClose={vi.fn()} onResolve={onResolve} />)

        expect(screen.getByText(/refresh failed/)).toBeTruthy()
        expect(screen.queryByText('Open coverage')).toBeNull()
        fireEvent.click(screen.getByText('Dismiss'))
        expect(onResolve).toHaveBeenCalledWith('m2', { status: 'dismissed', outcome: 'dismissed' })
        expect(eventBus.emit).not.toHaveBeenCalled()
    })

    // Older history posted before `dismissOnly` existed carries a primary, and must keep it — the
    // absence of a primary is read off `actions`, never inferred from the payload.
    it('a legacy failed-refresh card with a stored primary keeps its button', () => {
        const legacy = {
            ...fromReview,
            payload: { ...fromReview.payload, portfolioId: null, ok: false, house: true },
            actions: { primary: { label: 'Open coverage', resolvesOn: 'open' }, dismiss: true },
        }
        render(<CoverageRefreshedBubble msg={legacy} onClose={vi.fn()} onResolve={vi.fn()} />)
        expect(screen.getByText('Open coverage')).toBeTruthy()
    })
})

// The market-open nudge is the ONE card the shell closes on open, and the only one that can be:
// it points at a batch, so it carries no entity for a write to resolve it through.
describe('QueueReadyBubble', () => {
    beforeEach(() => vi.spyOn(eventBus, 'emit'))
    afterEach(() => { vi.restoreAllMocks(); cleanup() })

    const msg = {
        id: 'm3', type: 'queue_ready',
        content: 'The market is open — 2 items — MU, AAPL are waiting on you.',
        payload: { count: 2, assets: ['MU', 'AAPL'], staleHours: null },
        actions: { primary: { label: 'Open the list', resolvesOn: 'open' }, dismiss: true },
    }

    it('opening the list RESOLVES the card — the ask was "go look", and you looked', () => {
        const onResolve = vi.fn(), onClose = vi.fn()
        render(<QueueReadyBubble msg={msg} onClose={onClose} onResolve={onResolve} />)

        fireEvent.click(screen.getByText('Open the list'))

        expect(eventBus.emit).toHaveBeenCalledWith(OPEN_QUEUED_LIST, {})
        expect(onResolve).toHaveBeenCalledWith('m3', { status: 'done', outcome: 'opened' })
        expect(onClose).toHaveBeenCalled()
    })

    it('collapses to a chip naming the batch, and the chip still opens the list', () => {
        render(<QueueReadyBubble msg={{ ...msg, status: 'done', resolveOutcome: 'opened' }}
            onClose={vi.fn()} onResolve={vi.fn()} />)

        expect(screen.getByText(/Opened.*2 items/)).toBeTruthy()
        expect(screen.queryByText('Dismiss')).toBeNull()

        // The list is the standing answer to "what is waiting on me" — the chip keeps pointing at it.
        fireEvent.click(screen.getByText(/Opened/))
        expect(eventBus.emit).toHaveBeenCalledWith(OPEN_QUEUED_LIST, {})
    })
})
