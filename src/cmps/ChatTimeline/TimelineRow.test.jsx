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

    // The ask is the app's own delete dialog (DeleteConfirmDialog, the triggered-idea dialog's look) — never window.confirm.
    const dialog = () => document.querySelector('body > .delete-idea__backdrop [role="dialog"]')

    it('asks in the app\'s delete dialog, then deletes the row; Cancel keeps it', async () => {
        const native = vi.spyOn(window, 'confirm')
        const api = { list: vi.fn(async () => past), messages: vi.fn(), remove: vi.fn(async () => ({ ok: true })) }
        render(<SessionHistory onClose={() => {}} api={api} />)
        const del = await screen.findByRole('button', { name: 'Delete What moved oil today?' })
        fireEvent.click(del)
        expect(dialog()).toBeTruthy()
        expect(dialog().textContent).toMatch(/Delete session/)
        expect(dialog().textContent).toMatch(/What moved oil today\?/)
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(dialog()).toBeNull()
        expect(api.remove).not.toHaveBeenCalled()
        fireEvent.click(del)
        fireEvent.click(screen.getByRole('button', { name: 'Delete session' }))
        await waitFor(() => expect(api.remove).toHaveBeenCalledWith('a'))
        await waitFor(() => expect(screen.queryByText('What moved oil today?')).toBeNull())
        expect(dialog()).toBeNull()
        expect(screen.getByText('NVDA earnings')).toBeTruthy()
        expect(native).not.toHaveBeenCalled()
        native.mockRestore()
    })

    it('Escape closes the ask first — History stays open', async () => {
        const onClose = vi.fn()
        const api = { list: vi.fn(async () => past), messages: vi.fn(), remove: vi.fn() }
        render(<SessionHistory onClose={onClose} api={api} />)
        fireEvent.click(await screen.findByRole('button', { name: 'Delete NVDA earnings' }))
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(dialog()).toBeNull()
        expect(onClose).not.toHaveBeenCalled()
    })

    it('a session being read can be deleted from its own view, which goes back to the list', async () => {
        const api = { list: vi.fn(async () => past), messages: vi.fn(async () => []), remove: vi.fn(async () => ({ ok: true })) }
        render(<SessionHistory onClose={() => {}} api={api} />)
        fireEvent.click(await screen.findByText('NVDA earnings'))
        fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
        fireEvent.click(screen.getByRole('button', { name: 'Delete session' }))
        await waitFor(() => expect(api.remove).toHaveBeenCalledWith('b'))
        expect(await screen.findByText('Past sessions')).toBeTruthy()
    })

    it('a refused delete says so and keeps the row', async () => {
        const api = { list: vi.fn(async () => past), messages: vi.fn(), remove: vi.fn(async () => { throw new Error('nope') }) }
        render(<SessionHistory onClose={() => {}} api={api} />)
        fireEvent.click(await screen.findByRole('button', { name: 'Delete NVDA earnings' }))
        fireEvent.click(screen.getByRole('button', { name: 'Delete session' }))
        expect(await screen.findByText(/Could not delete that session|nope/)).toBeTruthy()
        expect(screen.getByText('NVDA earnings')).toBeTruthy()
    })
})

describe('SessionHistory — a past session read (2026-10-18)', () => {
    it('leaves out the opening "back with Axl" line — it was for the moment, not the record', async () => {
        const api = {
            list: vi.fn(async () => [{ sessionId: 'a', status: 'archived', title: 'hi', archivedAt: 1 }]),
            messages: vi.fn(async () => [
                { seq: 1, agent: 'axl', role: 'assistant', kind: 'sealed', content: '✓ Mentor built NVDA setup — saved. You\'re back with Axl.', ref: { kind: 'setup', ids: ['s1'], ended: true } },
                { seq: 2, agent: 'axl', role: 'user', kind: 'msg', content: 'hi' },
            ]),
        }
        render(<SessionHistory onClose={() => {}} api={api} />)
        fireEvent.click(await screen.findByText('hi'))
        await waitFor(() => expect(document.querySelectorAll('.chat-timeline__history-thread .chat-timeline__row').length).toBe(1))
        expect(screen.queryByText(/back with Axl/)).toBeNull()
    })
})

describe('SessionHistory — pick a past session back up (Roy, 2026-10-19)', () => {
    const past = [{ sessionId: 'a', status: 'archived', title: 'What moved oil today?', archivedAt: 1 }]
    const api = () => ({ list: vi.fn(async () => past), messages: vi.fn(async () => [{ seq: 1, agent: 'axl', role: 'user', kind: 'msg', content: 'oil?' }]) })
    const openIt = async (props) => {
        render(<SessionHistory api={api()} {...props} />)
        fireEvent.click(await screen.findByText('What moved oil today?'))
        return screen.findByPlaceholderText('Continue this session…')
    }

    it('an open session has the input; writing resumes it with the message, then History closes', async () => {
        const onResume = vi.fn(async () => null)
        const onClose = vi.fn()
        const box = await openIt({ onResume, onClose })
        expect(screen.getByText(/your current chat moves to History/)).toBeTruthy()
        fireEvent.change(box, { target: { value: '  and gold?  ' } })
        fireEvent.keyDown(box, { key: 'Enter' })
        await waitFor(() => expect(onResume).toHaveBeenCalledWith('a', 'and gold?'))
        await waitFor(() => expect(onClose).toHaveBeenCalled())
    })

    it('a refused resume says why and stays open', async () => {
        const onClose = vi.fn()
        const box = await openIt({ onResume: vi.fn(async () => 'Could not pick that session back up'), onClose })
        fireEvent.change(box, { target: { value: 'go' } })
        fireEvent.keyDown(box, { key: 'Enter' })
        expect(await screen.findByText('Could not pick that session back up')).toBeTruthy()
        expect(onClose).not.toHaveBeenCalled()
    })

    it('waits while a reply runs in the current chat — the put-away would cut it off', async () => {
        const onResume = vi.fn(async () => null)
        const box = await openIt({ onResume, onClose: () => {}, busy: true })
        expect(screen.getByText(/Wait for the reply in your current chat/)).toBeTruthy()
        fireEvent.change(box, { target: { value: 'go' } })
        fireEvent.keyDown(box, { key: 'Enter' })
        expect(onResume).not.toHaveBeenCalled()
    })

    it('without onResume it stays read-only — no input', async () => {
        render(<SessionHistory api={api()} onClose={() => {}} />)
        fireEvent.click(await screen.findByText('What moved oil today?'))
        await waitFor(() => expect(document.querySelectorAll('.chat-timeline__history-thread .chat-timeline__row').length).toBe(1))
        expect(screen.queryByPlaceholderText('Continue this session…')).toBeNull()
    })
})
