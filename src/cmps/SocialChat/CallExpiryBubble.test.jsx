import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { CallExpiryBubble } from './ChatWindow.jsx'
import { eventBus, CALL_EXPIRY_EDIT } from '../../services/event-bus.service.js'

// The bubble's module (ChatWindow.jsx) pulls in axios-backed service modules at load time.
// Stub them so the tree mounts without touching the network; kairosService.deleteCall is a
// spy so the Delete path can be asserted.
vi.mock('../../services/kairos/kairos.service.remote', () => ({
    kairosService: { deleteCall: vi.fn().mockResolvedValue({}) },
}))
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
        // The bug this guards against: Edit must NOT spawn the /call/:id pop-out window.
        vi.spyOn(window, 'open').mockImplementation(() => null)
        vi.spyOn(eventBus, 'emit')
    })
    afterEach(() => {
        vi.restoreAllMocks()
        cleanup()
    })

    it('routes "Edit call" to Kairos in-app edit mode, not the pop-out window', () => {
        const onDismiss = vi.fn()
        const onClose   = vi.fn()
        render(<CallExpiryBubble msg={makeMsg()} onClose={onClose} onDismiss={onDismiss} />)

        fireEvent.click(screen.getByText('Edit call'))

        expect(eventBus.emit).toHaveBeenCalledWith(CALL_EXPIRY_EDIT, { callId: 'call-123' })
        expect(window.open).not.toHaveBeenCalled()      // the regression under test
        expect(onDismiss).toHaveBeenCalledWith('m1', 'editing')
        expect(onClose).toHaveBeenCalled()               // dismisses the mobile chat drawer
    })

    it('routes the still-alive "expiring" (kind: edit) card the same way', () => {
        const onDismiss = vi.fn()
        render(
            <CallExpiryBubble
                msg={makeMsg({ payload: { callId: 'c9', asset: 'QQQ', kind: 'edit', why: null } })}
                onDismiss={onDismiss}
            />,
        )

        fireEvent.click(screen.getByText('Edit call'))

        expect(eventBus.emit).toHaveBeenCalledWith(CALL_EXPIRY_EDIT, { callId: 'c9' })
        expect(window.open).not.toHaveBeenCalled()
    })

    it('tolerates a missing onClose (desktop, no drawer to close)', () => {
        const onDismiss = vi.fn()
        render(<CallExpiryBubble msg={makeMsg()} onDismiss={onDismiss} />)

        expect(() => fireEvent.click(screen.getByText('Edit call'))).not.toThrow()
        expect(eventBus.emit).toHaveBeenCalledWith(CALL_EXPIRY_EDIT, { callId: 'call-123' })
    })

    it('Delete removes the call outright and never opens the pop-out', async () => {
        const { kairosService } = await import('../../services/kairos/kairos.service.remote')
        const onDismiss = vi.fn()
        render(<CallExpiryBubble msg={makeMsg()} onDismiss={onDismiss} />)

        fireEvent.click(screen.getByText('Delete'))

        expect(onDismiss).toHaveBeenCalledWith('m1', 'deleted')
        expect(kairosService.deleteCall).toHaveBeenCalledWith('call-123')
        expect(eventBus.emit).not.toHaveBeenCalledWith(CALL_EXPIRY_EDIT, expect.anything())
        expect(window.open).not.toHaveBeenCalled()
    })

    it('collapses to an informative chip: keeps outcome + kind qualifier + reason, drops actions', () => {
        render(<CallExpiryBubble msg={makeMsg({ dismissed: true, dismissOutcome: 'editing' })} onDismiss={vi.fn()} />)

        expect(screen.getByText(/Opened in chat/)).toBeTruthy()   // how it resolved
        expect(screen.getByText(/expired/)).toBeTruthy()          // kind qualifier (payload kind: 'expired')
        expect(screen.getByText('setup drifted')).toBeTruthy()    // the reason survives (Option 1 parity)
        expect(screen.queryByText('Edit call')).toBeNull()        // actions are gone once collapsed
    })

    it('maps the alive card (payload kind: edit) to an "expiring" qualifier', () => {
        render(<CallExpiryBubble msg={makeMsg({ dismissed: true, dismissOutcome: 'dismissed', payload: { callId: 'c9', asset: 'QQQ', kind: 'edit', why: 'still valid' } })} onDismiss={vi.fn()} />)
        expect(screen.getByText(/expiring/)).toBeTruthy()
    })
})
