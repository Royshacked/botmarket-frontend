import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// Two rows from one wake can share `at` to the millisecond (2026-11-18, ARMK). The hook must key
// them by `id`, keep both, and not lose a twin that the page boundary split off.

const getSetupJournal = vi.fn()
vi.mock('../services/mentor/mentor.service.remote', () => ({ mentorService: { getSetupJournal: (...a) => getSetupJournal(...a) } }))

const { useJournal } = await import('./useJournal.js')

const row = (id, at, note) => ({ id, at, note })
const T = '2026-11-18T18:34:00.467Z'

beforeEach(() => getSetupJournal.mockReset())

describe('useJournal — rows that share a timestamp', () => {
    it('keeps both twins in the head', async () => {
        getSetupJournal.mockResolvedValueOnce([row('b', T, 'ran past'), row('a', T, 'armed')])
        const { result } = renderHook(() => useJournal('s1', 1))
        await waitFor(() => expect(result.current.rows).toHaveLength(2))
        expect(result.current.rows.map(r => r.note)).toEqual(['ran past', 'armed'])
    })

    it('loads the twin past the page boundary and drops the boundary row it already has', async () => {
        const head = Array.from({ length: 49 }, (_, i) => row(`n${i}`, `2026-11-19T${String(10 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00.000Z`, `n${i}`)).reverse()
        getSetupJournal.mockResolvedValueOnce([...head, row('b', T, 'ran past')])     // a full page of 50
        const { result } = renderHook(() => useJournal('s1', 1))
        await waitFor(() => expect(result.current.rows).toHaveLength(50))
        expect(result.current.done).toBe(false)

        // The server's cursor is inclusive: the boundary row comes back with its twin and an older row.
        getSetupJournal.mockResolvedValueOnce([row('b', T, 'ran past'), row('a', T, 'armed'), row('o', '2026-11-18T18:00:00.000Z', 'older')])
        await act(() => result.current.loadOlder())
        expect(getSetupJournal).toHaveBeenLastCalledWith('s1', { before: T, limit: 50 })
        expect(result.current.rows.slice(-3).map(r => r.note)).toEqual(['ran past', 'armed', 'older'])
        expect(result.current.done).toBe(true)
    })

    it('a full page with nothing new ends the paging instead of looping on one millisecond', async () => {
        const same = Array.from({ length: 50 }, (_, i) => row(`x${i}`, T, `x${i}`))
        getSetupJournal.mockResolvedValueOnce(same)
        const { result } = renderHook(() => useJournal('s1', 1))
        await waitFor(() => expect(result.current.rows).toHaveLength(50))
        getSetupJournal.mockResolvedValueOnce(same)
        await act(() => result.current.loadOlder())
        expect(result.current.done).toBe(true)
        expect(result.current.rows).toHaveLength(50)
    })

    it('a head refresh keeps an older twin that fell onto the next page', async () => {
        getSetupJournal.mockResolvedValueOnce([row('b', T, 'ran past'), row('a', T, 'armed')])
        const { result, rerender } = renderHook(({ v }) => useJournal('s1', v), { initialProps: { v: 1 } })
        await waitFor(() => expect(result.current.rows).toHaveLength(2))
        getSetupJournal.mockResolvedValueOnce([row('c', '2026-11-18T19:00:00.000Z', 'new'), row('b', T, 'ran past')])
        rerender({ v: 2 })
        await waitFor(() => expect(result.current.rows).toHaveLength(3))
        expect(result.current.rows.map(r => r.note)).toEqual(['new', 'ran past', 'armed'])
    })
})
