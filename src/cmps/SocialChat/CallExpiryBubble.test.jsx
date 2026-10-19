import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { CallExpiryBubble } from './ChatWindow.jsx'
import { eventBus } from '../../services/event-bus.service.js'

// The bubble's module (ChatWindow.jsx) pulls in axios-backed service modules at load time.
// Stub them so the tree mounts without touching the network.
vi.mock('../../services/manual/manual.service.remote', () => ({
    manualService: {},
}))

function makeMsg(overrides = {}) {
    const base = {
        id:      'm1',
        type:    'call_expiry',
        content: 'Kairos — SPY thesis expired. Edit to re-map it or delete the call.',
        payload: { callId: 'call-123', asset: 'SPY', kind: 'expired', why: 'setup drifted' },
    }
    return { ...base, ...overrides }
}

describe('CallExpiryBubble', () => {
    beforeEach(() => {
        vi.spyOn(window, 'open').mockImplementation(() => null)
        vi.spyOn(eventBus, 'emit')
    })
    afterEach(() => {
        vi.restoreAllMocks()
        cleanup()
    })

    // Kairos's edit mode — the primary's only destination — was archived on 2026-08-18. A button
    // that opens nothing is worse than none, so the card offers Dismiss alone, even when the
    // producer still sends a primary.
    it('renders Dismiss only — no primary, even when the payload carries one', () => {
        render(<CallExpiryBubble msg={makeMsg({ actions: { primary: { label: 'Edit call' } } })} onResolve={vi.fn()} />)

        expect(screen.queryByText('Edit call')).toBeNull()
        expect(screen.getByText('Dismiss')).toBeTruthy()
    })

    it('renders Dismiss only for the still-alive "expiring" (kind: edit) card too', () => {
        render(<CallExpiryBubble msg={makeMsg({ payload: { callId: 'c9', asset: 'QQQ', kind: 'edit', why: null } })} onResolve={vi.fn()} />)

        expect(screen.queryByText('Edit call')).toBeNull()
        expect(screen.getByText('Dismiss')).toBeTruthy()
    })

    it('Dismiss resolves the card dismissed without routing anywhere', () => {
        const onResolve = vi.fn()
        render(<CallExpiryBubble msg={makeMsg()} onResolve={onResolve} />)

        fireEvent.click(screen.getByText('Dismiss'))

        expect(onResolve).toHaveBeenCalledWith('m1', { status: 'dismissed', outcome: 'dismissed' })
        expect(eventBus.emit).not.toHaveBeenCalled()
        expect(window.open).not.toHaveBeenCalled()
    })

    it('collapses to an informative chip: keeps outcome + kind qualifier + reason, drops actions', () => {
        render(<CallExpiryBubble msg={makeMsg({ status: 'done', resolveOutcome: 'editing' })} onResolve={vi.fn()} />)

        expect(screen.getByText(/Opened in chat/)).toBeTruthy()   // how it resolved
        expect(screen.getByText(/expired/)).toBeTruthy()          // kind qualifier (payload kind: 'expired')
        expect(screen.getByText('setup drifted')).toBeTruthy()    // the reason survives
        expect(screen.queryByText('Edit call')).toBeNull()        // actions are gone once collapsed
    })

    it('still collapses legacy (pre-refactor) dismissed messages via the fallback', () => {
        render(<CallExpiryBubble msg={makeMsg({ dismissed: true, dismissOutcome: 'editing' })} onResolve={vi.fn()} />)
        expect(screen.getByText(/Opened in chat/)).toBeTruthy()
        expect(screen.queryByText('Edit call')).toBeNull()
    })

    it('maps the alive card (payload kind: edit) to an "expiring" qualifier', () => {
        render(<CallExpiryBubble msg={makeMsg({ status: 'dismissed', payload: { callId: 'c9', asset: 'QQQ', kind: 'edit', why: 'still valid' } })} onResolve={vi.fn()} />)
        expect(screen.getByText(/expiring/)).toBeTruthy()
    })
})
