import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'

// THE REVIEW OF 2026-10-03. Atlas proposed six trims, the user asked "are you sure?", Atlas took
// them back in prose — and "Accept changes" sent all six. The panel set `reviewUpdate` whenever a
// turn carried a <portfolio_update> and never cleared it, so the FIRST turn's proposal outlived the
// desk changing its mind. The latest turn decides now; Atlas is told to re-emit a proposal it still
// stands behind (backend agentUtils.buildStandingProposalRule).

const sendStream     = vi.fn(async () => {})
const completeReview = vi.fn(async () => {})
vi.mock('../../services/portfolio/portfolio.service.remote.js', () => ({
    portfolioService: {
        sendStream:     (...a) => sendStream(...a),
        completeReview: (...a) => completeReview(...a),
        saveChatState:  vi.fn(async () => {}),
    },
}))
vi.mock('../../services/threads/threads.service.remote.js', () => ({
    threadsService: { saveDraft: vi.fn(), getThread: vi.fn(), linkThread: vi.fn() },
    newThreadId: () => 'thr_test',
    clearThread: vi.fn(),
}))
vi.mock('../AgentMessages.jsx',  () => ({ AgentMessages:  ({ children }) => <div>{children}</div> }))
vi.mock('../AgentChatInput.jsx', () => ({ AgentChatInput: () => <div /> }))
vi.mock('../AxlHub/AgentSummon.jsx', () => ({ AgentIntro: () => <div />, AgentTurnTag: () => <span /> }))

let chatStub
vi.mock('../../customHooks/useChatStream.js', () => ({
    useChatStream: () => chatStub,
    toChatHistory: (msgs) => msgs.map(m => ({ role: m.role, content: m.content })),
}))

import { PortfolioPanel } from './PortfolioPanel.jsx'

afterEach(cleanup)

const TRIMS = {
    portfolioId: 'p1',
    changes: [
        { action: 'update_item', itemId: 'i_msft', patch: { allocationRatio: 0.2 } },
        { action: 'update_item', itemId: 'i_nvda', patch: { allocationRatio: 0.08 } },
    ],
}

// A book opened for review, the way MainPage restores one.
const review = { key: 1, portfolioId: 'p1', reviewMode: true, messages: [], portfolioIdeas: [{ id: 'i_msft', asset: 'MSFT', status: 'long' }] }

function turns(...replies) {
    sendStream.mockImplementation(async (history, accounts, opts) => { opts.onDone?.(replies.shift()) })
}

describe('PortfolioPanel — a review proposal stands only while Atlas keeps making it', () => {
    beforeEach(() => {
        sendStream.mockReset(); completeReview.mockClear()
        chatStub = {
            messages: [], setMessages: vi.fn(), isLoading: false, streamStatus: '', reasoningPulse: null,
            run: async (text, { send, onDone } = {}) => {
                if (!text) return false
                await send?.({ signal: null, handlers: { onDone } })
                return true
            },
            endStream: vi.fn(), finishStreaming: vi.fn(), reset: vi.fn(), freezeError: vi.fn(),
            resumeBase: () => '', finalizeResumeHistory: (h) => h, beginContinue: () => null,
        }
    })

    it('Atlas withdraws in a later turn → Accept no longer sends the trims', async () => {
        turns(
            { reply: 'Trim MSFT and NVDA.', update: TRIMS },
            { reply: 'On reflection, hold — I would not trim.' },
        )
        const onAcceptReview = vi.fn(async () => true)
        const { rerender } = render(<PortfolioPanel chatRestore={review} onAcceptReview={onAcceptReview} />)

        fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
        expect(await screen.findByRole('button', { name: 'Accept changes' })).toBeTruthy()

        rerender(<PortfolioPanel chatRestore={review} onAcceptReview={onAcceptReview} seed={{ key: 1, message: 'Are you sure?' }} />)
        await waitFor(() => expect(sendStream).toHaveBeenCalledTimes(2))

        // The proposal is gone: the button is the plain "Accept" of a hold, and pressing it
        // completes the review without sending a single change.
        const accept = await screen.findByRole('button', { name: 'Accept' })
        expect(screen.queryByRole('button', { name: 'Accept changes' })).toBeNull()
        fireEvent.click(accept)
        await waitFor(() => expect(completeReview).toHaveBeenCalledWith('p1', undefined, 'reviewed'))
        expect(onAcceptReview).not.toHaveBeenCalled()
    })

    it('Atlas re-emits the proposal it still stands behind → Accept sends THAT one', async () => {
        const narrowed = { portfolioId: 'p1', changes: [TRIMS.changes[0]] }
        turns(
            { reply: 'Trim MSFT and NVDA.', update: TRIMS },
            { reply: 'Keep NVDA; MSFT trim stands.', update: narrowed },
        )
        const onAcceptReview = vi.fn(async () => true)
        const { rerender } = render(<PortfolioPanel chatRestore={review} onAcceptReview={onAcceptReview} />)

        fireEvent.click(await screen.findByRole('button', { name: 'Review' }))
        await screen.findByRole('button', { name: 'Accept changes' })
        rerender(<PortfolioPanel chatRestore={review} onAcceptReview={onAcceptReview} seed={{ key: 1, message: 'Are you sure about NVDA?' }} />)
        await waitFor(() => expect(sendStream).toHaveBeenCalledTimes(2))

        fireEvent.click(await screen.findByRole('button', { name: 'Accept changes' }))
        await waitFor(() => expect(onAcceptReview).toHaveBeenCalledTimes(1))
        expect(onAcceptReview.mock.calls[0][1]).toEqual(narrowed)
    })
})
