import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

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
