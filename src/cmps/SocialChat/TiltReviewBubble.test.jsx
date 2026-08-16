import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { TiltReviewBubble } from './ChatWindow.jsx'
import { eventBus, TILT_REVIEW_OPEN, OPEN_SECTOR_VIEW } from '../../services/event-bus.service'

// The bubble's module (ChatWindow.jsx) pulls in axios-backed service modules at load time.
// Stub them so the tree mounts without touching the network.
vi.mock('../../services/manual/manual.service.remote', () => ({
    manualService: {},
}))

const msg = {
    id:      'm1',
    type:    'tilt_review',
    content: 'Sector view due for review — stance matured: Energy. late-cycle disinflation — 2 stances standing; Pythia reaffirms what still holds rather than starting over.',
    actions: { primary: { label: 'Run the review' }, dismiss: true },
    payload: {
        kind: 'tilt_review', tiltId: 'tilt_SPX_1', benchmark: 'SPX',
        reason: 'stance matured: Energy', regime: 'late-cycle disinflation',
        stances: 2, sectors: ['Energy', 'Technology'], matured: ['Energy'],
    },
}

describe('TiltReviewBubble', () => {
    afterEach(cleanup)

    // The point of the whole card: a re-author supersedes the house view everyone reads, so it runs
    // at Pythia's desk where the user can push back — never straight off a click in a chat window.
    it('routes to Pythia with the trigger, and carries the reason into the turn', () => {
        const onClose = vi.fn()
        const heard   = vi.fn()
        const off     = eventBus.on(TILT_REVIEW_OPEN, heard)

        render(<TiltReviewBubble msg={msg} onClose={onClose} onResolve={vi.fn()} />)
        fireEvent.click(screen.getByText('Run the review'))

        expect(heard).toHaveBeenCalledTimes(1)
        expect(heard.mock.calls[0][0]).toEqual({ reason: 'stance matured: Energy' })
        expect(onClose).toHaveBeenCalled()
        off()
    })

    // Its sibling (tilt_event) opens the forecasts board, because a published view is a STATE. This
    // one is the opposite ask, and must not quietly land the user on a read-only surface.
    it('does not open the sector-view board — the ask is to re-examine, not to read', () => {
        const board = vi.fn()
        const off   = eventBus.on(OPEN_SECTOR_VIEW, board)

        render(<TiltReviewBubble msg={msg} onResolve={vi.fn()} />)
        fireEvent.click(screen.getByText('Run the review'))

        expect(board).not.toHaveBeenCalled()
        off()
    })

    it('resolves the moment it routes', () => {
        const onResolve = vi.fn()
        render(<TiltReviewBubble msg={msg} onResolve={onResolve} />)

        fireEvent.click(screen.getByText('Run the review'))

        expect(onResolve).toHaveBeenCalledWith('m1', { status: 'done', outcome: 'opened' })
    })

    // A matured stance is a CLOSED call the review has to grade, so it leads — "review due" alone
    // does not say the desk owes a verdict on anything in particular.
    it('leads with what came due', () => {
        render(<TiltReviewBubble msg={msg} onResolve={vi.fn()} />)
        expect(screen.getByText(/Energy due/)).toBeTruthy()
    })

    it('falls back to a plain heading when nothing has matured', () => {
        const scheduled = { ...msg, id: 'm2', payload: { ...msg.payload, matured: [], reason: 'no review in 34 days' } }
        render(<TiltReviewBubble msg={scheduled} onResolve={vi.fn()} />)
        expect(screen.getByText(/review due/)).toBeTruthy()
    })

    it('dismiss resolves without routing anywhere', () => {
        const onResolve = vi.fn()
        const heard     = vi.fn()
        const off       = eventBus.on(TILT_REVIEW_OPEN, heard)

        render(<TiltReviewBubble msg={msg} onResolve={onResolve} />)
        fireEvent.click(screen.getByText('Dismiss'))

        expect(heard).not.toHaveBeenCalled()
        expect(onResolve).toHaveBeenCalledWith('m1', { status: 'dismissed', outcome: 'dismissed' })
        off()
    })
})
