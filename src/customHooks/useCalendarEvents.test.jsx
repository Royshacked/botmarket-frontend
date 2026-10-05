import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import { ADMIN, MEMBER } from '../testUtils/authStub.js'

// The industry views are a broadcast every user reads (2026-10-05) — only authoring them is admin-only.
// The hook feeds every calendar surface from one place, so traders and admins get the same four feeds.

let AUTH = ADMIN
vi.mock('../context/AuthContext.jsx', async (orig) => {
    const actual = await orig()
    return { ...actual, useAuth: () => AUTH }
})

const listIndustries = vi.fn(async () => [{ code: '45301020', name: 'Semiconductors', view: null }])
vi.mock('../services/strategy/strategy.service.remote.js', () => ({
    INDUSTRIES_CHANGED: 'strategy-industries-changed',
    strategyService: { listIndustries: (...a) => listIndustries(...a) },
}))

const getEarnings = vi.fn(async () => ({ items: [{ symbol: 'AAPL' }], from: '2026-09-14', to: '2026-09-18' }))
const getFed      = vi.fn(async () => [{ title: 'FOMC' }])
const getIpo      = vi.fn(async () => [])
vi.mock('../services/calendar/calendar.service.remote.js', () => ({
    calendarService: {
        getEarnings: (...a) => getEarnings(...a),
        getFed:      (...a) => getFed(...a),
        getIpo:      (...a) => getIpo(...a),
    },
}))

import { useCalendarEvents } from './useCalendarEvents.js'

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    AUTH = ADMIN
})

describe('useCalendarEvents — the industry views are fetched for everyone', () => {
    it('an admin gets all four feeds, the industries included', async () => {
        const { result } = renderHook(() => useCalendarEvents())
        await waitFor(() => expect(result.current.industries).toHaveLength(1))
        expect(listIndustries).toHaveBeenCalledTimes(1)
        expect(result.current.earnings).toEqual([{ symbol: 'AAPL' }])
        expect(result.current.fed).toEqual([{ title: 'FOMC' }])
    })

    it('a trader gets the industries too', async () => {
        AUTH = MEMBER
        const { result } = renderHook(() => useCalendarEvents())
        await waitFor(() => expect(result.current.industries).toHaveLength(1))
        expect(listIndustries).toHaveBeenCalledTimes(1)
        expect(getFed).toHaveBeenCalledTimes(1)
    })

    it('a failed industries read leaves an empty board, not a crash', async () => {
        listIndustries.mockRejectedValueOnce(new Error('403'))
        const { result } = renderHook(() => useCalendarEvents())
        await waitFor(() => expect(result.current.industriesError).toBe(true))
        expect(result.current.industries).toEqual([])
    })
})
