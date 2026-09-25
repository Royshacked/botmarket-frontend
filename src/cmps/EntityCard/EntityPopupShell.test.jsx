import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { EntityPopupShell } from './EntityPopupShell.jsx'

// The shell is the frame both detail pages share. What is pinned here is the ONE thing that differs
// between its two surfaces: a pop-out WINDOW has the OS's close button, and the in-app page has no
// chrome at all — so without a back arrow it is a wall the user can only leave by guessing that the
// browser's back gesture works here.

afterEach(cleanup)

describe('EntityPopupShell — the way out', () => {
    it('a window gets no back arrow: it has a title bar of its own', () => {
        render(<EntityPopupShell asset="NVDA" />)
        expect(screen.queryByLabelText('Back')).toBeNull()
    })

    it('in the app the arrow is there, and it calls back', () => {
        const onClose = vi.fn()
        render(<EntityPopupShell asset="NVDA" onClose={onClose} />)

        fireEvent.click(screen.getByLabelText('Back'))

        expect(onClose).toHaveBeenCalled()
    })

    // The state where a way out matters most: nothing loaded, so there is nothing else on screen to
    // press. Both empty states are centred flex boxes that used to render the copy alone.
    it('the empty states keep the arrow — a failed load must not be a dead end', () => {
        const onClose = vi.fn()
        const { rerender } = render(<EntityPopupShell loading onClose={onClose} />)
        expect(screen.getByLabelText('Back')).toBeTruthy()

        rerender(<EntityPopupShell error="Setup not found" onClose={onClose} />)
        expect(screen.getByText('Setup not found')).toBeTruthy()
        fireEvent.click(screen.getByLabelText('Back'))
        expect(onClose).toHaveBeenCalled()
    })
})
