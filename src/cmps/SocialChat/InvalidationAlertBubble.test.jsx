import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { InvalidationAlertBubble } from './ChatWindow.jsx'

// ChatWindow pulls in axios-backed service modules at load time — stub them so the tree mounts.
vi.mock('../../services/kairos/kairos.service.remote', () => ({
    kairosService: { deleteCall: vi.fn().mockResolvedValue({}) },
}))
vi.mock('../../services/manual/manual.service.remote', () => ({ manualService: {} }))

function makeMsg(overrides = {}) {
    const base = {
        id:      'm1',
        type:    'invalidation_alert',
        content: 'Invalidation on AVGO.',
        payload: { reason: 'entry envelope broke', asset: 'AVGO', status: 'fired', inPosition: true, ideaId: 'i1' },
    }
    return { ...base, ...overrides }
}

describe('InvalidationAlertBubble resolved chip', () => {
    afterEach(cleanup)

    it('keeps the fired/drifting qualifier + reason when resolved', () => {
        render(<InvalidationAlertBubble msg={makeMsg({ dismissed: true, dismissOutcome: 'closing' })} onDismiss={vi.fn()} />)

        expect(screen.getByText(/Closing/)).toBeTruthy()             // how it resolved
        expect(screen.getByText(/fired/)).toBeTruthy()               // kind qualifier
        expect(screen.getByText('entry envelope broke')).toBeTruthy()// reason
    })

    it('shows the drifting qualifier for a pre-entry drift nudge', () => {
        render(
            <InvalidationAlertBubble
                msg={makeMsg({ dismissed: true, dismissOutcome: 'dismissed', payload: { reason: 'price running away', asset: 'TSLA', status: 'drifting', inPosition: false, ideaId: 'i2' } })}
                onDismiss={vi.fn()}
            />,
        )
        expect(screen.getByText(/drifting/)).toBeTruthy()
        expect(screen.getByText('price running away')).toBeTruthy()
    })
})
