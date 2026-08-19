import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

// The chat shell and the transport are stubbed: what is under test here is the panel's own logic —
// the draft it renders, and the turn it runs when a "review due" card sends the user in.
const sendStream = vi.fn(async () => {})
vi.mock('../../services/strategy/strategy.service.remote.js', () => ({
    strategyService: { sendStream: (...a) => sendStream(...a) },
}))
vi.mock('../../services/threads/threads.service.remote.js', () => ({
    threadsService: { saveDraft: vi.fn(), getThread: vi.fn(), linkThread: vi.fn() },
    newThreadId: () => 'thr_test',
    clearThread: vi.fn(),
}))
vi.mock('../AgentMessages.jsx',  () => ({ AgentMessages:  ({ children }) => <div>{children}</div> }))
vi.mock('../AgentChatInput.jsx', () => ({ AgentChatInput: () => <div /> }))

let chatStub
vi.mock('../../customHooks/useChatStream.js', () => ({
    useChatStream: () => chatStub,
    toChatHistory: (msgs) => msgs.map(m => ({ role: m.role, content: m.content })),
}))

import { TiltDraft, StrategyPanel } from './StrategyPanel.jsx'
import { reviewPrompt } from './reviewPrompt.js'

afterEach(cleanup)

const row = (over = {}) => ({ sector: 'Healthcare', stance: 'over', active_bp: 150, horizon: '6m', ...over })
// `net_bp` / `balanced` are the SERVER's — balanceOf() rides on the draft the desk streams back,
// the same verdict normalizeTilt records at publish. They are in the fixture because they are in the
// payload; the panel no longer works them out, so a fixture that omitted them would be testing a
// response shape the server does not send.
const draft = (over = {}) => ({
    benchmark: 'SPX',
    regime: { name: 'late-cycle disinflation', thesis: 'Growth slows.', kill_criteria: ['core CPI above 3.5% twice'] },
    tilts: [row(), row({ sector: 'Energy', stance: 'under', active_bp: -150 })],
    net_bp: 0, balanced: true,
    ...over,
})

// The DRAFT is the part specific to this panel — a proposed house view, shown before it supersedes
// the standing one. The chat shell is the shared one every desk uses.
describe('TiltDraft', () => {
    it('shows the regime and the stances it implies', () => {
        render(<TiltDraft tilt={draft()} />)
        expect(screen.getByText('late-cycle disinflation')).toBeTruthy()
        expect(screen.getByText('Growth slows.')).toBeTruthy()
        expect(screen.getByText('Healthcare')).toBeTruthy()
        expect(screen.getByText('+150bp')).toBeTruthy()
        expect(screen.getByText('-150bp')).toBeTruthy()
        expect(screen.getByText('vs SPX')).toBeTruthy()
    })

    it('surfaces the NET so an unbalanced table is caught while it is still a draft', () => {
        // A tilt table redistributes a fully-invested book, so the weights must cancel. Catching it
        // here beats reading a warning on the board after it became the house view.
        const { container } = render(<TiltDraft tilt={draft()} />)
        expect(screen.getByText('net +0bp')).toBeTruthy()
        expect(container.querySelector('.strategy-panel__net--off')).toBeNull()
    })

    it('flags a table that does not net out', () => {
        const { container } = render(<TiltDraft tilt={draft({
            tilts: [row({ active_bp: 300 }), row({ sector: 'Energy', active_bp: 200 })],
            net_bp: 500, balanced: false,
        })} />)
        expect(screen.getByText('net +500bp')).toBeTruthy()
        expect(container.querySelector('.strategy-panel__net--off')).toBeTruthy()
    })

    it('renders the verdict the server sent rather than second-guessing it from the rows', () => {
        // The tolerance itself is the backend's (balanceOf / BALANCE_TOLERANCE_BP) and is tested
        // there. What matters HERE is that the panel does not re-derive it: given rows that sum to
        // 500 but a verdict of balanced, it must show balanced — because the publish call will.
        // Re-deriving is what let a copy of the tolerance drift in a second repo.
        const { container } = render(<TiltDraft tilt={draft({
            tilts: [row({ active_bp: 300 }), row({ sector: 'Energy', active_bp: 200 })],
            net_bp: 500, balanced: true,
        })} />)
        expect(container.querySelector('.strategy-panel__net--off')).toBeNull()
    })

    it('shows what would break the read — the falsifiers are what make it monitorable', () => {
        render(<TiltDraft tilt={draft()} />)
        expect(screen.getByText('what breaks it')).toBeTruthy()
        expect(screen.getByText('core CPI above 3.5% twice')).toBeTruthy()
    })

    it('the direction is legible before any number is parsed', () => {
        const { container } = render(<TiltDraft tilt={draft()} />)
        expect(container.querySelector('.strategy-panel__stance--over')).toBeTruthy()
        expect(container.querySelector('.strategy-panel__stance--under')).toBeTruthy()
    })

    it('a missing weight renders a dash, not a zero', () => {
        render(<TiltDraft tilt={draft({ tilts: [row({ active_bp: null })] })} />)
        expect(screen.getByText('—')).toBeTruthy()
    })

    it('a draft with no regime still renders its stances', () => {
        render(<TiltDraft tilt={draft({ regime: null })} />)
        expect(screen.getByText('House view')).toBeTruthy()
        expect(screen.getByText('Healthcare')).toBeTruthy()
    })
})

// ── the review a card sends in ───────────────────────────────────────────────
// Pythia's monitor found the standing view past its clock and asked; the confirm lands here and the
// review runs as an ordinary turn at the desk.
describe('reviewPrompt', () => {
    it('carries the trigger, so the review opens on what actually came due', () => {
        expect(reviewPrompt('stance matured: Energy')).toMatch(/stance matured: Energy/)
    })

    it('still reads as a sentence when the trigger is unknown', () => {
        expect(reviewPrompt(null)).toMatch(/^The house view is due for review\. /)
    })
})

describe('StrategyPanel — the review-due hand-off', () => {
    beforeEach(() => {
        sendStream.mockClear()
        chatStub = {
            messages: [], isLoading: false, streamStatus: '', reasoningPulse: null,
            begin: () => ({ signal: null, handlers: {} }),
            // The stub's `run` keeps the two behaviours these tests actually lean on: it refuses a
            // turn while one is in flight (the "waits for a turn in flight" case below flips
            // isLoading and re-renders), and it hands the panel's `send` the signal/handlers pair to
            // spread into its service call. The real one also owns the try/finally, which has
            // nothing to assert against a stub that cannot throw.
            run: async (text, { send } = {}) => {
                if (!text || chatStub.isLoading) return false
                await send?.({ signal: null, handlers: {} })
                return true
            },
            endStream: vi.fn(), finishStreaming: vi.fn(), reset: vi.fn(), setMessages: vi.fn(),
            freezeError: vi.fn(), resumeBase: () => '', finalizeResumeHistory: (h) => h,
            beginContinue: () => null,
        }
    })

    it('runs the review as an ordinary turn, with the trigger in the ask', async () => {
        const onReviewStart = vi.fn()
        render(<StrategyPanel reviewRequest={{ n: 1, reason: 'stance matured: Energy' }} onReviewStart={onReviewStart} />)

        await waitFor(() => expect(sendStream).toHaveBeenCalledTimes(1))
        const [history] = sendStream.mock.calls[0]
        expect(history.at(-1)).toEqual({ role: 'user', content: reviewPrompt('stance matured: Energy') })
        expect(onReviewStart).toHaveBeenCalled()
    })

    // The view in force is what makes it a REVIEW rather than a fresh build: a stance that still
    // holds keeps its own clock and baseline instead of being silently re-based.
    it('sends the standing view along, so reaffirming is possible', async () => {
        const currentTilt = { id: 'tilt_SPX_1', tilts: [row()] }
        render(<StrategyPanel currentTilt={currentTilt} reviewRequest={{ n: 1, reason: 'x' }} />)

        await waitFor(() => expect(sendStream).toHaveBeenCalledTimes(1))
        expect(sendStream.mock.calls[0][1].chatState).toEqual({ current_tilt: currentTilt })
    })

    it('no request, or one already consumed, runs nothing', async () => {
        render(<StrategyPanel reviewRequest={{ n: 0, reason: 'x' }} />)
        render(<StrategyPanel />)
        await Promise.resolve()
        expect(sendStream).not.toHaveBeenCalled()
    })

    // Arriving mid-turn must not swallow the review: the request is left unconsumed and re-runs when
    // the turn ends, rather than being dropped on the floor.
    it('waits for a turn in flight instead of dropping the review', async () => {
        chatStub.isLoading = true
        const onReviewStart = vi.fn()
        const { rerender } = render(<StrategyPanel reviewRequest={{ n: 1, reason: 'x' }} onReviewStart={onReviewStart} />)
        expect(sendStream).not.toHaveBeenCalled()
        expect(onReviewStart).not.toHaveBeenCalled()

        chatStub = { ...chatStub, isLoading: false }
        rerender(<StrategyPanel reviewRequest={{ n: 1, reason: 'x' }} onReviewStart={onReviewStart} />)
        await waitFor(() => expect(sendStream).toHaveBeenCalledTimes(1))
    })
})
