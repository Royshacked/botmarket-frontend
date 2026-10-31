import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { useBackGesture } from './useBackGesture.js'

// The phone's back gesture, shared by DrawerShell and the Hotlist's row page (code review 2026-10-31): entries NEST.

function Entry({ active, field, k, onBack }) {
    useBackGesture({ active, field, key: k, onBack })
    return null
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, '') })

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
        rerender(<Entry active={false} field="hotlistPage" k="DXC" onBack={() => {}} />)
        expect(back).toHaveBeenCalledTimes(1)
    })
})
