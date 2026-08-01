import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MarketBriefOfferBubble } from './ChatWindow.jsx'

// The bubble's module (ChatWindow.jsx) pulls in axios-backed service modules at load time.
// Stub them so the tree mounts without touching the network.
vi.mock('../../services/manual/manual.service.remote', () => ({
    manualService: {},
}))

const msg = {
    id:      'm1',
    type:    'market_brief_offer',
    content: "Want today's market brief?",
    actions: { primary: { label: 'Get the brief' }, dismiss: true },
    payload: { day: '2026-08-03' },
}

describe('MarketBriefOfferBubble', () => {
    afterEach(cleanup)

    it('asks for the brief and only then marks the card done', async () => {
        const onResolve = vi.fn()
        const request   = vi.fn().mockResolvedValue({ ok: true })
        render(<MarketBriefOfferBubble msg={msg} onResolve={onResolve} _request={request} />)

        fireEvent.click(screen.getByText('Get the brief'))

        expect(request).toHaveBeenCalledTimes(1)
        await waitFor(() => expect(onResolve).toHaveBeenCalledWith('m1', { status: 'done', outcome: 'delivered' }))
    })

    it('a failed request leaves the card pressable — a consumed offer with no brief is unrecoverable', async () => {
        const onResolve = vi.fn()
        const request   = vi.fn().mockRejectedValue(new Error('502'))
        render(<MarketBriefOfferBubble msg={msg} onResolve={onResolve} _request={request} />)

        fireEvent.click(screen.getByText('Get the brief'))

        await waitFor(() => expect(screen.getByText(/try again/i)).toBeTruthy())
        expect(onResolve).not.toHaveBeenCalled()
        expect(screen.getByText('Get the brief').disabled).toBe(false)
    })

    it('does not fire twice while a brief is being written', async () => {
        let release
        const request = vi.fn(() => new Promise(res => { release = res }))
        render(<MarketBriefOfferBubble msg={msg} onResolve={vi.fn()} _request={request} />)

        fireEvent.click(screen.getByText('Get the brief'))
        // Writing a stale brief is a live model turn — several seconds of a button that still looks
        // pressable is exactly how a user ends up with three briefs.
        const btn = await screen.findByText('Writing…')
        expect(btn.disabled).toBe(true)
        fireEvent.click(btn)
        expect(request).toHaveBeenCalledTimes(1)

        release({ ok: true })
    })

    it('dismiss resolves without ever asking for a brief', () => {
        const onResolve = vi.fn()
        const request   = vi.fn()
        render(<MarketBriefOfferBubble msg={msg} onResolve={onResolve} _request={request} />)

        fireEvent.click(screen.getByText('Dismiss'))

        expect(request).not.toHaveBeenCalled()
        expect(onResolve).toHaveBeenCalledWith('m1', { status: 'dismissed', outcome: 'dismissed' })
    })
})
