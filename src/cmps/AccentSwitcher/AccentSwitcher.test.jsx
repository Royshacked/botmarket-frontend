// The accent picker's first choice is the THEME's own accent — white on Black and Grey, teal on White
// (Roy, 2026-11-20). A saved colour override sits over every theme, which is how a user can switch to a
// white-accent theme and still see teal; this button is the visible way back.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

vi.mock('../../services/preferences.service', () => ({ queuePrefSync: vi.fn() }))

import { AccentSwitcher } from './AccentSwitcher'

const root = () => document.documentElement

afterEach(cleanup)

beforeEach(() => {
    localStorage.clear()
    root().removeAttribute('style')
})

describe('AccentSwitcher', () => {
    it('lights White when no colour override is saved (dark themes)', () => {
        localStorage.setItem('themeAppearance', 'black')
        render(<AccentSwitcher />)
        const btn = screen.getByRole('button', { name: /white/i })
        expect(btn.getAttribute('aria-pressed')).toBe('true')
    })

    it('shows a saved colour as the choice, and White clears it back to the theme accent', () => {
        localStorage.setItem('themeAppearance', 'grey')
        localStorage.setItem('accentHue', '180')
        localStorage.setItem('accentShade', '100')
        root().style.setProperty('--accent-light', 'hsl(180, 65%, 83%)')
        render(<AccentSwitcher />)

        const btn = screen.getByRole('button', { name: /white/i })
        expect(btn.getAttribute('aria-pressed')).toBe('false')

        fireEvent.click(btn)
        expect(btn.getAttribute('aria-pressed')).toBe('true')
        expect(localStorage.getItem('accentHue')).toBeNull()
        expect(root().style.getPropertyValue('--accent-light')).toBe('')
    })

    it('names the theme accent Teal on the White theme', () => {
        localStorage.setItem('themeAppearance', 'white')
        render(<AccentSwitcher />)
        expect(screen.getByRole('button', { name: /teal/i }).getAttribute('aria-pressed')).toBe('true')
    })

    it('moving the colour knob picks a colour and un-lights the theme accent', () => {
        localStorage.setItem('themeAppearance', 'black')
        render(<AccentSwitcher />)
        fireEvent.change(screen.getByLabelText('Accent colour'), { target: { value: '30' } })
        expect(screen.getByRole('button', { name: /white/i }).getAttribute('aria-pressed')).toBe('false')
        expect(localStorage.getItem('accentHue')).toBe('30')
    })
})
