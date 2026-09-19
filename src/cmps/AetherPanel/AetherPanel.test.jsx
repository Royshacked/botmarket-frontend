import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'

// The chat shell and the transport are stubbed; under test is the one thing this panel does that
// the others do not yet share a test for — taking a routed arrival's opening as its first turn.
const sendStream = vi.fn(async () => {})
vi.mock('../../services/aether/aether.service.remote.js', () => ({
    aetherService: { sendStream: (...a) => sendStream(...a) },
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

import { AetherPanel } from './AetherPanel.jsx'

afterEach(cleanup)

describe('AetherPanel — a routed opening', () => {
    beforeEach(() => {
        sendStream.mockClear()
        chatStub = {
            messages: [], isLoading: false, streamStatus: '', reasoningPulse: null,
            begin: () => ({ signal: null, handlers: {} }),
            run: async (text, { send, onDone } = {}) => {
                if (!text || chatStub.isLoading) return false
                await send?.({ signal: null, handlers: { onDone } })
                return true
            },
            endStream: vi.fn(), finishStreaming: vi.fn(), reset: vi.fn(), setMessages: vi.fn(),
            freezeError: vi.fn(), resumeBase: () => '', finalizeResumeHistory: (h) => h,
            beginContinue: () => null,
        }
    })

    // Axl's `<open>` for an admin ("which names does the port strike reach?") used to be dropped on
    // the floor for this desk: the route landed, the sentence did not. Same mechanism as every
    // other desk now — useSeedTurn, once per key.
    it('sends the opening as the desk\'s next turn, once per key', async () => {
        const { rerender } = render(<AetherPanel seed={{ key: 1, message: 'Which names does the port strike reach?' }} />)
        await waitFor(() => expect(sendStream).toHaveBeenCalledTimes(1))
        expect(sendStream.mock.calls[0][0].at(-1)).toEqual({ role: 'user', content: 'Which names does the port strike reach?' })

        rerender(<AetherPanel seed={{ key: 1, message: 'Which names does the port strike reach?' }} />)
        await Promise.resolve()
        expect(sendStream).toHaveBeenCalledTimes(1)
    })

    it('no seed runs nothing', async () => {
        render(<AetherPanel />)
        await Promise.resolve()
        expect(sendStream).not.toHaveBeenCalled()
    })
})
