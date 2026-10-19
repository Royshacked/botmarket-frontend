import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { PaneToggle } from './PaneToggle.jsx'
import { _resetSidePane, openSurface, closePane, sidePaneState } from './sidePane.store.js'

// The chat header's Show / Hide for the side pane (Roy, 2026-10-18): closing the pane left no way back to a desk's work.

const Mentor = () => null
const Ticket = () => null
Ticket.paneLabel = 'Order ticket'
const surfaces = { mentor: Mentor, portfolio: () => null, ticket: Ticket }

beforeEach(() => _resetSidePane())
afterEach(cleanup)

describe('PaneToggle', () => {
    it('no button while Axl holds the floor and nothing was hidden', () => {
        render(<PaneToggle floor="axl" surfaces={surfaces} />)
        expect(screen.queryByRole('button')).toBeNull()
    })

    it('open → "Hide …"; a press closes the pane; then "Show …" brings the same tabs back', () => {
        act(() => { openSurface('mentor'); openSurface('portfolio') })
        render(<PaneToggle floor="portfolio" surfaces={surfaces} />)
        const btn = screen.getByRole('button', { name: 'Hide Atlas\'s work' })
        expect(btn.getAttribute('aria-expanded')).toBe('true')
        fireEvent.click(btn)
        expect(sidePaneState().tabs).toEqual([])
        fireEvent.click(screen.getByRole('button', { name: 'Show Atlas\'s work' }))
        expect(sidePaneState().tabs).toEqual(['mentor', 'portfolio'])
        expect(sidePaneState().active).toBe('portfolio')
    })

    it('nothing hidden but a desk holds the floor → it offers that desk\'s work', () => {
        render(<PaneToggle floor="mentor" surfaces={surfaces} />)
        fireEvent.click(screen.getByRole('button', { name: 'Show Mentor\'s work' }))
        expect(sidePaneState().active).toBe('mentor')
    })

    it('a surface with its own label (the ticket) is named by it', () => {
        act(() => { openSurface('ticket'); closePane() })
        render(<PaneToggle floor="axl" surfaces={surfaces} />)
        expect(screen.getByRole('button', { name: 'Show Order ticket' })).toBeTruthy()
    })
})
