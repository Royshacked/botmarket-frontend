import { describe, it, expect, afterEach } from 'vitest'
import { loadDesign, DEFAULT_DESIGN } from './designService.js'

// THE FLOOR IS THE DEFAULT (Roy, 2026-10-29): no stored choice, or a retired one, opens on the Floor; a stored pick stays.

afterEach(() => localStorage.removeItem('design'))

describe('loadDesign', () => {
    it('no stored choice is the Floor', () => {
        expect(DEFAULT_DESIGN).toBe('floor')
        expect(loadDesign()).toBe('floor')
    })
    it('a retired or unknown design falls back to the Floor', () => {
        localStorage.setItem('design', 'ocean-trial')
        expect(loadDesign()).toBe('floor')
    })
    it('a user who picked the Axl look keeps it', () => {
        localStorage.setItem('design', 'current')
        expect(loadDesign()).toBe('current')
    })
})
