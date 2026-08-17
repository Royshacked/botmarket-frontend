import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { SetupInvalidationBubble } from './ChatWindow.jsx'
import { eventBus, SETUP_INVALIDATION_EDIT } from '../../services/event-bus.service.js'

// The bubble's module (ChatWindow.jsx) pulls in axios-backed service modules at load time.
// Stub them so the tree mounts without touching the network.
vi.mock('../../services/manual/manual.service.remote', () => ({
    manualService: {},
}))

// Mirrors buildSetupInvalidation (backend tradeNotify.service): the four events arrive on ONE
// message type, and only two of them carry `actions`.
function makeMsg(overrides = {}) {
    const base = {
        id:      'm1',
        type:    'setup_invalidation',
        content: 'Your LONG NVDA setup is no longer valid — price closed at 118, past the lower edge.',
        actions: { primary: { label: 'Re-draw it' }, dismiss: true },
        payload: { kind: 'setup', setupId: 'setup-1', asset: 'NVDA', direction: 'long', event: 'invalidated', edge: 'lower', price: 118, remaining: 0 },
    }
    return { ...base, ...overrides }
}

describe('SetupInvalidationBubble', () => {
    beforeEach(() => {
        // The primary must route in-app, never spawn the /setup/:id pop-out (the trap the Kairos
        // twin already guards against).
        vi.spyOn(window, 'open').mockImplementation(() => null)
        vi.spyOn(eventBus, 'emit')
    })
    afterEach(() => {
        vi.restoreAllMocks()
        cleanup()
    })

    it('primary "Re-draw it" routes into Mentor — and LEAVES IT PENDING', () => {
        const onResolve = vi.fn()
        const onClose   = vi.fn()
        render(<SetupInvalidationBubble msg={makeMsg()} onClose={onClose} onResolve={onResolve} />)

        fireEvent.click(screen.getByText('Re-draw it'))

        expect(eventBus.emit).toHaveBeenCalledWith(SETUP_INVALIDATION_EDIT, { setupId: 'setup-1' })
        expect(window.open).not.toHaveBeenCalled()
        expect(onResolve).toHaveBeenCalledWith('m1', { status: 'pending', outcome: 'opened' })
        expect(onClose).toHaveBeenCalled()
    })

    it('routes the stale_map card the same way', () => {
        render(
            <SetupInvalidationBubble
                msg={makeMsg({ payload: { setupId: 's9', asset: 'QQQ', event: 'stale_map' }, content: 'Levels drifted.' })}
                onResolve={vi.fn()}
            />,
        )

        fireEvent.click(screen.getByText('Re-draw it'))
        expect(eventBus.emit).toHaveBeenCalledWith(SETUP_INVALIDATION_EDIT, { setupId: 's9' })
        expect(screen.getByText(/Levels drifted · QQQ/)).toBeTruthy()
    })

    it('Dismiss resolves the card dismissed without routing', () => {
        const onResolve = vi.fn()
        render(<SetupInvalidationBubble msg={makeMsg()} onResolve={onResolve} />)

        fireEvent.click(screen.getByText('Dismiss'))

        expect(onResolve).toHaveBeenCalledWith('m1', { status: 'dismissed', outcome: 'dismissed' })
        expect(eventBus.emit).not.toHaveBeenCalledWith(SETUP_INVALIDATION_EDIT, expect.anything())
    })

    // The whole point of the four-way split: two of these events ask nothing of the user, and the
    // backend says so by omitting `actions`. A Dismiss button there would invent a decision.
    it.each(['ran_away', 'invalidated_fyi'])('renders %s as a statement — no buttons at all', (event) => {
        render(
            <SetupInvalidationBubble
                msg={makeMsg({ actions: undefined, payload: { setupId: 's2', asset: 'AMD', event } })}
                onResolve={vi.fn()}
            />,
        )

        expect(screen.queryByText('Re-draw it')).toBeNull()
        expect(screen.queryByText('Dismiss')).toBeNull()
        expect(screen.getByText(/AMD/)).toBeTruthy()      // it still SAYS the thing
    })

    it('names the dead premise, and what survives it', () => {
        render(
            <SetupInvalidationBubble
                msg={makeMsg({ payload: { setupId: 's3', asset: 'NVDA', event: 'invalidated', scenario: 'false break', remaining: 1 } })}
                onResolve={vi.fn()}
            />,
        )
        expect(screen.getByText(/false break/)).toBeTruthy()
    })

    it('falls back to a survivor count when no scenario is named', () => {
        render(
            <SetupInvalidationBubble
                msg={makeMsg({ status: 'dismissed', payload: { setupId: 's4', asset: 'NVDA', event: 'invalidated', remaining: 2 } })}
                onResolve={vi.fn()}
            />,
        )
        expect(screen.getByText(/2 still armed/)).toBeTruthy()
    })

    it('collapses to an informative chip: outcome + reason, no actions', () => {
        render(<SetupInvalidationBubble msg={makeMsg({ status: 'done', resolveOutcome: 'editing' })} onResolve={vi.fn()} />)

        expect(screen.getByText(/Opened in chat/)).toBeTruthy()
        expect(screen.getByText(/past the lower edge/)).toBeTruthy()
        expect(screen.queryByText('Re-draw it')).toBeNull()
    })

    it('still collapses legacy (pre-refactor) dismissed messages via the fallback', () => {
        render(<SetupInvalidationBubble msg={makeMsg({ dismissed: true, dismissOutcome: 'editing' })} onResolve={vi.fn()} />)
        expect(screen.getByText(/Opened in chat/)).toBeTruthy()
        expect(screen.queryByText('Re-draw it')).toBeNull()
    })

    // An event this build doesn't know still has to read as something. Whether it gets buttons is
    // the MESSAGE's call (`actions`), never the event name — the backend's own unknown-event branch
    // sends none, but a future one that does must still route.
    it('an unknown event still renders a usable card rather than blank', () => {
        render(
            <SetupInvalidationBubble
                msg={makeMsg({ payload: { setupId: 's5', asset: 'TSLA', event: 'something_new' } })}
                onResolve={vi.fn()}
            />,
        )
        expect(screen.getByText(/Needs a look · TSLA/)).toBeTruthy()
        expect(screen.getByText('Re-draw it')).toBeTruthy()
    })
})
