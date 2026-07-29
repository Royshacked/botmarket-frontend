import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { EntityCard, SymbolCell, StatusBadge, DeleteButton } from './EntityCard.jsx'

// EntityCard is the shell every entity list renders into. The rules pinned here are the ones each
// card used to re-implement (and could re-diverge on): which clicks open the card, and which
// controls are inert when the entity is locked.

afterEach(cleanup)

describe('EntityCard click routing', () => {
    it('opens on a body click', () => {
        const onOpen = vi.fn()
        const { container } = render(
            <EntityCard status="waiting" title={<span>NQ</span>} summary={<span>summary</span>} onOpen={onOpen} />,
        )
        fireEvent.click(container.querySelector('.idea-card__body'))
        expect(onOpen).toHaveBeenCalledTimes(1)
    })

    it('does NOT open when a control is clicked — the buttons handle themselves', () => {
        const onOpen = vi.fn()
        const onDelete = vi.fn()
        const { container } = render(
            <EntityCard
                status="waiting"
                title={<span>NQ</span>}
                controls={<DeleteButton onClick={onDelete} />}
                onOpen={onOpen}
            />,
        )
        fireEvent.click(container.querySelector('.idea-card__delete'))
        expect(onDelete).toHaveBeenCalledTimes(1)
        expect(onOpen).not.toHaveBeenCalled()
    })

    it('does NOT open when the ticker is clicked — that goes to the chart', () => {
        const onOpen = vi.fn()
        const onSymbolClick = vi.fn()
        const { container } = render(
            <EntityCard
                status="waiting"
                title={<SymbolCell symbol="NQ" onSymbolClick={onSymbolClick} />}
                onOpen={onOpen}
            />,
        )
        fireEvent.click(container.querySelector('.idea-card__sym'))
        expect(onSymbolClick).toHaveBeenCalledWith('NQ')
        expect(onOpen).not.toHaveBeenCalled()
    })

    it('is inert with no onOpen — a draft still building is not clickable', () => {
        const { container } = render(<EntityCard status="building" title={<span>NQ</span>} />)
        // No throw, and the cursor says so.
        fireEvent.click(container.querySelector('.idea-card__body'))
        expect(container.querySelector('.idea-card').style.cursor).toBe('default')
    })

    it('carries the lifecycle status as a modifier class', () => {
        const { container } = render(<EntityCard status="long" title={<span>NQ</span>} />)
        expect(container.querySelector('.idea-card--long')).toBeTruthy()
    })
})

describe('shared controls', () => {
    it('DeleteButton with a lockedReason is disabled and explains itself', () => {
        const onDelete = vi.fn()
        const { container } = render(
            <DeleteButton onClick={onDelete} lockedReason="In a live position — close it at the broker first" />,
        )
        const btn = container.querySelector('.idea-card__delete')
        expect(btn.disabled).toBe(true)
        expect(btn.title).toMatch(/live position/i)
        fireEvent.click(btn)
        expect(onDelete).not.toHaveBeenCalled()
    })

    it('StatusBadge is a plain badge without onToggle, a button with it', () => {
        const { container: readOnly } = render(<StatusBadge status="hit" label="Triggered" />)
        expect(readOnly.querySelector('button')).toBeNull()
        expect(readOnly.querySelector('.idea-card__status-badge')).toBeTruthy()

        const onToggle = vi.fn()
        const { container: toggle } = render(<StatusBadge status="waiting" label="Arm it" onToggle={onToggle} />)
        fireEvent.click(toggle.querySelector('.idea-card__status-toggle'))
        expect(onToggle).toHaveBeenCalledTimes(1)
    })

    it('StatusBadge can borrow another kind\'s icon without renaming its own status', () => {
        // The call pop-out uses this: a position filled SHORT shows the short icon, taken from
        // position_state.entry.direction rather than from the status word.
        const { container } = render(<StatusBadge status="long" iconStatus="short" label="in position" />)
        expect(container.querySelector('.status--short')).toBeTruthy()
    })
})
