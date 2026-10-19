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

    it('says what it is: the showing surface’s hint under the tabs; none for a surface without one (Roy, 2026-10-19)', () => {
        const Hinted = () => <p>hinted surface</p>
        Hinted.paneHint = 'Your setup, as you build it.'
        const { rerender } = render(<SidePane session={{ floor: 'mentor' }} surfaces={{ mentor: Hinted, portfolio: Atlas }} />)
        expect(screen.getByText('Your setup, as you build it.').className).toBe('side-pane__hint')
        rerender(<SidePane session={{ floor: 'portfolio' }} surfaces={{ mentor: Hinted, portfolio: Atlas }} />)
        expect(screen.queryByText('Your setup, as you build it.')).toBeNull()
    })

    it('every desk surface carries a hint', async () => {
        const mods = await Promise.all([
            import('../MentorSurface/MentorSurface.jsx'), import('../PortfolioSurface/PortfolioSurface.jsx'),
            import('../ScannerSurface/ScannerSurface.jsx'), import('../AnalystSurface/AnalystSurface.jsx'),
        ])
        const hints = [mods[0].MentorSurface, mods[1].PortfolioSurface, mods[2].ScannerSurface, mods[3].AnalystSurface].map(s => s.paneHint)
        for (const h of hints) expect(typeof h === 'string' && h.length > 20).toBe(true)
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

    it('8e: a KEPT surface keeps its state while the pane closes and other tabs show; its own ✕ ends it', () => {
        // A desk with its own conversation (Pythia's, Aether's panels) or a half-typed order (the ticket).
        const Typed = () => <input aria-label="kept input" />
        Typed.keepMounted = true
        Typed.paneLabel = 'Order ticket'
        const kept = { ...surfaces, ticket: Typed }
        render(<SidePane session={{ floor: 'axl' }} surfaces={kept} />)
        act(() => openSurface('ticket'))
        expect(screen.getByRole('tab', { name: 'Order ticket' })).toBeTruthy()
        fireEvent.change(screen.getByLabelText('kept input'), { target: { value: 'NVDA 10' } })

        act(() => openSurface('mentor'))                        // another tab shows…
        act(() => openSurface('ticket'))
        expect(screen.getByLabelText('kept input').value).toBe('NVDA 10')
        fireEvent.click(screen.getByRole('button', { name: 'Close' }))   // …the pane closes…
        expect(screen.queryByRole('dialog')).toBeNull()
        act(() => openSurface('ticket'))                        // …and it is all still there
        expect(screen.getByLabelText('kept input').value).toBe('NVDA 10')

        fireEvent.click(screen.getByRole('button', { name: 'Close Order ticket' }))
        act(() => openSurface('ticket'))
        expect(screen.getByLabelText('kept input').value).toBe('', 'closing its own tab ended it')
    })

    it('8e CR: on a handheld the kept surface rides into the bottom sheet, and keeps its state across a close', () => {
        handheld = true
        const Typed = () => <input aria-label="kept input" />
        Typed.keepMounted = true
        render(<SidePane session={{ floor: 'axl' }} surfaces={{ ...surfaces, ticket: Typed }} />)
        act(() => openSurface('ticket'))
        const sheet = screen.getByRole('dialog')
        expect(sheet.parentElement).toBe(document.body)
        expect(sheet.contains(screen.getByLabelText('kept input'))).toBe(true)
        fireEvent.change(screen.getByLabelText('kept input'), { target: { value: 'AAPL 5' } })
        fireEvent.click(screen.getByRole('button', { name: 'Close' }))
        act(() => openSurface('ticket'))
        expect(screen.getByLabelText('kept input').value).toBe('AAPL 5')
    })
})

describe('SidePane — a new session (a commit ended the last one, 2026-10-18)', () => {
    it('closes the desks\' tabs (back with Axl) but keeps a kept surface', () => {
        const Kept = () => <p>kept surface</p>
        Kept.keepMounted = true
        const all = { ...surfaces, strategy: Kept }
        const { rerender } = render(<SidePane session={{ sessionId: 's1', floor: 'mentor' }} surfaces={all} />)
        act(() => openSurface('strategy'))
        expect(sidePaneState().tabs).toEqual(['mentor', 'strategy'])
        rerender(<SidePane session={{ sessionId: 's2', floor: 'axl' }} surfaces={all} />)
        expect(sidePaneState().tabs).toEqual(['strategy'])
    })

    it('the first load closes nothing', () => {
        act(() => openSurface('portfolio'))
        render(<SidePane session={{ sessionId: 's1', floor: 'axl' }} surfaces={surfaces} />)
        expect(sidePaneState().tabs).toEqual(['portfolio'])
    })
})
