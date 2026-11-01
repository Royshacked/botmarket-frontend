import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { useBackGesture } from './useBackGesture.js'

// The phone's back gesture, shared by DrawerShell and the Hotlist's row page (code review 2026-10-31): entries NEST.

function Entry({ active, field, k, onBack }) {
    useBackGesture({ active, field, key: k, onBack })
    return null
}

// The unmount's step back is owed for a tick (module state): let it go before the next test.
afterEach(async () => { cleanup(); await new Promise(r => setTimeout(r, 0)); vi.restoreAllMocks(); window.history.replaceState(null, '') })

describe('useBackGesture', () => {
    it('nested: a back pops the page above, not the panel under it; the next back pops the panel', () => {
        const panel = vi.fn(), page = vi.fn()
        window.history.replaceState(null, '')
        render(<><Entry active field="detailPanel" k="hotlist" onBack={panel} /><Entry active field="hotlistPage" k="DXC" onBack={page} /></>)
        expect(window.history.state).toMatchObject({ detailPanel: 'hotlist', hotlistPage: 'DXC' })
        // A real back lands on the panel's own entry.
        act(() => { window.history.replaceState({ detailPanel: 'hotlist' }, ''); window.dispatchEvent(new PopStateEvent('popstate')) })
        expect(page).toHaveBeenCalledTimes(1)
        expect(panel).not.toHaveBeenCalled()
        act(() => { window.history.replaceState(null, ''); window.dispatchEvent(new PopStateEvent('popstate')) })
        expect(panel).toHaveBeenCalledTimes(1)
    })

    it('inactive pushes nothing; closed another way, it steps back over its own entry', () => {
        const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
        const { rerender } = render(<Entry active={false} field="hotlistPage" k="DXC" onBack={() => {}} />)
        expect(window.history.state?.hotlistPage).toBeUndefined()
        rerender(<Entry active field="hotlistPage" k="DXC" onBack={() => {}} />)
        vi.useFakeTimers()
        rerender(<Entry active={false} field="hotlistPage" k="DXC" onBack={() => {}} />)
        vi.runAllTimers()
        vi.useRealTimers()
        expect(back).toHaveBeenCalledTimes(1)
    })

    // Bug 2026-11-01: the map's Board button closed the map and opened the board in one click; the map's late back
    // landed under the board's entry and closed it. A swap is one entry: the newcomer replaces it, no back at all.
    it('a window swapped for another of the same field takes over its entry — no back, and the newcomer stays', () => {
        const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
        const push = vi.spyOn(window.history, 'pushState')
        const map = vi.fn(), board = vi.fn()
        vi.useFakeTimers()
        const { rerender } = render(<Entry active field="detailPanel" k="forecasts" onBack={map} />)
        rerender(<Entry active field="detailPanel" k="floor:board" onBack={board} />)
        vi.runAllTimers()
        vi.useRealTimers()
        expect(back).not.toHaveBeenCalled()
        expect(push).toHaveBeenCalledTimes(1)
        expect(window.history.state).toMatchObject({ detailPanel: 'floor:board' })
        expect(board).not.toHaveBeenCalled()
        // The user's back now closes the board.
        act(() => { window.history.replaceState(null, ''); window.dispatchEvent(new PopStateEvent('popstate')) })
        expect(board).toHaveBeenCalledTimes(1)
        expect(map).not.toHaveBeenCalled()
    })
})
