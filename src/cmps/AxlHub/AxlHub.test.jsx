import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

// jsdom has no layout — useChatScroll calls scrollIntoView after every turn.
window.HTMLElement.prototype.scrollIntoView = vi.fn()

const streamAxl = vi.fn()
vi.mock('../../services/axl/axl.service.remote', () => ({
    axlService: { streamAxl: (...a) => streamAxl(...a) },
}))
vi.mock('../../customHooks/useMicInput.js', () => ({
    useMicInput: () => ({ isRecording: false, isTranscribing: false, toggle: vi.fn(), cancel: vi.fn() }),
}))
const { AxlHub, MessageBubble } = await import('./AxlHub.jsx')

// Reply with a desk hand-off, the way the server sends one: the tag is already parsed off, so the
// client sees `route` (which desk) + `routeSymbol` (the name it should open on).
function replyWith({ reply = 'Taking you to Prometheus.', route = null, routeSymbol = null, opening = null, edit = null } = {}) {
    streamAxl.mockImplementation(async (_messages, opts) => { opts.onDone?.({ reply, route, routeSymbol, opening, edit }) })
}

async function ask(text) {
    const box = screen.getByPlaceholderText(/Ask Axl anything/i)
    fireEvent.change(box, { target: { value: text } })
    await act(async () => { fireEvent.keyDown(box, { key: 'Enter' }) })
    // The reply lands, then a read-beat, then the summon animation. The second timer is only
    // SCHEDULED once the first has fired and the stream has settled, so advance in waves —
    // one long jump would run out before the nested timer exists.
    for (let i = 0; i < 4; i++) await act(async () => { vi.advanceTimersByTime(1500) })
}

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); streamAxl.mockReset() })
afterEach(() => { vi.useRealTimers(); cleanup() })

describe('AxlHub — the desk hand-off', () => {
    it('carries the routed TICKER to the desk, so the agent opens on that name', async () => {
        const onPick = vi.fn()
        render(<AxlHub user={{ fullname: 'Roy Shacked' }} onPick={onPick} />)
        replyWith({ route: 'research', routeSymbol: 'NVDA' })

        await ask("let's research nvda")

        expect(onPick).toHaveBeenCalledWith('analyst', { pipeline: 'research', symbol: 'NVDA' })
    })

    it('routes with no ticker (a scan, a portfolio) → the desk opens empty, not broken', async () => {
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)
        replyWith({ route: 'scan' })

        await ask('build me a watchlist')

        expect(onPick).toHaveBeenCalledWith('scanner', { pipeline: 'scan', symbol: null })
    })

    it('routes the user’s OWN trade to Mentor, ticker and all', async () => {
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)
        replyWith({ route: 'assist', routeSymbol: 'TSLA' })

        await ask("here's my TSLA plan, tear it apart")

        expect(onPick).toHaveBeenCalledWith('mentor', { pipeline: 'assist', symbol: 'TSLA' })
    })

    it('a CLARIFYING question (no route) keeps the user with Axl', async () => {
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)
        replyWith({ reply: 'A tradeable setup on it, or a research thesis?' })

        await ask("let's analyze nvda")

        expect(onPick).not.toHaveBeenCalled()
        expect(screen.getByText(/A tradeable setup on it, or a research thesis\?/)).toBeTruthy()
    })

    // The portfolio pipeline opens on ATLAS, not Argus. Atlas locks the mandate and only then sources
    // names (through Argus, via <screen_request>) — and it has no screener of its own, so landing on
    // Argus first asks the user to pick names with nothing to pick them against. Both entry paths —
    // a route and a button click — read the same `entryTab`, so both are pinned here.
    it('the portfolio route opens ATLAS — the mandate comes before any name', async () => {
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)
        replyWith({ route: 'portfolio' })

        await ask('I want to make 5% with 5% drawdown, across a few names')

        expect(onPick).toHaveBeenCalledWith('portfolio', { pipeline: 'portfolio', symbol: null })
    })

    it('the portfolio BUTTON opens Atlas too — same entry, same mandate-first order', async () => {
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)

        await act(async () => { fireEvent.click(screen.getByText('Build a portfolio')) })
        await act(async () => { vi.advanceTimersByTime(5000) })

        expect(onPick).toHaveBeenCalledWith('portfolio', { pipeline: 'portfolio', symbol: null })
    })

    it('a desk picked by BUTTON carries no ticker — the click says the desk, not the name', async () => {
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)

        await act(async () => { fireEvent.click(screen.getByText('Research a company')) })
        await act(async () => { vi.advanceTimersByTime(5000) })

        expect(onPick).toHaveBeenCalledWith('analyst', { pipeline: 'research', symbol: null })
    })
})

// Reopening something the user ALREADY has, as opposed to opening a desk on a blank page. The bug:
// "show me my coverage" then "edit that one" routed to `research`, and Prometheus began a second
// thesis on a name it already covered — because a desk key was the only thing a hand-off could say.
describe('AxlHub — the edit hand-off', () => {
    it('carries the ITEM to the desk that owns it, not just the desk', async () => {
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)
        replyWith({ reply: 'Reopening it in Prometheus.', edit: { kind: 'coverage', ref: 'cov_9', desk: 'research' } })

        await ask('edit that ZTS coverage')

        expect(onPick).toHaveBeenCalledWith('analyst', {
            pipeline: 'research', symbol: null, edit: { kind: 'coverage', ref: 'cov_9', desk: 'research' },
        })
    })

    // A call is EDITED in Kairos, but the trading desk ENTERS at Argus. The hand-off still names the
    // desk (the pipeline crumb needs it) — the host is what picks the tab from the item.
    it('a call edit travels under the trading desk, item and all', async () => {
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)
        replyWith({ reply: 'Opening it in Kairos.', edit: { kind: 'call', ref: 'c1', desk: 'trade' } })

        await ask('change the entry on my TSLA call')

        expect(onPick).toHaveBeenCalledWith('scanner', {
            pipeline: 'trade', symbol: null, edit: { kind: 'call', ref: 'c1', desk: 'trade' },
        })
    })

    // Atlas is both the portfolio desk's entry AND where a book is edited, so the two hand-offs look
    // identical from the tab alone. `edit` is the only thing that separates "take the mandate again"
    // from "re-work the plan you already have" — it has to survive the trip.
    it('a book edit is distinguishable from entering the portfolio desk', async () => {
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)
        replyWith({ reply: 'Opening Core in Atlas.', edit: { kind: 'portfolio', ref: 'p1', desk: 'portfolio' } })

        await ask('re-work my Core book')

        expect(onPick).toHaveBeenCalledWith('portfolio', {
            pipeline: 'portfolio', symbol: null, edit: { kind: 'portfolio', ref: 'p1', desk: 'portfolio' },
        })
    })

    it('a plain route still carries NO edit — new work must not reopen anything', async () => {
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)
        replyWith({ route: 'research', routeSymbol: 'NVDA' })

        await ask("let's research nvda")

        expect(onPick).toHaveBeenCalledWith('analyst', { pipeline: 'research', symbol: 'NVDA' })
        expect(onPick.mock.calls[0][1].edit).toBeUndefined()
    })
})

describe('AxlHub — the opening turn that travels with them', () => {
    // THE hand-off. Axl works out which desk, and the sentence the user said goes with them so the
    // desk opens on the job. It replaced an `objectives` record (2026-08-05) that carried the goal as
    // structured fields, showed it back in a chip, and outlived the job it described.
    it('carries the opening to the desk alongside the route', async () => {
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)
        replyWith({ reply: 'Taking you to Atlas.', route: 'portfolio', opening: 'I want 5% profit.' })

        await ask('several positions')

        expect(onPick).toHaveBeenCalledWith('portfolio', {
            pipeline: 'portfolio', symbol: null, opening: 'I want 5% profit.',
        })
    })

    it('a route with no opening hands over nothing extra — the desk asks as it always did', async () => {
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)
        replyWith({ reply: 'Off to Kairos.', route: 'trade', routeSymbol: 'TSLA' })

        await ask('find me a trade on tsla')

        // The trade desk ENTERS at Argus, hence 'scanner' rather than 'kairos'.
        expect(onPick).toHaveBeenCalledWith('scanner', { pipeline: 'trade', symbol: 'TSLA' })
        expect(onPick.mock.calls[0][1].opening).toBeUndefined()
    })

    it('an opening on a turn that does not route goes nowhere', async () => {
        // The server already refuses this pairing; the client must not invent a desk for it either.
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)
        replyWith({ reply: 'One position or several?', opening: 'I want 5% profit.' })

        await ask('i want 5% profit')

        expect(onPick).not.toHaveBeenCalled()
    })
})

// Thinking / working / fetching are ONE state. Axl's bubble no longer draws it at all — the mark
// renders once below the thread (see ToolStatusChip.test.jsx). What's left here is the bubble's own
// job: don't leave an empty bordered box where the wait used to be.
describe('AxlHub — the working indicator', () => {
    it('a wordless streaming turn draws nothing — the mark lives below the thread', () => {
        const { container } = render(<MessageBubble msg={{ role: 'assistant', streaming: true, content: '' }} />)

        expect(container.innerHTML).toBe('')
    })

    it('a wordless turn that DID reason shows it, without the bubble chrome', () => {
        const { container } = render(<MessageBubble msg={{ role: 'assistant', streaming: true, content: '', reasoning: 'which desk owns this' }} />)

        expect(container.querySelector('.axl-hub__bubble--pending')).toBeTruthy()
        expect(container.querySelector('.chat-reasoning')).toBeTruthy()
    })

    it('once words land the bubble comes back', () => {
        const { container } = render(<MessageBubble msg={{ role: 'assistant', streaming: true, content: 'Taking you to Prometheus.' }} />)

        expect(container.querySelector('.axl-hub__bubble--pending')).toBe(null)
        expect(container.querySelector('.axl-hub__bubble--assistant')).toBeTruthy()
    })
})
