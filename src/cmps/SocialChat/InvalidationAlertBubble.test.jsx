import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { InvalidationAlertBubble } from './ChatWindow.jsx'

// The bubble's module (ChatWindow.jsx) pulls in axios-backed service modules at load time.
// Stub them so the tree mounts without touching the network.
vi.mock('../../services/manual/manual.service.remote', () => ({
    manualService: {},
}))

// The producer still sends a primary ("Edit in chat"); the card must not offer it — the idea chat
// it opened is gone.
function makeMsg(overrides = {}) {
    const base = {
        id:      'm1',
        type:    'invalidation_alert',
        actions: { primary: { label: 'Edit in chat' }, dismiss: true },
        payload: { ideaId: 'idea-1', asset: 'NVDA', status: 'fired', reason: 'Closed below the level', inPosition: false },
    }
    return { ...base, ...overrides }
}

describe('InvalidationAlertBubble', () => {
    afterEach(cleanup)

    it('renders Dismiss only — no primary, even when the message carries one', () => {
        render(<InvalidationAlertBubble msg={makeMsg()} onResolve={vi.fn()} />)
        expect(screen.queryByText('Edit in chat')).toBeNull()
        expect(screen.getAllByRole('button')).toHaveLength(1)
        expect(screen.getByText('Dismiss')).toBeTruthy()
    })

    it('Dismiss resolves the card as dismissed', () => {
        const onResolve = vi.fn()
        render(<InvalidationAlertBubble msg={makeMsg()} onResolve={onResolve} />)
        fireEvent.click(screen.getByText('Dismiss'))
        expect(onResolve).toHaveBeenCalledWith('m1', { status: 'dismissed', outcome: 'dismissed' })
    })
})
