import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { CallExpiryBubble } from './ChatWindow.jsx'
import { eventBus, CALL_EXPIRY_EDIT } from '../../services/event-bus.service.js'

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
        // The bug this guards against: the primary must NOT spawn the /call/:id pop-out window.
        vi.spyOn(window, 'open').mockImplementation(() => null)
        vi.spyOn(eventBus, 'emit')
    })
    afterEach(() => {
        vi.restoreAllMocks()
        cleanup()
    })

    it('primary "Edit call" routes to Kairos in-app edit mode + resolves the card done', () => {
        const onResolve = vi.fn()
        const onClose   = vi.fn()
        render(<CallExpiryBubble msg={makeMsg()} onClose={onClose} onResolve={onResolve} />)

        fireEvent.click(screen.getByText('Edit call'))

        expect(eventBus.emit).toHaveBeenCalledWith(CALL_EXPIRY_EDIT, { callId: 'call-123' })
        expect(window.open).not.toHaveBeenCalled()      // the regression under test
        expect(onResolve).toHaveBeenCalledWith('m1', { status: 'done', outcome: 'editing' })
        expect(onClose).toHaveBeenCalled()               // dismisses the mobile chat drawer
    })

    it('routes the still-alive "expiring" (kind: edit) card the same way', () => {
        const onResolve = vi.fn()
        render(
            <CallExpiryBubble
                msg={makeMsg({ payload: { callId: 'c9', asset: 'QQQ', kind: 'edit', why: null } })}
                onResolve={onResolve}
            />,
        )

        fireEvent.click(screen.getByText('Edit call'))

        expect(eventBus.emit).toHaveBeenCalledWith(CALL_EXPIRY_EDIT, { callId: 'c9' })
        expect(window.open).not.toHaveBeenCalled()
    })

    it('Dismiss resolves the card dismissed without routing', () => {
        const onResolve = vi.fn()
        render(<CallExpiryBubble msg={makeMsg()} onResolve={onResolve} />)

        fireEvent.click(screen.getByText('Dismiss'))

        expect(onResolve).toHaveBeenCalledWith('m1', { status: 'dismissed', outcome: 'dismissed' })
        expect(eventBus.emit).not.toHaveBeenCalledWith(CALL_EXPIRY_EDIT, expect.anything())
    })

    it('tolerates a missing onClose (desktop, no drawer to close)', () => {
        const onResolve = vi.fn()
        render(<CallExpiryBubble msg={makeMsg()} onResolve={onResolve} />)

        expect(() => fireEvent.click(screen.getByText('Edit call'))).not.toThrow()
        expect(eventBus.emit).toHaveBeenCalledWith(CALL_EXPIRY_EDIT, { callId: 'call-123' })
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
