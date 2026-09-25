import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act, cleanup } from '@testing-library/react'
import { openEntityPopup, stashKey, POPUP_KINDS, isHandheld } from './entityPopup.js'
import { useEntityPopup } from '../../customHooks/useEntityPopup.js'
import { eventBus, ENTITY_DETAIL_OPEN } from '../../services/event-bus.service'

// The two halves of one mechanism: the opener hands the entity over, the hook picks it up.
// These pin the hand-off contract — the part that was previously re-implemented per kind and so
// could silently drift (a stash key that doesn't match, an injected property nobody reads).

const setPath = (p) => window.history.replaceState({}, '', p)

// jsdom has no matchMedia at all, which is why every test above reads as a desktop (isHandheld
// falls back to false — the behaviour that has always worked). This is the phone.
const asHandheld = () => { window.matchMedia = (q) => ({ matches: q.includes('coarse') }) }

beforeEach(() => { localStorage.clear(); delete window.__entityData })
afterEach(() => { cleanup(); vi.restoreAllMocks(); delete window.matchMedia })

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

    // ── the second surface ───────────────────────────────────────────────────
    // On a phone `window.open` yields a TAB — no `window.opener`, `window.close()` a no-op, and the
    // service worker stops counting the app's only window as the app. So the same page opens IN the
    // app instead, and every call site gets that without knowing there are two surfaces.
    it('on a handheld it asks the app to open the page, and opens no window', () => {
        asHandheld()
        const open = vi.spyOn(window, 'open').mockReturnValue({})
        const asked = vi.fn()
        const off = eventBus.on(ENTITY_DETAIL_OPEN, asked)

        const result = openEntityPopup('setup', { id: 's1', asset: 'NVDA' })

        expect(open).not.toHaveBeenCalled()
        expect(result).toBeNull()
        expect(asked).toHaveBeenCalledWith({ kind: 'setup', id: 's1' })
        // The stash is written either way — the in-app page paints from it exactly as a window does.
        expect(JSON.parse(localStorage.getItem(stashKey('setup', 's1')))).toEqual({ id: 's1', asset: 'NVDA' })
        off()
    })

    it('a kind with no in-app page still opens a window on a phone — a tab beats nothing', () => {
        asHandheld()
        const open = vi.spyOn(window, 'open').mockReturnValue({})
        const asked = vi.fn()
        const off = eventBus.on(ENTITY_DETAIL_OPEN, asked)

        openEntityPopup('call', 'c1')

        expect(asked).not.toHaveBeenCalled()
        expect(open).toHaveBeenCalled()
        off()
    })

    it('a desktop is untouched: the window, sized, exactly as before', () => {
        window.matchMedia = (q) => ({ matches: q.includes('fine') })
        const open = vi.spyOn(window, 'open').mockReturnValue({})
        const asked = vi.fn()
        const off = eventBus.on(ENTITY_DETAIL_OPEN, asked)

        openEntityPopup('setup', { id: 's1' })

        expect(asked).not.toHaveBeenCalled()
        expect(open).toHaveBeenCalledWith('/setup/s1', 'setup-s1', 'width=1180,height=760')
        off()
    })

    it('isHandheld: a coarse pointer OR the phone breakpoint, and never a throw', () => {
        expect(isHandheld({})).toBe(false)                                        // no matchMedia at all
        expect(isHandheld({ matchMedia: () => ({ matches: false }) })).toBe(false)
        expect(isHandheld({ matchMedia: (q) => ({ matches: q.includes('coarse') }) })).toBe(true)
        expect(isHandheld({ matchMedia: (q) => ({ matches: q.includes('767') }) })).toBe(true)
        expect(isHandheld({ matchMedia: () => { throw new Error('nope') } })).toBe(false)
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
