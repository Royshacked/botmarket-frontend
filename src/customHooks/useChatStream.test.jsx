import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// turn.service reaches for axios/localStorage at import time; only the id minting matters here.
vi.mock('../services/turn.service.js', () => ({ newTurnId: () => 'turn_1', turnService: { stop: vi.fn() } }))

const { useChatStream, withoutPrefill } = await import('./useChatStream.js')

beforeEach(() => { vi.clearAllMocks() })

/**
 * `onStopped` — the rule that a turn which answered NOTHING still leaves a conversation behind.
 *
 * Every desk hung its draft persistence off `onDone`, and the abort path never reaches it. So the
 * one thing the "unfinished work" badge exists to catch — the user walking out mid-answer — was
 * exactly the thing that saved nothing: Axl showed no marker, and the chat the user came back to
 * was React state behind a hidden tab, gone on the next reload. (Reported 2026-08-19: a setup seeded
 * from the earnings calendar, stopped six seconds in while the data tools retried 429s.)
 *
 * The flag is derived from onDone rather than asked of the panels, so a desk cannot forget to set it.
 */
describe('useChatStream.run — a turn that never completed', () => {
    it('calls onStopped when the send is aborted', async () => {
        const onStopped = vi.fn()
        const onDone    = vi.fn()
        const err = vi.spyOn(console, 'error').mockImplementation(() => {})
        const { result } = renderHook(() => useChatStream())

        await act(async () => {
            await result.current.run('long NVDA', {
                send:  async () => { throw new DOMException('aborted', 'AbortError') },
                onDone, onStopped,
            })
        })

        expect(onDone).not.toHaveBeenCalled()
        expect(onStopped).toHaveBeenCalledTimes(1)
        err.mockRestore()
    })

    it('calls onStopped when the stream ends without ever emitting done', async () => {
        // Not only the abort: a stream that closes with no `done` event left the panel holding the
        // same thing — a user message and no answer — and must be kept for the same reason.
        const onStopped = vi.fn()
        const { result } = renderHook(() => useChatStream())

        await act(async () => {
            await result.current.run('long NVDA', { send: async () => {}, onDone: vi.fn(), onStopped })
        })

        expect(onStopped).toHaveBeenCalledTimes(1)
    })

    it('does NOT call onStopped when the turn completed — that would save the reply twice', async () => {
        const onStopped = vi.fn()
        const onDone    = vi.fn()
        const { result } = renderHook(() => useChatStream())

        await act(async () => {
            await result.current.run('long NVDA', {
                send: async ({ handlers }) => { handlers.onDone({ reply: 'here is the setup' }) },
                onDone, onStopped,
            })
        })

        expect(onDone).toHaveBeenCalledTimes(1)
        expect(onStopped).not.toHaveBeenCalled()
    })

    it('runs onSettled on both endings — it answers a different question', async () => {
        const onSettled = vi.fn()
        const { result } = renderHook(() => useChatStream())

        await act(async () => {
            await result.current.run('a', {
                send: async ({ handlers }) => { handlers.onDone({ reply: 'ok' }) }, onDone: vi.fn(), onSettled,
            })
        })
        await act(async () => {
            await result.current.run('b', { send: async () => {}, onDone: vi.fn(), onSettled })
        })

        expect(onSettled).toHaveBeenCalledTimes(2)
    })
})

/**
 * `withoutPrefill` — what a RESUMED turn is saved against.
 *
 * The four desks that offer ▶ each wrote `history.slice(0, -1)`, which is right on only one of the
 * two resume paths. Continuing a partial sends the partial back as an assistant prefill, and the
 * completed reply replaces it; REGENERATING (stopped before any token) drops the `_(stopped)_`
 * placeholder, so the history ends at the USER's message — and slicing it off deleted the user's
 * turn from the saved thread. On a first-turn regenerate that left a thread with no user message in
 * it at all, which is also where its title comes from.
 */
describe('withoutPrefill', () => {
    const USER = { role: 'user', content: 'long NVDA' }

    it('drops the assistant prefill a CONTINUE sends back', () => {
        const h = [USER, { role: 'assistant', content: 'partial so far' }]
        expect(withoutPrefill(h)).toEqual([USER])
    })

    it('keeps the user turn a REGENERATE ends on', () => {
        expect(withoutPrefill([USER])).toEqual([USER])
    })

    it('leaves its input alone, and answers [] for nothing', () => {
        const h = [USER, { role: 'assistant', content: 'partial' }]
        withoutPrefill(h)
        expect(h).toHaveLength(2)          // the caller still holds the history it sent
        expect(withoutPrefill(null)).toEqual([])
        expect(withoutPrefill([])).toEqual([])
    })
})
