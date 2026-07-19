import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { CallManageBubble } from './ChatWindow.jsx'

// ChatWindow pulls in axios-backed service modules at load time — stub them so the tree mounts.
vi.mock('../../services/kairos/kairos.service.remote', () => ({
    kairosService: { deleteCall: vi.fn().mockResolvedValue({}) },
}))
vi.mock('../../services/manual/manual.service.remote', () => ({ manualService: {} }))

function makeMsg(overrides = {}) {
    const base = {
        id:      'm1',
        type:    'call_manage',
        content: 'Kairos wants to manage AVGO.',
        payload: { callId: 'c1', asset: 'AVGO', verdict: 'move_stop', read: 'stop is too tight' },
    }
    return { ...base, ...overrides }
}

describe('CallManageBubble resolved chip', () => {
    afterEach(cleanup)

    it('keeps the verdict qualifier + reason when resolved', () => {
        render(<CallManageBubble msg={makeMsg({ dismissed: true, dismissOutcome: 'opened' })} onDismiss={vi.fn()} />)

        expect(screen.getByText(/Opened/)).toBeTruthy()             // how it resolved
        expect(screen.getByText(/move the stop/)).toBeTruthy()      // verdict qualifier (mapped copy)
        expect(screen.getByText('stop is too tight')).toBeTruthy()  // reason
    })

    it('falls back to the raw verdict when the copy map has no entry', () => {
        render(
            <CallManageBubble
                msg={makeMsg({ dismissed: true, dismissOutcome: 'dismissed', payload: { callId: 'c1', asset: 'AVGO', verdict: 'scale_in', read: 'x' } })}
                onDismiss={vi.fn()}
            />,
        )
        expect(screen.getByText(/scale_in/)).toBeTruthy()
    })

    it('active card shows the same verb in its header', () => {
        render(<CallManageBubble msg={makeMsg()} onDismiss={vi.fn()} />)
        expect(screen.getByText(/Manage AVGO/)).toBeTruthy()
        expect(screen.getByText(/move the stop/)).toBeTruthy()
    })
})
