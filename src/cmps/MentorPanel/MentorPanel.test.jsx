import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'

// jsdom implements no layout, so scrollIntoView is missing entirely. useChatScroll calls it after
// every turn — without this stub the panel throws before any assertion runs.
window.HTMLElement.prototype.scrollIntoView = vi.fn()

// Service modules reach for axios/localStorage at import time — stub the whole surface so the
// tree mounts and every call is observable.
const armSetup      = vi.fn().mockResolvedValue({ id: 's1', status: 'looking' })
const generateSetup = vi.fn().mockResolvedValue({ id: 's1', asset: 'NVDA', status: 'waiting' })
const sendStream    = vi.fn().mockResolvedValue(undefined)

vi.mock('../../services/mentor/mentor.service.remote.js', () => ({
    mentorService: { sendStream: (...a) => sendStream(...a), generateSetup: (...a) => generateSetup(...a), armSetup: (...a) => armSetup(...a), updateSetup: vi.fn().mockResolvedValue({}), listSetups: vi.fn().mockResolvedValue([]) },
    SETUPS_CHANGED: 'mentor-setups-changed',
}))
vi.mock('../../services/threads/threads.service.remote.js', () => ({
    threadsService: { saveDraft: vi.fn(), linkThread: vi.fn(), getThread: vi.fn() },
    newThreadId: () => 't1',
}))
vi.mock('../../customHooks/useMicInput.js', () => ({
    useMicInput: () => ({ isRecording: false, isTranscribing: false, toggle: vi.fn(), cancel: vi.fn() }),
}))

const { MentorPanel } = await import('./MentorPanel.jsx')

const SETUP = {
    asset: 'NVDA', direction: 'long', type: 'swing', trade_mode: 'smc', timeframe: '4hr',
    thesis: 'Sweep and reclaim of the 199 shelf.',
    watch: [{ kind: 'structure', look_for: 'CHoCH up on the 1hr', timeframe: '1hr', weight: 'primary' }],
    entry_zones: [{ id: 'ez1', lower: 199, upper: 201, quantity: 110 }],
    stop_zones:  [{ id: 'sz1', lower: 196.5, upper: 197.9, quantity: 110 }],
    tp_zones:    [{ id: 'tp1', lower: 210, upper: 211, quantity: 110 }],
    rr: 2.1, quantity: 110,
}

const ACCOUNTS = [{ id: 'a1', broker: 'paper', name: 'Paper' }]
const props = (over = {}) => ({
    availableAccounts: ACCOUNTS, selectedAccounts: ['a1'], mainAccountId: 'a1', ...over,
})

// Drive one agent turn by invoking the onDone the panel handed to the stream, then wait for the
// stream to actually close — _send bails while isLoading, so without this a following turn is
// silently dropped and the assertions read a stale call list.
async function runTurn(done) {
    const before = sendStream.mock.calls.length
    sendStream.mockImplementationOnce(async (_history, opts) => { opts.onDone?.(done) })
    const box = screen.getByRole('textbox')
    fireEvent.change(box, { target: { value: 'long NVDA swing' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    await waitFor(() => expect(sendStream.mock.calls.length).toBe(before + 1))
    await waitFor(() => expect(screen.getByRole('textbox').disabled).toBe(false))
}

beforeEach(() => { vi.clearAllMocks() })
afterEach(cleanup)

describe('MentorPanel', () => {
    it('shows the intro with suggestions and no worksheet until there is a setup', () => {
        render(<MentorPanel {...props()} />)
        expect(screen.getByText(/I want to buy NVDA on a pullback/)).toBeTruthy()
        expect(screen.queryByRole('button', { name: /Generate setup/ })).toBeNull()
    })

    it('carries the draft and coverage back to the server as chatState', async () => {
        render(<MentorPanel {...props()} />)
        await runTurn({ reply: 'ok', setup: SETUP, coverage: ['markets'], readiness: { ready: true, missing: [] } })

        // The next turn must echo the settled draft — Mentor's <setup> block is stripped from the
        // visible history, so without this a thin re-emit would wipe the zones.
        await runTurn({ reply: 'ok2', coverage: ['markets', 'technicals'] })
        const opts = sendStream.mock.calls[1][1]
        expect(opts.chatState.draft.asset).toBe('NVDA')
        expect(opts.chatState.coverage).toEqual(['markets'])
        expect(opts.chatState.active_asset).toBe('NVDA')
    })

    it('never sends currentPhase — Mentor has no phases', async () => {
        render(<MentorPanel {...props()} />)
        await runTurn({ reply: 'ok', setup: SETUP, coverage: ['markets'] })
        expect(sendStream.mock.calls[0][1]).not.toHaveProperty('currentPhase')
    })

    it('renders coverage chips as the setup fills in', async () => {
        render(<MentorPanel {...props()} />)
        await runTurn({ reply: 'ok', setup: SETUP, coverage: ['markets', 'technicals'] })
        await waitFor(() => expect(screen.getByTitle(/^Markets — read/)).toBeTruthy())
        expect(screen.getByTitle(/^Company — not read yet/)).toBeTruthy()
    })

    it('blocks Generate when no account is marked, and says so', async () => {
        render(<MentorPanel {...props({ selectedAccounts: [] })} />)
        await runTurn({ reply: 'ok', setup: SETUP, readiness: { ready: true, missing: [] } })
        await waitFor(() => expect(screen.getByRole('button', { name: /Generate setup/ }).disabled).toBe(true))
        expect(screen.getByText(/trading account/)).toBeTruthy()
    })

    it('STOPS after Generate to offer Arm — a saved setup is not yet monitored', async () => {
        const onGenerated = vi.fn()
        render(<MentorPanel {...props({ onGenerated })} />)
        await runTurn({ reply: 'ok', setup: SETUP, readiness: { ready: true, missing: [] } })

        fireEvent.click(screen.getByRole('button', { name: /Generate setup/ }))
        await waitFor(() => expect(generateSetup).toHaveBeenCalled())

        // The critical distinction: generating does NOT start monitoring, and must not silently
        // bounce the user back to the hub as though it had.
        expect(await screen.findByText(/nothing is watching it yet/)).toBeTruthy()
        expect(armSetup).not.toHaveBeenCalled()
        expect(onGenerated).not.toHaveBeenCalled()
    })

    it('arms on request, then returns to the hub', async () => {
        const onGenerated = vi.fn()
        render(<MentorPanel {...props({ onGenerated })} />)
        await runTurn({ reply: 'ok', setup: SETUP, readiness: { ready: true, missing: [] } })
        fireEvent.click(screen.getByRole('button', { name: /Generate setup/ }))

        fireEvent.click(await screen.findByRole('button', { name: /Arm it/ }))
        await waitFor(() => expect(armSetup).toHaveBeenCalledWith('s1'))
        await waitFor(() => expect(onGenerated).toHaveBeenCalled())
    })

    it('can leave a setup waiting without arming it', async () => {
        const onGenerated = vi.fn()
        render(<MentorPanel {...props({ onGenerated })} />)
        await runTurn({ reply: 'ok', setup: SETUP, readiness: { ready: true, missing: [] } })
        fireEvent.click(screen.getByRole('button', { name: /Generate setup/ }))

        fireEvent.click(await screen.findByRole('button', { name: /Leave it waiting/ }))
        await waitFor(() => expect(onGenerated).toHaveBeenCalled())
        expect(armSetup).not.toHaveBeenCalled()
    })

    it('offers candidates when Mentor returns an offer instead of a worksheet', async () => {
        render(<MentorPanel {...props()} />)
        await runTurn({
            reply: 'Here is what I would consider.',
            setups: { candidates: [
                { label: 'Sweep and reclaim', pitch: 'Best risk.', setup: SETUP },
                { label: 'Break of the shelf', pitch: 'Momentum.', setup: { ...SETUP, trade_mode: 'classical' } },
            ] },
        })
        // JSX splits `{n} ways to play it` into separate text nodes, so match the static part.
        const picker = (await screen.findByText(/ways to play it/)).closest('.candidate-picker')
        expect(within(picker).getByText('Sweep and reclaim')).toBeTruthy()
        expect(within(picker).getByText('Break of the shelf')).toBeTruthy()
    })

    it('picking a candidate makes it the worksheet AND tells Mentor in words', async () => {
        render(<MentorPanel {...props()} />)
        await runTurn({
            reply: 'options',
            setups: { candidates: [{ label: 'Sweep and reclaim', pitch: 'Best risk.', setup: SETUP }] },
        })

        fireEvent.click(await screen.findByText('Sweep and reclaim'))

        // The draft and the conversation must not diverge on which one was picked.
        await waitFor(() => expect(sendStream).toHaveBeenCalledTimes(2))
        expect(sendStream.mock.calls[1][0].at(-1).content).toMatch(/Sweep and reclaim/)
        expect(sendStream.mock.calls[1][1].chatState.draft.asset).toBe('NVDA')
    })

    // Clicking an earnings/IPO row in the calendar routes here, not to the idea desk. The catalyst
    // arrives as the USER's turn — the click is them naming the ticker — so it must actually be
    // sent, and sent once per click however often the panel re-renders.
    it('a calendar seed opens the build as the user’s own turn, exactly once', async () => {
        const seed = { key: 1, message: 'I want to build a setup around NVDA earnings — it reports on Thu, Jul 31 after the close.' }
        const { rerender } = render(<MentorPanel {...props({ seed })} />)

        await waitFor(() => expect(sendStream).toHaveBeenCalledTimes(1))
        expect(sendStream.mock.calls[0][0].at(-1)).toEqual({ role: 'user', content: seed.message })

        rerender(<MentorPanel {...props({ seed })} />)
        expect(sendStream).toHaveBeenCalledTimes(1)
    })

    it('no seed sends nothing — the panel still opens on its intro', () => {
        render(<MentorPanel {...props()} />)
        expect(sendStream).not.toHaveBeenCalled()
        expect(screen.getByText(/I want to buy NVDA on a pullback/)).toBeTruthy()
    })

    it('a new user turn clears a stale candidate offer', async () => {
        render(<MentorPanel {...props()} />)
        await runTurn({ reply: 'options', setups: { candidates: [{ label: 'Sweep and reclaim', setup: SETUP }] } })
        expect(await screen.findByText('Sweep and reclaim')).toBeTruthy()

        await runTurn({ reply: 'more thoughts' })
        await waitFor(() => expect(screen.queryByText('Sweep and reclaim')).toBeNull())
    })
})
