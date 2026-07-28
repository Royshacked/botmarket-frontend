import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor, act, cleanup } from '@testing-library/react'
import { useEntityList } from './useEntityList.js'

// The three list loaders this replaced each handled `loading` differently and two were wrong.
// These pin the unified contract, especially the rule a polled list depends on: a refresh must
// never blank or re-spinner a surface the user is already reading.

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('useEntityList', () => {
    it('loads once on mount and drops the spinner', async () => {
        const load = vi.fn().mockResolvedValue([{ id: 'a' }])
        const { result } = renderHook(() => useEntityList({ load }))

        expect(result.current.loading).toBe(true)
        await waitFor(() => expect(result.current.loading).toBe(false))
        expect(result.current.items).toEqual([{ id: 'a' }])
        expect(load).toHaveBeenCalledTimes(1)
    })

    it('a REFRESH never re-raises the spinner — the surface stays readable', async () => {
        const load = vi.fn().mockResolvedValue([{ id: 'a' }])
        const { result } = renderHook(() => useEntityList({ load }))
        await waitFor(() => expect(result.current.loading).toBe(false))

        load.mockResolvedValue([{ id: 'a' }, { id: 'b' }])
        await act(async () => { await result.current.refresh() })

        expect(result.current.loading).toBe(false)
        expect(result.current.items).toHaveLength(2)
    })

    it('a FAILED refresh keeps the last good list rather than emptying it', async () => {
        const load = vi.fn().mockResolvedValue([{ id: 'a' }])
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const { result } = renderHook(() => useEntityList({ load }))
        await waitFor(() => expect(result.current.items).toHaveLength(1))

        load.mockRejectedValue(new Error('network'))
        await act(async () => { await result.current.refresh() })

        expect(result.current.items).toEqual([{ id: 'a' }])   // not []
    })

    it('a first load that FAILS still drops the spinner (no permanent "Loading…")', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const { result } = renderHook(() => useEntityList({ load: vi.fn().mockRejectedValue(new Error('boom')) }))
        await waitFor(() => expect(result.current.loading).toBe(false))
        expect(result.current.items).toEqual([])
    })

    it('reloads on the change event and unsubscribes on unmount', async () => {
        const load = vi.fn().mockResolvedValue([])
        const { result, unmount } = renderHook(() => useEntityList({ load, changeEvent: 'setups-changed' }))
        await waitFor(() => expect(result.current.loading).toBe(false))
        expect(load).toHaveBeenCalledTimes(1)

        await act(async () => { window.dispatchEvent(new Event('setups-changed')) })
        await waitFor(() => expect(load).toHaveBeenCalledTimes(2))

        unmount()
        window.dispatchEvent(new Event('setups-changed'))
        expect(load).toHaveBeenCalledTimes(2)   // no leaked listener
    })

    it('polls when pollMs is set, and stops on unmount', async () => {
        vi.useFakeTimers()
        const load = vi.fn().mockResolvedValue([])
        const { unmount } = renderHook(() => useEntityList({ load, pollMs: 20_000 }))
        expect(load).toHaveBeenCalledTimes(1)

        await act(async () => { vi.advanceTimersByTime(20_000) })
        expect(load).toHaveBeenCalledTimes(2)

        unmount()
        await act(async () => { vi.advanceTimersByTime(60_000) })
        expect(load).toHaveBeenCalledTimes(2)   // timer cleared
        vi.useRealTimers()
    })

    it('a non-array response degrades to [] rather than breaking .map in the list', async () => {
        const { result } = renderHook(() => useEntityList({ load: vi.fn().mockResolvedValue(null) }))
        await waitFor(() => expect(result.current.loading).toBe(false))
        expect(result.current.items).toEqual([])
    })
})
