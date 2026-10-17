import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

// The side pane (phase 8b): it follows the floor, keeps a tab per desk, honours a pin, closes on ✕ / Esc, and on a
// handheld it is a bottom sheet over the app.

let handheld = false
vi.mock('../EntityCard/entityPopup.js', () => ({ isHandheld: () => handheld }))

const { SidePane } = await import('./SidePane.jsx')
const { _resetSidePane, openSurface, sidePaneState } = await import('./sidePane.store.js')

const Mentor = ({ session }) => <p>mentor surface · floor {session.floor}</p>
const Atlas  = () => <p>atlas surface</p>
const surfaces = { mentor: Mentor, portfolio: Atlas }

beforeEach(() => { handheld = false; _resetSidePane() })
afterEach(cleanup)

describe('SidePane', () => {
    it('stays shut while Axl holds the floor, and comes up when a desk takes it', () => {
        const { rerender } = render(<SidePane session={{ floor: 'axl' }} surfaces={surfaces} />)
        expect(screen.queryByRole('dialog')).toBeNull()
        rerender(<SidePane session={{ floor: 'mentor' }} surfaces={surfaces} />)
        expect(screen.getByText('mentor surface · floor mentor')).toBeTruthy()
        expect(screen.getByRole('dialog').className).toContain('side-pane--docked')
    })

    it('the floor going back to Axl leaves it open; another desk adds its tab and comes forward', () => {
        const { rerender } = render(<SidePane session={{ floor: 'mentor' }} surfaces={surfaces} />)
        rerender(<SidePane session={{ floor: 'axl' }} surfaces={surfaces} />)
        expect(screen.getByText(/mentor surface/)).toBeTruthy()
        rerender(<SidePane session={{ floor: 'portfolio' }} surfaces={surfaces} />)
        expect(screen.getByText('atlas surface')).toBeTruthy()
        expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Mentor', 'Atlas'])
        fireEvent.click(screen.getByRole('tab', { name: 'Mentor' }))
        expect(screen.getByText(/mentor surface/)).toBeTruthy()
    })

    it('a pinned desk is not taken over by the floor', () => {
        const { rerender } = render(<SidePane session={{ floor: 'mentor' }} surfaces={surfaces} />)
        fireEvent.click(screen.getByRole('button', { name: 'Pin' }))
        rerender(<SidePane session={{ floor: 'portfolio' }} surfaces={surfaces} />)
        expect(screen.getByText(/mentor surface/)).toBeTruthy()
        expect(screen.getAllByRole('tab')).toHaveLength(2)
    })

    it('✕ and Esc close it; it stays closed until the floor MOVES again', () => {
        const { rerender } = render(<SidePane session={{ floor: 'mentor' }} surfaces={surfaces} />)
        fireEvent.click(screen.getByRole('button', { name: 'Close' }))
        expect(screen.queryByRole('dialog')).toBeNull()
        rerender(<SidePane session={{ floor: 'mentor' }} surfaces={surfaces} />)
        expect(screen.queryByRole('dialog')).toBeNull()
        rerender(<SidePane session={{ floor: 'portfolio' }} surfaces={surfaces} />)
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('a doorway opens a desk outright; a desk with no surface is not shown', () => {
        render(<SidePane session={{ floor: 'axl' }} surfaces={surfaces} />)
        act(() => openSurface('scanner'))
        expect(screen.queryByRole('dialog')).toBeNull()
        act(() => openSurface('mentor'))
        expect(screen.getByText(/mentor surface/)).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Close Mentor' }))
        expect(sidePaneState().tabs).toEqual(['scanner'])
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('on a handheld it is a bottom sheet over the app', () => {
        handheld = true
        render(<SidePane session={{ floor: 'mentor' }} surfaces={surfaces} />)
        const sheet = screen.getByRole('dialog')
        expect(sheet.className).toContain('side-pane--sheet')
        expect(sheet.parentElement).toBe(document.body)
        expect(sheet.getAttribute('aria-modal')).toBe('true')
    })
})
