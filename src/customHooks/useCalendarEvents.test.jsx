import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import { ADMIN, MEMBER } from '../testUtils/authStub.js'

// The industry views are Pythia's, and Pythia is admin-only (2026-09-14): GET /api/strategy/industries
// is requireAdmin. The hook still feeds every calendar surface from one place, so the gate lives here
// — a trader's fetch could only ever be a 403 in the log, and the three dated feeds must not lose
// their timer over it.

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

describe('useCalendarEvents — the industry views are fetched for admins only', () => {
    it('an admin gets all four feeds, the industries included', async () => {
        const { result } = renderHook(() => useCalendarEvents())
        await waitFor(() => expect(result.current.industries).toHaveLength(1))
        expect(listIndustries).toHaveBeenCalledTimes(1)
        expect(result.current.earnings).toEqual([{ symbol: 'AAPL' }])
        expect(result.current.fed).toEqual([{ title: 'FOMC' }])
    })

    it('a trader never asks for the industries, and the three dated feeds still load', async () => {
        AUTH = MEMBER
        const { result } = renderHook(() => useCalendarEvents())
        await waitFor(() => expect(result.current.earnings).toEqual([{ symbol: 'AAPL' }]))
        expect(getFed).toHaveBeenCalledTimes(1)
        expect(getIpo).toHaveBeenCalledTimes(1)
        expect(listIndustries).not.toHaveBeenCalled()
        expect(result.current.industries).toEqual([])
        expect(result.current.industriesLoading).toBe(false)
    })

    it('a failed industries read leaves an empty board, not a crash', async () => {
        listIndustries.mockRejectedValueOnce(new Error('403'))
        const { result } = renderHook(() => useCalendarEvents())
        await waitFor(() => expect(result.current.industriesLoading).toBe(false))
        expect(result.current.industries).toEqual([])
    })
})
