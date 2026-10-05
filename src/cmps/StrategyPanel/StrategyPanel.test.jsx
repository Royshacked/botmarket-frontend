import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'

// The chat shell and the transport are stubbed: what is under test here is the panel's own logic —
// the industry drafts it renders, publishing them one at a time, and the latest-turn-decides rule.
const sendStream = vi.fn(async () => {})
const publishIndustry = vi.fn(async (code) => ({ id: `iv_${code}`, code, name: 'Semiconductors' }))
vi.mock('../../services/strategy/strategy.service.remote.js', () => ({
    strategyService: { sendStream: (...a) => sendStream(...a), publishIndustry: (...a) => publishIndustry(...a) },
}))
const saveDraft = vi.fn()
const linkThread = vi.fn()
vi.mock('../../services/threads/threads.service.remote.js', () => ({
    threadsService: { saveDraft: (...a) => saveDraft(...a), getThread: vi.fn(), linkThread: (...a) => linkThread(...a) },
    newThreadId: () => 'thr_test',
    clearThread: vi.fn(),
}))
vi.mock('../AgentMessages.jsx',  () => ({ AgentMessages:  ({ children }) => <div>{children}</div> }))
vi.mock('../AgentChatInput.jsx', () => ({ AgentChatInput: () => <div /> }))

let chatStub
vi.mock('../../customHooks/useChatStream.js', () => ({
    useChatStream: () => chatStub,
    toChatHistory: (msgs) => msgs.map(m => ({ role: m.role, content: m.content })),
    withoutPrefill: (h) => h,
}))

import { IndustryDraft, StrategyPanel } from './StrategyPanel.jsx'

afterEach(cleanup)

const view = (over = {}) => ({
    industry: '45301020',
    demand:    { grade: 'growing', rationale: 'Revenue 12%/yr against 5% for the universe.' },
    economics: { grade: 'good',    rationale: 'Median ROIC 18% against a 10.6% hurdle.' },
    cycle:     { grade: 'mid',     rationale: 'r', override_reason: 'The range is pre-AI; the margin floor moved.' },
    reopen_if: ['industry revenue falls two quarters in a row'],
    summary: 'A great industry, mid-cycle on the house read.',
    ...over,
})

describe('IndustryDraft', () => {
    it('shows each question with its grade and reasoning, and a departure with its argument', () => {
        render(<IndustryDraft view={view()} onPublish={vi.fn()} />)
        expect(screen.getByText('GICS 45301020')).toBeTruthy()
        expect(screen.getByText('growing')).toBeTruthy()
        expect(screen.getByText(/Median ROIC 18%/)).toBeTruthy()
        expect(screen.getByText(/margin floor moved/)).toBeTruthy()
        expect(screen.getByText('industry revenue falls two quarters in a row')).toBeTruthy()
    })

    it('shows the server\'s refusal under the draft it belongs to', () => {
        render(<IndustryDraft view={view()} error="cycle: give override_reason" onPublish={vi.fn()} />)
        expect(screen.getByText('cycle: give override_reason')).toBeTruthy()
    })
})

describe('StrategyPanel', () => {
    beforeEach(() => {
        sendStream.mockReset(); sendStream.mockImplementation(async () => {})
        publishIndustry.mockClear(); saveDraft.mockClear(); linkThread.mockClear()
        chatStub = {
            messages: [], isLoading: false, streamStatus: '', reasoningPulse: null,
            run: async (text, { send, onDone, onStopped } = {}) => {
                if (!text || chatStub.isLoading) return false
                let completed = false
                const handlers = { onDone: onDone ? (d) => { completed = true; onDone(d) } : undefined }
                await send?.({ signal: null, handlers })
                if (!completed) onStopped?.()
                return true
            },
            endStream: vi.fn(), finishStreaming: vi.fn(), reset: vi.fn(), setMessages: vi.fn(),
            freezeError: vi.fn(), resumeBase: () => '', finalizeResumeHistory: (h) => h,
            beginContinue: () => null,
        }
    })

    it('a routed opening is sent as the next turn, once per key', async () => {
        const { rerender } = render(<StrategyPanel seed={{ key: 1, message: 'Review semiconductors.' }} />)
        await waitFor(() => expect(sendStream).toHaveBeenCalledTimes(1))
        expect(sendStream.mock.calls[0][0].at(-1)).toEqual({ role: 'user', content: 'Review semiconductors.' })
        rerender(<StrategyPanel seed={{ key: 1, message: 'Review semiconductors.' }} />)
        await Promise.resolve()
        expect(sendStream).toHaveBeenCalledTimes(1)
    })

    it('every drafted industry gets its own Publish, and publishing one removes only that one', async () => {
        sendStream.mockImplementation(async (h, opts) => { opts.onDone?.({ reply: 'Two answers.', views: [view(), view({ industry: '45301010' })] }) })
        const onPublished = vi.fn()
        render(<StrategyPanel seed={{ key: 1, message: 'Review chips.' }} onPublished={onPublished} />)
        await waitFor(() => expect(screen.getAllByText('Publish this answer')).toHaveLength(2))

        fireEvent.click(screen.getAllByText('Publish this answer')[0])
        await waitFor(() => expect(publishIndustry).toHaveBeenCalledWith('45301020', expect.objectContaining({ industry: '45301020' })))
        await waitFor(() => expect(screen.getAllByText('Publish this answer')).toHaveLength(1))
        expect(onPublished).toHaveBeenCalled()
        expect(linkThread).not.toHaveBeenCalled()   // a draft is still open in this thread
    })

    // The live drive (2026-10-05): the draft vanished on Publish and left an empty reply under PYTHIA.
    it('a published draft leaves a line saying what was published, cleared by the next turn', async () => {
        const replies = [{ reply: 'Here it is.', views: [view()] }, { reply: 'Anything else?' }]
        sendStream.mockImplementation(async (h, opts) => { opts.onDone?.(replies.shift()) })
        const { rerender } = render(<StrategyPanel seed={{ key: 1, message: 'Review chips.' }} />)
        await waitFor(() => expect(screen.getByText('Publish this answer')).toBeTruthy())
        fireEvent.click(screen.getByText('Publish this answer'))
        await waitFor(() => expect(screen.getByText(/Published — Semiconductors: demand growing · economics good · cycle mid\./)).toBeTruthy())
        expect(screen.queryByText('Publish this answer')).toBeNull()

        rerender(<StrategyPanel seed={{ key: 2, message: 'Thanks.' }} />)
        await waitFor(() => expect(screen.queryByText(/Published —/)).toBeNull())
    })

    it('a refused publish keeps the draft and shows why', async () => {
        sendStream.mockImplementation(async (h, opts) => { opts.onDone?.({ reply: 'x', views: [view()] }) })
        publishIndustry.mockRejectedValueOnce({ response: { data: { detail: 'cycle: grade "mid" differs from the measured "peak" — give override_reason' } } })
        render(<StrategyPanel seed={{ key: 1, message: 'Review chips.' }} />)
        await waitFor(() => expect(screen.getByText('Publish this answer')).toBeTruthy())
        fireEvent.click(screen.getByText('Publish this answer'))
        await waitFor(() => expect(screen.getByText(/differs from the measured "peak"/)).toBeTruthy())
        expect(screen.getByText('Publish this answer')).toBeTruthy()
    })

    // THE LATEST TURN DECIDES: a turn that no longer emits a block has withdrawn the drafts.
    it('a turn without <industry_view> withdraws the drafts', async () => {
        const replies = [{ reply: 'Here it is.', views: [view()] }, { reply: 'On reflection, not yet.' }]
        sendStream.mockImplementation(async (h, opts) => { opts.onDone?.(replies.shift()) })
        const { rerender } = render(<StrategyPanel seed={{ key: 1, message: 'Review chips.' }} />)
        await waitFor(() => expect(screen.queryByText('Publish this answer')).toBeTruthy())
        rerender(<StrategyPanel seed={{ key: 2, message: 'Are you sure?' }} />)
        await waitFor(() => expect(screen.queryByText('Publish this answer')).toBeNull())
        expect(saveDraft.mock.calls.at(-1)[0].state).toBeNull()
    })

    it('while one publish is in flight every Publish waits, and the other draft survives it', async () => {
        sendStream.mockImplementation(async (h, opts) => { opts.onDone?.({ reply: 'x', views: [view(), view({ industry: '45301010' })] }) })
        let release
        publishIndustry.mockImplementationOnce((code) => new Promise(r => { release = () => r({ id: `iv_${code}`, code }) }))
        render(<StrategyPanel seed={{ key: 1, message: 'Review chips.' }} />)
        await waitFor(() => expect(screen.getAllByText('Publish this answer')).toHaveLength(2))
        fireEvent.click(screen.getAllByText('Publish this answer')[0])
        await waitFor(() => expect(screen.getAllByText('Publish this answer').every(b => b.disabled)).toBe(true))
        release()
        await waitFor(() => expect(screen.getAllByText('Publish this answer')).toHaveLength(1))
        expect(screen.getByText('GICS 45301010')).toBeTruthy()
        expect(linkThread).not.toHaveBeenCalled()
    })

    it('two drafts for one industry collapse to the last', async () => {
        sendStream.mockImplementation(async (h, opts) => { opts.onDone?.({ reply: 'x', views: [view({ summary: 'first' }), view({ summary: 'second' })] }) })
        render(<StrategyPanel seed={{ key: 1, message: 'Review chips.' }} />)
        await waitFor(() => expect(screen.getAllByText('Publish this answer')).toHaveLength(1))
        expect(screen.getByText('second')).toBeTruthy()
    })

    it('a turn stopped mid-answer still saves the conversation, as an industry_view thread', async () => {
        render(<StrategyPanel pipeline="strategy" seed={{ key: 1, message: 'Review banks.' }} />)
        await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1))
        const arg = saveDraft.mock.calls[0][0]
        expect(arg.agent).toBe('strategy')
        expect(arg.subjectType).toBe('industry_view')
        expect(arg.messages.at(-1)).toEqual({ role: 'user', content: 'Review banks.' })
    })
})
