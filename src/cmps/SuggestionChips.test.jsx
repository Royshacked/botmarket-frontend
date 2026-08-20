import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SuggestionChips } from './SuggestionChips.jsx'

afterEach(cleanup)

// One row, one look, every desk. A chip that DOES something is still a chip — the alternative was a
// second kind of button per desk, which is how one desk ends up looking like a different app.
describe('SuggestionChips', () => {
    it('sends a plain string as the user’s next message', () => {
        const onPick = vi.fn()
        render(<SuggestionChips suggestions={['Why is MU down?']} onPick={onPick} />)

        fireEvent.click(screen.getByRole('button', { name: 'Why is MU down?' }))
        expect(onPick).toHaveBeenCalledWith('Why is MU down?')
    })

    it('runs an action chip’s own handler instead, and never sends it as a message', () => {
        const onPick = vi.fn()
        const open   = vi.fn()
        render(<SuggestionChips suggestions={['Say this', { label: 'Do this', onPick: open, action: true }]} onPick={onPick} />)

        fireEvent.click(screen.getByRole('button', { name: 'Do this' }))
        expect(open).toHaveBeenCalledTimes(1)
        // The row's onPick is for things that get SAID. An action chip saying itself would post a
        // sentence the user never wrote — the same mistake the express hand-off used to make.
        expect(onPick).not.toHaveBeenCalled()
    })

    it('marks an action chip so it can be told apart, without dressing it up', () => {
        render(<SuggestionChips suggestions={[{ label: 'Do this', onPick: vi.fn(), action: true }]} />)
        expect(screen.getByRole('button', { name: 'Do this' }).className).toContain('is-action')
    })

    it('disables every kind together — a loading turn takes the whole row out', () => {
        render(<SuggestionChips suggestions={['Say this', { label: 'Do this', onPick: vi.fn() }]} disabled />)
        for (const name of ['Say this', 'Do this']) {
            expect(screen.getByRole('button', { name }).disabled).toBe(true)
        }
    })

    it('drops a malformed chip rather than rendering an empty button', () => {
        render(<SuggestionChips suggestions={['Real', { onPick: vi.fn() }, null]} onPick={vi.fn()} />)
        expect(screen.getAllByRole('button')).toHaveLength(1)
    })
})
