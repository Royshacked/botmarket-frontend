import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

vi.mock('../../services/entityResolve.js', () => ({ resolveForEdit: vi.fn(async () => null) }))
vi.mock('../EntityCard/entityPopup.js', () => ({ openEntityPopup: vi.fn() }))
const { TimelineRow } = await import('./TimelineRow.jsx')
const { SessionHistory } = await import('./SessionHistory.jsx')
afterEach(cleanup)

// Desk cards are not timeline rows (they live in the social chat — reverted 2026-10-18): a card row left in an
// old session reads as its words, never as a live card.
describe('TimelineRow — a leftover card row', () => {
    it('reads as plain words, with no card buttons', () => {
        const old = { seq: 1, agent: 'axl', role: 'assistant', kind: 'card', content: 'Want today’s brief?', ref: { msgId: 'm1' } }
        const { container } = render(<TimelineRow row={old} onChoose={async () => null} />)
        expect(screen.getByText(/Want today’s brief\?/)).toBeTruthy()
        expect(container.querySelector('.chat-timeline__card')).toBeNull()
        expect(screen.queryByRole('button')).toBeNull()
    })
})

describe('SessionHistory — a dialog', () => {
    it('focuses its close button and closes on Escape', async () => {
        const onClose = vi.fn()
        const api = { list: vi.fn(async () => []), messages: vi.fn() }
        render(<SessionHistory onClose={onClose} api={api} />)
        expect(document.activeElement.getAttribute('aria-label')).toBe('Close')
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(onClose).toHaveBeenCalled()
    })

    it('claims its Escape, so a drawer under it (the side pane) stays open — one Esc, one layer (8b CR)', () => {
        const onClose = vi.fn()
        const api = { list: vi.fn(async () => []), messages: vi.fn() }
        let seen = null
        const under = (e) => { seen = e.defaultPrevented }
        document.addEventListener('keydown', under)
        render(<SessionHistory onClose={onClose} api={api} />)
        fireEvent.keyDown(document, { key: 'Escape' })
        document.removeEventListener('keydown', under)
        expect(onClose).toHaveBeenCalledTimes(1)
        expect(seen).toBe(true)
    })
})

describe('SessionHistory — delete (Roy, 2026-10-18)', () => {
    const past = [{ sessionId: 'a', status: 'archived', title: 'What moved oil today?', archivedAt: 1 }, { sessionId: 'b', status: 'archived', title: 'NVDA earnings', archivedAt: 2 }]

    it('asks, then deletes the row; a no keeps it', async () => {
        const ask = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
        const api = { list: vi.fn(async () => past), messages: vi.fn(), remove: vi.fn(async () => ({ ok: true })) }
        render(<SessionHistory onClose={() => {}} api={api} />)
        const del = await screen.findByRole('button', { name: 'Delete What moved oil today?' })
        fireEvent.click(del)
        expect(api.remove).not.toHaveBeenCalled()
        fireEvent.click(del)
        await waitFor(() => expect(api.remove).toHaveBeenCalledWith('a'))
        await waitFor(() => expect(screen.queryByText('What moved oil today?')).toBeNull())
        expect(screen.getByText('NVDA earnings')).toBeTruthy()
        expect(ask.mock.calls[0][0]).toMatch(/Delete “What moved oil today\?”\?/)
        ask.mockRestore()
    })

    it('a session being read can be deleted from its own view, which goes back to the list', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        const api = { list: vi.fn(async () => past), messages: vi.fn(async () => []), remove: vi.fn(async () => ({ ok: true })) }
        render(<SessionHistory onClose={() => {}} api={api} />)
        fireEvent.click(await screen.findByText('NVDA earnings'))
        fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
        await waitFor(() => expect(api.remove).toHaveBeenCalledWith('b'))
        expect(await screen.findByText('Past sessions')).toBeTruthy()
        window.confirm.mockRestore()
    })

    it('a refused delete says so and keeps the row', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        const api = { list: vi.fn(async () => past), messages: vi.fn(), remove: vi.fn(async () => { throw new Error('nope') }) }
        render(<SessionHistory onClose={() => {}} api={api} />)
        fireEvent.click(await screen.findByRole('button', { name: 'Delete NVDA earnings' }))
        expect(await screen.findByText(/Could not delete that session|nope/)).toBeTruthy()
        expect(screen.getByText('NVDA earnings')).toBeTruthy()
        window.confirm.mockRestore()
    })
})
