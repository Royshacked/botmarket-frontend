import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { CoverageActions } from './CoverageActions.jsx'

// Retire and Delete are DIFFERENT operations wearing similar words: retire archives the thesis and
// keeps its revision trail, delete removes the document for good. The confirm step is the only thing
// standing between a click and losing that history, so it is what these tests pin down.

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const cov = (over = {}) => ({ id: 'cov1', symbol: 'TSM', status: 'active', revisions: [{}, {}, {}], ...over })
const btn = name => screen.getByRole('button', { name: new RegExp(`^${name}$`, 'i') })

describe('CoverageActions', () => {
    it('offers edit, retire and delete on a live thesis', () => {
        render(<CoverageActions coverage={cov()} onEdit={vi.fn()} onRetire={vi.fn()} onDelete={vi.fn()} />)
        for (const label of ['Edit', 'Retire', 'Delete']) expect(btn(label)).toBeTruthy()
    })

    it('renders only the handlers it was given', () => {
        render(<CoverageActions coverage={cov()} onEdit={vi.fn()} />)
        expect(btn('Edit')).toBeTruthy()
        expect(screen.queryByRole('button', { name: /retire/i })).toBeNull()
        expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
    })

    it('hides retire on an already-retired name — but keeps delete', () => {
        render(<CoverageActions coverage={cov({ status: 'retired' })} onRetire={vi.fn()} onDelete={vi.fn()} />)
        expect(screen.queryByRole('button', { name: /retire/i })).toBeNull()
        expect(btn('Delete')).toBeTruthy()
    })

    it('edit and retire fire straight away — neither loses anything', () => {
        const onEdit = vi.fn(), onRetire = vi.fn()
        render(<CoverageActions coverage={cov()} onEdit={onEdit} onRetire={onRetire} />)
        fireEvent.click(btn('Edit'))
        fireEvent.click(btn('Retire'))
        expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'TSM' }))
        expect(onRetire).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'TSM' }))
    })

    it('delete does NOT fire on the first click — it asks, and names what is lost', () => {
        const onDelete = vi.fn()
        render(<CoverageActions coverage={cov()} onDelete={onDelete} />)
        fireEvent.click(btn('Delete'))
        expect(onDelete).not.toHaveBeenCalled()
        expect(screen.getByText(/Delete TSM \+ 3 revisions\?/)).toBeTruthy()
    })

    it('confirming deletes; cancelling leaves the thesis alone', () => {
        const onDelete = vi.fn()
        const { rerender } = render(<CoverageActions coverage={cov()} onDelete={onDelete} />)

        fireEvent.click(btn('Delete'))          // ask
        fireEvent.click(btn('No'))
        expect(onDelete).not.toHaveBeenCalled()
        expect(btn('Delete')).toBeTruthy()      // back to the resting row

        fireEvent.click(btn('Delete'))          // ask again
        fireEvent.click(btn('Yes'))             // confirm
        expect(onDelete).toHaveBeenCalledTimes(1)

        rerender(<CoverageActions coverage={cov()} onDelete={onDelete} />)
        expect(screen.queryByText(/^Delete TSM/)).toBeNull()   // the confirm does not stick around
    })

    it('a thesis with no revisions still confirms, without claiming lost history', () => {
        render(<CoverageActions coverage={cov({ revisions: [] })} onDelete={vi.fn()} />)
        fireEvent.click(btn('Delete'))
        expect(screen.getByText(/Delete TSM\?/)).toBeTruthy()
    })

    it('clicks never reach the row underneath — the row toggles open/closed', () => {
        const onRowClick = vi.fn()
        render(
            <div onClick={onRowClick}>
                <CoverageActions coverage={cov()} onEdit={vi.fn()} onRetire={vi.fn()} onDelete={vi.fn()} />
            </div>,
        )
        fireEvent.click(btn('Edit'))
        fireEvent.click(btn('Delete'))
        expect(onRowClick).not.toHaveBeenCalled()
    })
})
