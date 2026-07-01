import { useState, useCallback } from 'react'
import { useWindowEvent } from './useWindowEvent.js'

/**
 * Global "text streaming speed" setting (chars per second), persisted in
 * localStorage and shared across every chat panel. Reading and writing go
 * through the same key, and an in-tab custom event (plus the cross-tab `storage`
 * event) keeps all live `useTextPace()` consumers in sync the instant it changes.
 */
const KEY = 'chatTextPaceCps'
const EVT = 'text-pace-change'

export const PACE_MIN     = 8
export const PACE_MAX     = 160
export const PACE_DEFAULT = 33   // ~a touch faster than reading pace

function clamp(v) { return Math.min(PACE_MAX, Math.max(PACE_MIN, v)) }

function read() {
    const v = Number(localStorage.getItem(KEY))
    return Number.isFinite(v) && v > 0 ? clamp(v) : PACE_DEFAULT
}

export function useTextPace() {
    const [paceCps, setPace] = useState(read)

    const sync = useCallback(() => setPace(read()), [])
    useWindowEvent(EVT, sync)         // same-tab updates
    useWindowEvent('storage', sync)   // other tabs

    const setPaceCps = useCallback((v) => {
        const c = clamp(Number(v))
        localStorage.setItem(KEY, String(c))
        window.dispatchEvent(new Event(EVT))
    }, [])

    return { paceCps, setPaceCps }
}
