import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import { ADMIN, MEMBER } from '../testUtils/authStub.js'

// The tilt is Pythia's, and Pythia is admin-only (2026-09-14): GET /api/strategy/tilt/current is
// requireAdmin. The hook still feeds every calendar surface from one place, so the gate lives here
// — a trader's fetch could only ever be a 403 in the log, and the three dated feeds must not lose
// their timer over it.

let AUTH = ADMIN
vi.mock('../context/AuthContext.jsx', async (orig) => {
    const actual = await orig()
    return { ...actual, useAuth: () => AUTH }
})

const getCurrentTilt = vi.fn(async () => ({ tilts: [{ sector: 'Energy', stance: 'over' }] }))
vi.mock('../services/strategy/strategy.service.remote.js', () => ({
    TILT_CHANGED: 'strategy-tilt-changed',
    strategyService: { getCurrentTilt: (...a) => getCurrentTilt(...a) },
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

describe('useCalendarEvents — the house view is fetched for admins only', () => {
    it('an admin gets all four feeds, tilt included', async () => {
        const { result } = renderHook(() => useCalendarEvents())
        await waitFor(() => expect(result.current.tilt).not.toBeNull())
        expect(getCurrentTilt).toHaveBeenCalledTimes(1)
        expect(result.current.earnings).toEqual([{ symbol: 'AAPL' }])
        expect(result.current.fed).toEqual([{ title: 'FOMC' }])
    })

    it('a trader never asks for the tilt, and the three dated feeds still load', async () => {
        AUTH = MEMBER
        const { result } = renderHook(() => useCalendarEvents())
        await waitFor(() => expect(result.current.earnings).toEqual([{ symbol: 'AAPL' }]))
        expect(getFed).toHaveBeenCalledTimes(1)
        expect(getIpo).toHaveBeenCalledTimes(1)
        expect(getCurrentTilt).not.toHaveBeenCalled()
        expect(result.current.tilt).toBeNull()
        expect(result.current.tiltLoading).toBe(false)
    })
})
