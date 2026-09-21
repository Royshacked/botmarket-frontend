import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { SetupSharedBubble, ChatWindow } from './ChatWindow.jsx'
import { eventBus, SETUP_SHARED_OPEN } from '../../services/event-bus.service.js'

vi.mock('../../services/manual/manual.service.remote', () => ({ manualService: {} }))
vi.mock('../../services/mentor/mentor.service.remote', () => ({ mentorService: { listSetups: vi.fn(async () => []) } }))
const getQuote = vi.fn(async () => ({ price: 191.05 }))
vi.mock('../../services/market/market.service.remote', () => ({ marketService: { getQuote: (...a) => getQuote(...a) } }))

// A setup ANOTHER USER sent. What is pinned: the recipient gets "Open in Mentor" and it emits the
// blueprint (a COPY — never an id); the sender's own view is actionless; the price line degrades to
// drawn-only when there is no quote; the share button appears only on human DMs.

const BLUEPRINT = {
    version: 1, drawn_at: 1_700_000_000_000,
    from: { userId: 'u_roy', username: 'roy', fullname: 'Roy' },
    asset: 'NVDA', direction: 'long', trade_mode: 'smc', timeframe: '1hr', type: 'swing',
    conditions: [{ id: 'c1', text: 'holds above VWAP' }],
    scenarios: [{ id: 's1', entry_zones: [{ lower: 178, upper: 180 }], stop_zones: [{ lower: 173, upper: 174 }], tp_zones: [{ lower: 196, upper: 200 }], conditions: [] }],
}

function makeMsg(overrides = {}) {
    return {
        id: 'm1', type: 'setup_shared', senderId: 'u_roy', status: 'pending',
        content: 'wait for the retest',
        actions: { primary: { label: 'Open in Mentor', resolvesOn: 'open' }, dismiss: true },
        payload: { blueprint: BLUEPRINT, note: 'wait for the retest', drawn_price: 187.5, rr: 3.2, source_setup_id: 'setup_NVDA_1' },
        ...overrides,
    }
}

describe('SetupSharedBubble', () => {
    beforeEach(() => { vi.spyOn(eventBus, 'emit') })
    afterEach(() => { vi.restoreAllMocks(); getQuote.mockClear(); cleanup() })

    it('the recipient opens it in Mentor — the card completes on open and carries the blueprint, not an id', () => {
        const onResolve = vi.fn()
        const onClose   = vi.fn()
        render(<SetupSharedBubble msg={makeMsg()} onClose={onClose} onResolve={onResolve} />)

        expect(screen.getByText(/Roy shared a setup/)).toBeTruthy()
        expect(screen.getByText(/Entry 178 – 180/)).toBeTruthy()
        expect(screen.getByText(/“wait for the retest”/)).toBeTruthy()

        fireEvent.click(screen.getByText('Open in Mentor'))

        expect(onResolve).toHaveBeenCalledWith('m1', { status: 'done', outcome: 'opened' })
        expect(onClose).toHaveBeenCalled()
        const [, payload] = eventBus.emit.mock.calls.find(([ev]) => ev === SETUP_SHARED_OPEN)
        expect(payload.blueprint).toEqual(BLUEPRINT)
        expect(payload.note).toBe('wait for the retest')
        expect(payload.drawnPrice).toBe(187.5)
        expect(payload).not.toHaveProperty('setupId')
    })

    it('the SENDER sees their own card as a statement — no buttons, "You shared"', () => {
        render(<SetupSharedBubble msg={makeMsg()} mine onResolve={vi.fn()} />)
        expect(screen.getByText(/You shared a setup/)).toBeTruthy()
        expect(screen.queryByText('Open in Mentor')).toBeNull()
        expect(screen.queryByText('Dismiss')).toBeNull()
        // …and it does not go quoting the market for a plan the sender already knows.
        expect(getQuote).not.toHaveBeenCalled()
    })

    it('shows the price when it was sent and, once quoted, the move since', async () => {
        render(<SetupSharedBubble msg={makeMsg()} onResolve={vi.fn()} />)
        expect(screen.getByText(/Drawn at 187\.50/)).toBeTruthy()
        await waitFor(() => expect(screen.getByText(/now 191\.05 \(\+1\.9%\)/)).toBeTruthy())
        expect(getQuote).toHaveBeenCalledWith('NVDA')
    })

    it('a failed quote leaves the drawn price alone; no drawn price hides the line', async () => {
        getQuote.mockRejectedValueOnce(new Error('down'))
        render(<SetupSharedBubble msg={makeMsg()} onResolve={vi.fn()} />)
        expect(screen.getByText(/Drawn at 187\.50/)).toBeTruthy()
        await waitFor(() => expect(getQuote).toHaveBeenCalled())
        expect(screen.queryByText(/now /)).toBeNull()
        cleanup()

        getQuote.mockRejectedValueOnce(new Error('down'))
        render(<SetupSharedBubble msg={makeMsg({ payload: { blueprint: BLUEPRINT, note: null, drawn_price: null, rr: null } })} onResolve={vi.fn()} />)
        expect(screen.queryByText(/Drawn at/)).toBeNull()
    })

    // A card already opened or dismissed shows what the sender saw and nothing more — a long DM
    // history must not re-quote every plan ever shared on every scroll.
    it('does not quote the market for a card that is no longer pending', () => {
        render(<SetupSharedBubble msg={makeMsg({ status: 'done', resolvedAt: 1, resolveOutcome: 'opened' })} onResolve={vi.fn()} />)
        expect(getQuote).not.toHaveBeenCalled()
    })
})

describe('ChatWindow — the share button', () => {
    // jsdom has no scrollIntoView; the window scrolls to the newest message on mount.
    beforeEach(() => { Element.prototype.scrollIntoView = vi.fn() })
    afterEach(() => { cleanup(); delete Element.prototype.scrollIntoView })
    const base = { messages: [], currentUserId: 'me', loading: false, hasMore: false, onSend: vi.fn(), onSendSetup: vi.fn(), onLoadMore: vi.fn(), onResolveMessage: vi.fn() }

    it('is offered on a human DM', () => {
        render(<ChatWindow {...base} conversation={{ id: 'c1', participants: ['me', 'u_marce'] }} />)
        expect(screen.getByLabelText('Share a setup')).toBeTruthy()
    })

    it('is NOT offered on the Axl thread — a bot cannot open one', () => {
        render(<ChatWindow {...base} conversation={{ id: 'c2', participants: ['me', 'axl'] }} />)
        expect(screen.queryByLabelText('Share a setup')).toBeNull()
    })
})
