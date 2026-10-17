import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

// History is read-only: a card there is its words and how it ended, never live buttons (phase 7 CR).
vi.mock('../../services/entityResolve.js', () => ({ resolveForEdit: vi.fn(async () => null) }))
vi.mock('../EntityCard/entityPopup.js', () => ({ openEntityPopup: vi.fn() }))
const { TimelineRow } = await import('./TimelineRow.jsx')
const { SessionHistory } = await import('./SessionHistory.jsx')
afterEach(cleanup)

const card = { seq: 1, agent: 'axl', role: 'assistant', kind: 'card', content: 'Want today’s brief?', ref: { msgId: 'm1', conversationId: 'c1', type: 'market_brief_offer' }, card: { payload: {}, actions: { primary: { label: 'Show me' } }, status: 'pending' } }

describe('TimelineRow — read-only', () => {
    it('a card in history shows its words, no buttons', () => {
        render(<TimelineRow row={card} readOnly onChoose={async () => null} onResolveCard={() => {}} />)
        expect(screen.getByText(/Want today’s brief\?/)).toBeTruthy()
        expect(screen.queryByRole('button')).toBeNull()
    })

    it('the same card live keeps its buttons', () => {
        render(<TimelineRow row={card} onChoose={async () => null} onResolveCard={() => {}} />)
        expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
    })
})

describe('SessionHistory — a dialog', () => {
    it('focuses its close button and closes on Escape', async () => {
        const onClose = vi.fn()
        const api = { list: vi.fn(async () => []), messages: vi.fn() }
        render(<SessionHistory onClose={onClose} api={api} />)
        expect(document.activeElement.getAttribute('aria-label')).toBe('Close')
        fireEvent.keyDown(window, { key: 'Escape' })
        expect(onClose).toHaveBeenCalled()
    })
})
