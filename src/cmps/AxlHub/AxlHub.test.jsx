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
const { AxlHub } = await import('./AxlHub.jsx')

// Reply with a desk hand-off, the way the server sends one: the tag is already parsed off, so the
// client sees `route` (which desk) + `routeSymbol` (the name it should open on).
function replyWith({ reply = 'Taking you to Prometheus.', route = null, routeSymbol = null } = {}) {
    streamAxl.mockImplementation(async (_messages, opts) => { opts.onDone?.({ reply, route, routeSymbol }) })
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

    it('a desk picked by BUTTON carries no ticker — the click says the desk, not the name', async () => {
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)

        await act(async () => { fireEvent.click(screen.getByText('Research a company')) })
        await act(async () => { vi.advanceTimersByTime(5000) })

        expect(onPick).toHaveBeenCalledWith('analyst', { pipeline: 'research', symbol: null })
    })
})
