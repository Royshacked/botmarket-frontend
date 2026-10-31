import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { DrawerShell } from './DrawerShell.jsx'

// The drawer's shared mechanics (phase 8b): Esc closes the TOP one, focus goes in and comes back, a handheld's back
// gesture closes it, and it renders in place or where it is portalled. DetailPanel's own suite runs on it too.

afterEach(cleanup)

describe('DrawerShell', () => {
    it('renders nothing closed; in place, or into its target, open', () => {
        const { rerender } = render(<DrawerShell isOpen={false} onClose={() => {}} label="A">body</DrawerShell>)
        expect(screen.queryByRole('dialog')).toBeNull()
        const target = document.createElement('div')
        document.body.appendChild(target)
        rerender(<DrawerShell isOpen onClose={() => {}} label="A" portalTo={target}>body</DrawerShell>)
        expect(target.querySelector('[role="dialog"]')?.textContent).toBe('body')
        target.remove()
    })

    it('Esc closes the drawer opened LAST — the one underneath stays', () => {
        const under = vi.fn(), over = vi.fn()
        render(<>
            <DrawerShell isOpen onClose={under} label="under">u</DrawerShell>
            <DrawerShell isOpen onClose={over} label="over">o</DrawerShell>
        </>)
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(over).toHaveBeenCalledTimes(1)
        expect(under).not.toHaveBeenCalled()
    })

    it('an Esc something inside already handled closes nothing', () => {
        const close = vi.fn()
        render(<DrawerShell isOpen onClose={close} label="A"><input aria-label="inner" onKeyDown={e => e.preventDefault()} /></DrawerShell>)
        fireEvent.keyDown(screen.getByLabelText('inner'), { key: 'Escape' })
        expect(close).not.toHaveBeenCalled()
    })

    it('takes focus on open and gives it back on close', () => {
        const opener = document.createElement('button')
        document.body.appendChild(opener)
        opener.focus()
        const { rerender } = render(<DrawerShell isOpen onClose={() => {}} label="A">x</DrawerShell>)
        expect(document.activeElement).toBe(screen.getByRole('dialog'))
        rerender(<DrawerShell isOpen={false} onClose={() => {}} label="A">x</DrawerShell>)
        expect(document.activeElement).toBe(opener)
        opener.remove()
    })

    it('marks a history entry when asked; the back gesture closes it, any other close steps back over it', () => {
        const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
        const close = vi.fn()
        const { rerender } = render(<DrawerShell isOpen onClose={close} label="A" history={{ field: 'sidePane', key: 'pane' }}>x</DrawerShell>)
        expect(window.history.state?.sidePane).toBe('pane')
        // A real back lands on the entry below, whose state does not carry the key (useBackGesture ignores a pop that does).
        window.history.replaceState(null, '')
        window.dispatchEvent(new PopStateEvent('popstate'))
        expect(close).toHaveBeenCalledTimes(1)
        rerender(<DrawerShell isOpen={false} onClose={close} label="A" history={{ field: 'sidePane', key: 'pane' }}>x</DrawerShell>)
        expect(back).not.toHaveBeenCalled()   // the pop already stepped back

        window.history.pushState({ sidePane: 'pane' }, '')
        const again = render(<DrawerShell isOpen onClose={close} label="B" history={{ field: 'sidePane', key: 'pane' }}>y</DrawerShell>)
        again.rerender(<DrawerShell isOpen={false} onClose={close} label="B" history={{ field: 'sidePane', key: 'pane' }}>y</DrawerShell>)
        expect(back).toHaveBeenCalledTimes(1)
        back.mockRestore()
    })
})
