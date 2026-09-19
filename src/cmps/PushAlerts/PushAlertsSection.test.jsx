import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'

const push = vi.hoisted(() => ({
    pushStatus:  vi.fn(),
    enablePush:  vi.fn(),
    disablePush: vi.fn(),
}))
vi.mock('../../services/push.service.js', () => push)

const toasts = vi.hoisted(() => ({ showErrorMsg: vi.fn(), showSuccessMsg: vi.fn() }))
vi.mock('../../services/event-bus.service', () => toasts)

import { PushAlertsSection } from './PushAlertsSection.jsx'

// One switch per device. The section's job is to read the browser's state honestly and to turn
// the one action into the one call — the browser and the backend do the rest.

beforeEach(() => { vi.clearAllMocks() })
afterEach(cleanup)

describe('PushAlertsSection', () => {
    it('reads the device state and offers the opposite action', async () => {
        push.pushStatus.mockResolvedValue('off')
        render(<PushAlertsSection />)
        expect(await screen.findByText('Off')).toBeTruthy()
        expect(screen.getByRole('button', { name: /turn on/i })).toBeTruthy()
    })

    it('turning on calls enablePush and reflects the new state', async () => {
        push.pushStatus.mockResolvedValue('off')
        push.enablePush.mockResolvedValue({})
        render(<PushAlertsSection />)
        fireEvent.click(await screen.findByRole('button', { name: /turn on/i }))
        await waitFor(() => expect(push.enablePush).toHaveBeenCalledTimes(1))
        expect(await screen.findByText('On')).toBeTruthy()
        expect(screen.getByRole('button', { name: /turn off/i })).toBeTruthy()
        expect(toasts.showSuccessMsg).toHaveBeenCalled()
    })

    it('turning off calls disablePush', async () => {
        push.pushStatus.mockResolvedValue('on')
        push.disablePush.mockResolvedValue()
        render(<PushAlertsSection />)
        fireEvent.click(await screen.findByRole('button', { name: /turn off/i }))
        await waitFor(() => expect(push.disablePush).toHaveBeenCalledTimes(1))
        expect(await screen.findByText('Off')).toBeTruthy()
    })

    it('a refused permission is told, not swallowed, and the state is re-read', async () => {
        push.pushStatus.mockResolvedValueOnce('off').mockResolvedValueOnce('denied')
        push.enablePush.mockRejectedValue(new Error('Notifications were not allowed'))
        render(<PushAlertsSection />)
        fireEvent.click(await screen.findByRole('button', { name: /turn on/i }))
        await waitFor(() => expect(toasts.showErrorMsg).toHaveBeenCalledWith('Notifications were not allowed'))
        expect(await screen.findByText('Blocked')).toBeTruthy()
        expect(screen.queryByRole('button')).toBeNull()
    })

    it('an unsupported browser gets the explanation and no button', async () => {
        push.pushStatus.mockResolvedValue('unsupported')
        render(<PushAlertsSection />)
        expect(await screen.findByText('Unavailable')).toBeTruthy()
        expect(screen.queryByRole('button')).toBeNull()
    })
})
