import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act, cleanup } from '@testing-library/react'
import { openEntityPopup, stashKey, POPUP_KINDS } from './entityPopup.js'
import { useEntityPopup } from '../../customHooks/useEntityPopup.js'

// The two halves of one mechanism: the opener hands the entity over, the hook picks it up.
// These pin the hand-off contract — the part that was previously re-implemented per kind and so
// could silently drift (a stash key that doesn't match, an injected property nobody reads).

const setPath = (p) => window.history.replaceState({}, '', p)

beforeEach(() => { localStorage.clear(); delete window.__entityData })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('openEntityPopup', () => {
    it('opens the kind\'s route at the kind\'s window size', () => {
        const open = vi.spyOn(window, 'open').mockReturnValue({})
        openEntityPopup('call', { id: 'call_1' })
        expect(open).toHaveBeenCalledWith('/call/call_1', 'call-call_1', 'width=1180,height=760')
    })

    it('hands the entity over BOTH ways — injected and stashed', () => {
        const popup = {}
        vi.spyOn(window, 'open').mockReturnValue(popup)
        const setup = { id: 'setup_1', asset: 'NQ' }

        openEntityPopup('setup', setup)

        expect(popup.__entityData).toEqual({ kind: 'setup', entity: setup })
        expect(JSON.parse(localStorage.getItem(stashKey('setup', 'setup_1')))).toEqual(setup)
    })

    it('accepts a bare id — nothing to stash, the page fetches', () => {
        const popup = {}
        vi.spyOn(window, 'open').mockReturnValue(popup)
        openEntityPopup('call', 'call_9')
        expect(popup.__entityData).toBeUndefined()
        expect(localStorage.getItem(stashKey('call', 'call_9'))).toBeNull()
    })

    it('refuses an unknown kind and a missing id instead of opening a broken window', () => {
        const open = vi.spyOn(window, 'open').mockReturnValue({})
        vi.spyOn(console, 'error').mockImplementation(() => {})
        expect(openEntityPopup('nope', { id: 'x' })).toBeNull()
        expect(openEntityPopup('idea', {})).toBeNull()
        expect(open).not.toHaveBeenCalled()
    })

    it('survives a localStorage failure — the popup still opens', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
        const open = vi.spyOn(window, 'open').mockReturnValue({})
        expect(() => openEntityPopup('idea', { id: 'i1' })).not.toThrow()
        expect(open).toHaveBeenCalled()
    })

    it('every registered kind has a route and a size', () => {
        for (const [kind, cfg] of Object.entries(POPUP_KINDS)) {
            expect(cfg.route, kind).toBeTruthy()
            expect(cfg.width, kind).toBeGreaterThan(0)
            expect(cfg.height, kind).toBeGreaterThan(0)
        }
    })
})

describe('useEntityPopup hydration ladder', () => {
    it('tier 1: uses the injected entity and does NOT fetch', async () => {
        setPath('/idea/i1')
        window.__entityData = { kind: 'idea', entity: { id: 'i1', asset: 'NQ' } }
        const fetchFn = vi.fn()

        const { result } = renderHook(() => useEntityPopup('idea', fetchFn))

        await waitFor(() => expect(result.current.entity).toEqual({ id: 'i1', asset: 'NQ' }))
        expect(fetchFn).not.toHaveBeenCalled()
        expect(window.__entityData).toBeUndefined()   // consumed
    })

    it('ignores an injection meant for a DIFFERENT kind or id', async () => {
        setPath('/idea/i1')
        window.__entityData = { kind: 'call', entity: { id: 'i1' } }
        const fetchFn = vi.fn().mockResolvedValue({ id: 'i1', asset: 'FETCHED' })

        const { result } = renderHook(() => useEntityPopup('idea', fetchFn))

        await waitFor(() => expect(result.current.entity?.asset).toBe('FETCHED'))
        expect(fetchFn).toHaveBeenCalledWith('i1')
    })

    it('tier 2: reads the stash, consumes it, and does NOT fetch', async () => {
        setPath('/setup/s1')
        localStorage.setItem(stashKey('setup', 's1'), JSON.stringify({ id: 's1', asset: 'TSLA' }))
        const fetchFn = vi.fn()

        const { result } = renderHook(() => useEntityPopup('setup', fetchFn))

        await waitFor(() => expect(result.current.entity?.asset).toBe('TSLA'))
        expect(fetchFn).not.toHaveBeenCalled()
        expect(localStorage.getItem(stashKey('setup', 's1'))).toBeNull()   // consumed
    })

    it('a CORRUPT stash falls through to the API instead of breaking the window', async () => {
        setPath('/setup/s2')
        localStorage.setItem(stashKey('setup', 's2'), '{not json')
        const fetchFn = vi.fn().mockResolvedValue({ id: 's2', asset: 'RECOVERED' })

        const { result } = renderHook(() => useEntityPopup('setup', fetchFn))

        await waitFor(() => expect(result.current.entity?.asset).toBe('RECOVERED'))
        expect(localStorage.getItem(stashKey('setup', 's2'))).toBeNull()
    })

    it('tier 3: a pasted URL with no hand-off fetches', async () => {
        setPath('/call/c1')
        const fetchFn = vi.fn().mockResolvedValue({ id: 'c1', asset: 'AAPL' })

        const { result } = renderHook(() => useEntityPopup('call', fetchFn))

        await waitFor(() => expect(result.current.entity?.asset).toBe('AAPL'))
        expect(result.current.id).toBe('c1')
    })

    it('surfaces not-found and fetch failure distinctly', async () => {
        setPath('/call/gone')
        const { result: missing } = renderHook(() =>
            useEntityPopup('call', vi.fn().mockResolvedValue(null), { notFound: 'Call not found' }))
        await waitFor(() => expect(missing.current.error).toBe('Call not found'))

        setPath('/call/boom')
        const { result: broken } = renderHook(() =>
            useEntityPopup('call', vi.fn().mockRejectedValue(new Error('net'))))
        await waitFor(() => expect(broken.current.error).toBe('Failed to load call'))
    })

    it('polls, and a failed poll keeps the painted entity on screen', async () => {
        setPath('/call/c2')
        vi.useFakeTimers()
        const fetchFn = vi.fn().mockResolvedValue({ id: 'c2', asset: 'NVDA' })
        const { result } = renderHook(() => useEntityPopup('call', fetchFn, { pollMs: 20_000 }))

        await act(async () => { await vi.advanceTimersByTimeAsync(0) })
        expect(result.current.entity?.asset).toBe('NVDA')

        fetchFn.mockRejectedValue(new Error('blip'))
        await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
        expect(result.current.entity?.asset).toBe('NVDA')   // not blanked, no error state
        expect(result.current.error).toBeNull()
        vi.useRealTimers()
    })
})
