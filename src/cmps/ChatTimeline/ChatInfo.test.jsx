import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

// INFO WHILE CHATTING on a phone (Roy, 2026-10-29): who you are talking to and what they do, then every desk Axl can take
// you to — an admin's desks for an admin only.

const auth = vi.hoisted(() => ({ value: null }))
vi.mock('../../context/AuthContext.jsx', async (orig) => {
    const { ADMIN } = await import('../../testUtils/authStub.js')
    auth.value = ADMIN
    return { ...(await orig()), useAuth: () => auth.value }
})

const { ChatInfo } = await import('./ChatInfo.jsx')
const { ADMIN, MEMBER } = await import('../../testUtils/authStub.js')
const { AGENTS } = await import('../AxlHub/agentMeta.jsx')

afterEach(() => { cleanup(); auth.value = ADMIN })

describe('ChatInfo', () => {
    it('at a desk: who it is, what it does and how to ask it — then the desks', () => {
        render(<ChatInfo floor="mentor" onClose={() => {}} />)
        expect(screen.getByRole('heading', { name: /^Talking with Mentor/ })).toBeTruthy()
        expect(screen.getByText(AGENTS.mentor.blurb)).toBeTruthy()
        expect(screen.getByText(AGENTS.mentor.hint)).toBeTruthy()
        expect(screen.getByText('Trading Desk')).toBeTruthy()
    })

    it('with Axl: the front desk; a trader is not shown the admin\'s desks', () => {
        auth.value = MEMBER
        render(<ChatInfo floor="axl" onClose={() => {}} />)
        expect(screen.getByRole('heading', { name: 'Talking with Axl' })).toBeTruthy()
        expect(screen.getByText(/Axl is the front desk/)).toBeTruthy()
        expect(screen.getByText('Research Desk')).toBeTruthy()
        expect(screen.queryByText('Strategy Desk')).toBeNull()
        expect(screen.queryByText('Aether Desk')).toBeNull()
    })

    it('closes on its × and on Escape', () => {
        const onClose = vi.fn()
        render(<ChatInfo onClose={onClose} />)
        fireEvent.click(screen.getByRole('button', { name: 'Close' }))
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(onClose).toHaveBeenCalledTimes(2)
    })
})
