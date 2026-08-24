import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { IconButton } from './IconButton.jsx'
import { EditButton, DeleteButton } from './EntityCard.jsx'

// The contract every surface now inherits. These are the behaviours that had drifted while five
// copies of this button existed: whether it stops the row's click, whether "unavailable" actually
// disables, and whether the reason for being unavailable ever reaches the user.

afterEach(cleanup)

const Glyph = () => <svg data-testid="glyph" />

describe('IconButton', () => {
    it('stops the click from reaching whatever it sits inside', () => {
        const onClick = vi.fn(), onRow = vi.fn()
        render(
            <div onClick={onRow}>
                <IconButton icon={<Glyph />} title="Do it" onClick={onClick} />
            </div>,
        )
        fireEvent.click(screen.getByTitle('Do it'))
        expect(onClick).toHaveBeenCalledTimes(1)
        expect(onRow).not.toHaveBeenCalled()   // every one of these lives inside a clickable row
    })

    // The pairing that matters: a control that looks dead must BE dead, and must say why.
    it('lockedReason disables the button and becomes the tooltip', () => {
        const onClick = vi.fn()
        render(<IconButton icon={<Glyph />} title="Delete" lockedReason="Close the position first" onClick={onClick} />)

        const btn = screen.getByTitle('Close the position first')
        expect(btn.disabled).toBe(true)
        fireEvent.click(btn)
        expect(onClick).not.toHaveBeenCalled()
    })

    it('carries tone and size as classes, not as per-surface CSS', () => {
        const { container } = render(<IconButton icon={<Glyph />} title="x" tone="danger" size="sm" onClick={vi.fn()} />)
        const btn = container.querySelector('button')
        expect(btn.className).toContain('icon-btn--danger')
        expect(btn.className).toContain('icon-btn--sm')
    })

    it('passes a surface’s own class through for local geometry', () => {
        const { container } = render(<IconButton icon={<Glyph />} title="x" className="scan-list__delete" onClick={vi.fn()} />)
        expect(container.querySelector('.icon-btn.scan-list__delete')).toBeTruthy()
    })
})

describe('EditButton / DeleteButton', () => {
    it('are the same button with a glyph and a meaning', () => {
        const { container } = render(
            <>
                <EditButton onClick={vi.fn()} title="Edit" />
                <DeleteButton onClick={vi.fn()} title="Delete" />
            </>,
        )
        expect(container.querySelectorAll('.icon-btn')).toHaveLength(2)
        // The bin is the only one that colours on approach.
        expect(screen.getByTitle('Delete').className).toContain('icon-btn--danger')
        expect(screen.getByTitle('Edit').className).not.toContain('icon-btn--danger')
    })

    it('a locked pencil is disabled and marked, not merely dimmed', () => {
        const onClick = vi.fn()
        render(<EditButton onClick={onClick} title="Editing is off" locked />)
        const btn = screen.getByTitle('Editing is off')
        expect(btn.disabled).toBe(true)
        expect(btn.className).toContain('icon-btn--locked')
        fireEvent.click(btn)
        expect(onClick).not.toHaveBeenCalled()
    })

    it('resting-red states are tones, and a review-due pencil still clicks', () => {
        const onClick = vi.fn()
        render(<EditButton onClick={onClick} title="Review due" due />)
        const btn = screen.getByTitle('Review due')
        expect(btn.className).toContain('icon-btn--due')
        fireEvent.click(btn)
        expect(onClick).toHaveBeenCalledTimes(1)
    })
})
