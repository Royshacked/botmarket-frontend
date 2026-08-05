import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MarketBriefOfferBubble } from './ChatWindow.jsx'
import { eventBus, MARKET_BRIEF_OPEN } from '../../services/event-bus.service'

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

    it('routes to Axl instead of asking for the brief here — the brief belongs in his thread', () => {
        const onResolve = vi.fn()
        const onClose    = vi.fn()
        const heard      = vi.fn()
        const off        = eventBus.on(MARKET_BRIEF_OPEN, heard)

        render(<MarketBriefOfferBubble msg={msg} onClose={onClose} onResolve={onResolve} />)
        fireEvent.click(screen.getByText('Get the brief'))

        expect(heard).toHaveBeenCalledTimes(1)
        expect(heard.mock.calls[0][0]).toEqual({ day: '2026-08-03' })
        expect(onClose).toHaveBeenCalled()
        off()
    })

    // The card is consumed on the click, not on a delivery it no longer performs: what it promises
    // is to take the user to the brief, and it has.
    it('resolves as read the moment it routes', () => {
        const onResolve = vi.fn()
        render(<MarketBriefOfferBubble msg={msg} onResolve={onResolve} />)

        fireEvent.click(screen.getByText('Get the brief'))

        expect(onResolve).toHaveBeenCalledWith('m1', { status: 'done', outcome: 'opened' })
    })

    // A card resolved before the brief moved into Axl still reads as done, rather than showing a
    // raw outcome key to a user scrolling back through the week.
    it('an already-resolved card renders its outcome, old wording included', () => {
        const done = { ...msg, id: 'm2', status: 'done', resolveOutcome: 'delivered' }
        render(<MarketBriefOfferBubble msg={done} onResolve={vi.fn()} />)

        // The chip renders the outcome alongside the asset in one heading, so match on content.
        expect(screen.getByText(/✓ Sent/)).toBeTruthy()
    })

    it('dismiss resolves without routing anywhere', () => {
        const onResolve = vi.fn()
        const heard     = vi.fn()
        const off       = eventBus.on(MARKET_BRIEF_OPEN, heard)

        render(<MarketBriefOfferBubble msg={msg} onResolve={onResolve} />)
        fireEvent.click(screen.getByText('Dismiss'))

        expect(heard).not.toHaveBeenCalled()
        expect(onResolve).toHaveBeenCalledWith('m1', { status: 'dismissed', outcome: 'dismissed' })
        off()
    })
})
