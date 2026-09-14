import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { SleeveSourcedBubble } from './ChatWindow.jsx'
import { eventBus, RESUME_BUILD } from '../../services/event-bus.service'

// The bubble's module (ChatWindow.jsx) pulls in axios-backed service modules at load time.
// Stub them so the tree mounts without touching the network.
vi.mock('../../services/manual/manual.service.remote', () => ({
    manualService: {},
}))

// Atlas's "sleeve sourced" card: the server screened a sleeve and researched the hits (sleeveSource),
// and the pool now holds what it holds. The card's one job is to take the user BACK TO THE BUILD.
const msg = (payload = {}) => ({
    id:      'm1',
    type:    'sleeve_sourced',
    content: 'Technology sleeve sourced (quality-value): 2 of 3 screened names now in coverage — AAA, CCC; 1 passed on (no edge). Resume the build and Atlas allocates from coverage.',
    actions: { primary: { label: 'Resume build' }, dismiss: true },
    payload: {
        kind: 'portfolio', sleeveId: 'slv_1', sector: 'Technology', school: 'quality-value',
        threadId: 't1', portfolioId: null, screened: 3, inBook: 2,
        covered: ['AAA', 'CCC'], skipped: [], passed: ['BBB'], failed: [], unresolved: [],
        ...payload,
    },
})

describe('SleeveSourcedBubble', () => {
    afterEach(cleanup)

    it('reads as Atlas, names the sleeve and the count, and resumes the construction THREAD', () => {
        const onClose = vi.fn()
        const heard   = vi.fn()
        const off     = eventBus.on(RESUME_BUILD, heard)

        render(<SleeveSourcedBubble msg={msg()} onClose={onClose} onResolve={vi.fn()} />)
        expect(screen.getByText(/Sleeve · Technology \(quality-value\) — 2 of 3 in coverage/)).toBeTruthy()
        fireEvent.click(screen.getByText('Resume build'))

        expect(heard).toHaveBeenCalledTimes(1)
        expect(heard.mock.calls[0][0]).toEqual({ threadId: 't1', portfolioId: null })
        expect(onClose).toHaveBeenCalled()
        off()
    })

    it('a sleeve sourced for a book that already exists resumes that book', () => {
        const heard = vi.fn()
        const off   = eventBus.on(RESUME_BUILD, heard)
        render(<SleeveSourcedBubble msg={msg({ threadId: null, portfolioId: 'p9' })} onClose={vi.fn()} onResolve={vi.fn()} />)
        fireEvent.click(screen.getByText('Resume build'))
        expect(heard.mock.calls[0][0]).toEqual({ threadId: null, portfolioId: 'p9' })
        off()
    })
})
