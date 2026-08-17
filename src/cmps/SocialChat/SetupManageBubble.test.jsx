import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { SetupManageBubble } from './ChatWindow.jsx'
import { eventBus, SETUP_CONFIRM_OPEN } from '../../services/event-bus.service.js'

vi.mock('../../services/manual/manual.service.remote', () => ({ manualService: {} }))

function makeMsg(overrides = {}) {
    const base = {
        id:      'm1',
        type:    'setup_manage',
        content: 'Your LONG NVDA — I want to move the stop to 120.',
        actions: { primary: { label: 'Review' }, dismiss: true },
        payload: { kind: 'setup', setupId: 'setup-1', asset: 'NVDA', direction: 'long', verdict: 'move_stop', proposal: { stop: 120 }, read: 'structure moved up' },
    }
    return { ...base, ...overrides }
}

describe('SetupManageBubble', () => {
    beforeEach(() => {
        vi.spyOn(window, 'open').mockImplementation(() => null)
        vi.spyOn(eventBus, 'emit')
    })
    afterEach(() => {
        vi.restoreAllMocks()
        cleanup()
    })

    it('primary "Review" opens the setup pop-out — and LEAVES IT PENDING', () => {
        const onResolve = vi.fn()
        const onClose   = vi.fn()
        render(<SetupManageBubble msg={makeMsg()} onClose={onClose} onResolve={onResolve} />)

        fireEvent.click(screen.getByText('Review'))

        expect(window.open).toHaveBeenCalled()          // the pop-out IS the destination here
        expect(onResolve).toHaveBeenCalledWith('m1', { status: 'pending', outcome: 'opened' })
        expect(onClose).toHaveBeenCalled()
    })

    // The one verdict that is NOT a management accept: Talos has already parked the order plan, so
    // the user needs the ORDER dialog. Routing it to the pop-out would land on a card whose Accept
    // the server refuses (`confirm_order`).
    it('add_leg routes to the order confirm, not the pop-out', () => {
        const onResolve = vi.fn()
        render(
            <SetupManageBubble
                msg={makeMsg({ payload: { setupId: 's7', asset: 'NVDA', verdict: 'add_leg', proposal: { quantity: 50 }, read: 'the level printed' } })}
                onResolve={onResolve}
            />,
        )

        fireEvent.click(screen.getByText('Review'))

        expect(eventBus.emit).toHaveBeenCalledWith(SETUP_CONFIRM_OPEN, { setupId: 's7' })
        expect(window.open).not.toHaveBeenCalled()
        expect(onResolve).toHaveBeenCalledWith('m1', { status: 'pending', outcome: 'opened' })
    })

    it('shows the verdict as a verb in the header', () => {
        render(<SetupManageBubble msg={makeMsg()} onResolve={vi.fn()} />)
        expect(screen.getByText(/Manage NVDA/)).toBeTruthy()
        expect(screen.getByText(/move the stop/)).toBeTruthy()
    })

    it('falls back to the raw verdict when the copy map has no entry', () => {
        render(
            <SetupManageBubble
                msg={makeMsg({ payload: { setupId: 's2', asset: 'AMD', verdict: 'scale_in', read: 'x' } })}
                onResolve={vi.fn()}
            />,
        )
        expect(screen.getByText(/scale_in/)).toBeTruthy()
    })

    // `let_run` is Talos deciding NOT to trim — a statement, posted without actions.
    it('renders let_run as a statement — no buttons', () => {
        render(
            <SetupManageBubble
                msg={makeMsg({ actions: undefined, content: 'Your LONG NVDA is working — letting it run.',
                    payload: { setupId: 's3', asset: 'NVDA', verdict: 'let_run', read: null } })}
                onResolve={vi.fn()}
            />,
        )
        expect(screen.queryByText('Review')).toBeNull()
        expect(screen.queryByText('Dismiss')).toBeNull()
        expect(screen.getByText(/letting it run/)).toBeTruthy()
    })

    it('Dismiss resolves the card without opening anything', () => {
        const onResolve = vi.fn()
        render(<SetupManageBubble msg={makeMsg()} onResolve={onResolve} />)

        fireEvent.click(screen.getByText('Dismiss'))

        expect(onResolve).toHaveBeenCalledWith('m1', { status: 'dismissed', outcome: 'dismissed' })
        expect(window.open).not.toHaveBeenCalled()
    })

    it('keeps the verdict qualifier + Talos read on the collapsed chip', () => {
        render(<SetupManageBubble msg={makeMsg({ status: 'done', resolveOutcome: 'opened' })} onResolve={vi.fn()} />)

        expect(screen.getByText(/Opened/)).toBeTruthy()
        expect(screen.getByText(/move the stop/)).toBeTruthy()
        expect(screen.getByText('structure moved up')).toBeTruthy()
        expect(screen.queryByText('Review')).toBeNull()
    })
})
