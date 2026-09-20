import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act, cleanup } from '@testing-library/react'

// The candidate list is PUSHED, not polled. It used to sit on a five-minute timer and learn
// of a finished run up to ten minutes after the button already knew — the tick that fell in
// a Mongo wobble failed, and the next one was five minutes out. The server now says over the
// socket when a run lands, and the list reads on that frame, once on open, and on a reconnect.

const { listeners } = vi.hoisted(() => ({ listeners: {} }))

vi.mock('../services/chat/chatWs.service.js', () => ({
    chatWsService: {
        connect:    vi.fn(),
        disconnect: vi.fn(),
        on:  (ev, h) => { (listeners[ev] ??= new Set()).add(h) },
        off: (ev, h) => { listeners[ev]?.delete(h) },
    },
}))
vi.mock('../services/aether/aether.service.remote.js', () => ({
    aetherService: { getCandidates: vi.fn() },
}))

import { useAetherCandidates, DISCOVERY_EVENT } from './useAetherCandidates.js'
import { aetherService } from '../services/aether/aether.service.remote.js'

const run  = id => ({ run_id: id, candidates: [] })
const fire = (ev, data) => listeners[ev]?.forEach(h => h(data))

beforeEach(() => {
    for (const k of Object.keys(listeners)) delete listeners[k]
    aetherService.getCandidates.mockResolvedValue([run('Canada:2026-09-08')])
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('useAetherCandidates', () => {
    it('reads once on open, and only once — there is no timer', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        try {
            const { result } = renderHook(() => useAetherCandidates())
            await waitFor(() => expect(result.current.loading).toBe(false))
            expect(result.current.runs).toHaveLength(1)

            await act(async () => { vi.advanceTimersByTime(20 * 60_000) })
            expect(aetherService.getCandidates).toHaveBeenCalledTimes(1)
        } finally {
            vi.useRealTimers()
        }
    })

    it('re-reads the moment the server says a run has ended', async () => {
        const { result } = renderHook(() => useAetherCandidates())
        await waitFor(() => expect(result.current.loading).toBe(false))

        aetherService.getCandidates.mockResolvedValue([run('Meta MTIA:2026-09-15'), run('Canada:2026-09-08')])
        await act(async () => { fire(DISCOVERY_EVENT, { running: false, progress: null, last: { ok: true } }) })

        await waitFor(() => expect(result.current.runs).toHaveLength(2))
        expect(result.current.runs[0].run_id).toBe('Meta MTIA:2026-09-15')
    })

    it('ignores the stages in between — only the end changes the list', async () => {
        const { result } = renderHook(() => useAetherCandidates())
        await waitFor(() => expect(result.current.loading).toBe(false))

        await act(async () => {
            fire(DISCOVERY_EVENT, { running: true, progress: { stage: 'triage' } })
            fire(DISCOVERY_EVENT, { running: true, progress: { stage: 'verifying' } })
        })
        expect(aetherService.getCandidates).toHaveBeenCalledTimes(1)
    })

    it('re-reads on a (re)connected socket — the run that landed while it was down', async () => {
        const { result } = renderHook(() => useAetherCandidates())
        await waitFor(() => expect(result.current.loading).toBe(false))

        aetherService.getCandidates.mockResolvedValue([run('a'), run('b')])
        await act(async () => { fire('connected', null) })

        await waitFor(() => expect(result.current.runs).toHaveLength(2))
    })

    it('a refetch that fails keeps the names on screen and says so', async () => {
        const { result } = renderHook(() => useAetherCandidates())
        await waitFor(() => expect(result.current.runs).toHaveLength(1))

        aetherService.getCandidates.mockRejectedValue(new Error('read ECONNRESET'))
        await act(async () => { fire(DISCOVERY_EVENT, { running: false }) })

        await waitFor(() => expect(result.current.error).toMatch(/ECONNRESET/))
        expect(result.current.runs).toHaveLength(1)
    })

    it('a quick read lands on its candidate in the list, and only on it', async () => {
        // The row that asked for the read unmounts when the reader leaves the list; the
        // read has to live here, with the list, or it reads as never asked on the way back.
        aetherService.getCandidates.mockResolvedValue([
            { run_id: 'a', candidates: [{ ticker: 'CVX' }, { ticker: 'DHT' }] },
            { run_id: 'b', candidates: [{ ticker: 'CVX' }] },
        ])
        const { result } = renderHook(() => useAetherCandidates())
        await waitFor(() => expect(result.current.loading).toBe(false))

        const read = { verdict: 'contradicted', net: 'hurt' }
        act(() => { result.current.onRead('a', 'CVX', read) })

        const [a, b] = result.current.runs
        expect(a.candidates[0].quick_read).toBe(read)
        expect(a.candidates[1].quick_read).toBeUndefined()
        expect(b.candidates[0].quick_read).toBeUndefined()
        expect(aetherService.getCandidates).toHaveBeenCalledTimes(1)
    })

    it('a read for a name the list does not hold changes nothing', async () => {
        const { result } = renderHook(() => useAetherCandidates())
        await waitFor(() => expect(result.current.loading).toBe(false))
        const before = result.current.runs
        act(() => {
            result.current.onRead('Canada:2026-09-08', 'NUE', { verdict: 'credible' })
            result.current.onRead('nope', 'NUE', { verdict: 'credible' })
            result.current.onRead('Canada:2026-09-08', 'NUE', null)
        })
        expect(result.current.runs[0]).toBe(before[0])
    })

    it('the server’s own copy wins on the next list read', async () => {
        aetherService.getCandidates.mockResolvedValue([{ run_id: 'a', candidates: [{ ticker: 'CVX' }] }])
        const { result } = renderHook(() => useAetherCandidates())
        await waitFor(() => expect(result.current.loading).toBe(false))
        act(() => { result.current.onRead('a', 'CVX', { verdict: 'unclear' }) })

        const stored = { verdict: 'priced_in', read_at: '2026-09-20T19:46:47Z' }
        aetherService.getCandidates.mockResolvedValue([{ run_id: 'a', candidates: [{ ticker: 'CVX', quick_read: stored }] }])
        await act(async () => { fire(DISCOVERY_EVENT, { running: false }) })
        await waitFor(() => expect(result.current.runs[0].candidates[0].quick_read).toEqual(stored))
    })

    it('stops listening on unmount', async () => {
        const { result, unmount } = renderHook(() => useAetherCandidates())
        await waitFor(() => expect(result.current.loading).toBe(false))
        unmount()
        expect(listeners[DISCOVERY_EVENT]?.size ?? 0).toBe(0)
        expect(listeners.connected?.size ?? 0).toBe(0)
    })
})
