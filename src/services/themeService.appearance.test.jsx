// Dark ⇄ light appearance. Lives in .test.jsx (not .test.js) because everything here writes
// CSS custom properties onto <html> — it needs vitest's jsdom, not the Node runner.
//
// What these lock down is the one thing a light theme gets wrong silently: a generator that
// keeps producing dark-band values while the palette flips. Nothing throws when that happens —
// you just get white text on white, so the assertions are on the numbers the generators emit.
import { describe, it, expect, beforeEach } from 'vitest'
import {
    loadAppearance, saveAppearance, isLight, applyAppearance,
    applyBgSpectrum, applyAccentHue, clearAccentHue, initTheme,
} from './themeService'

const root = () => document.documentElement
const varOf = name => root().style.getPropertyValue(name).trim()
// hsl(176.0, 26.0%, 94.0%) → 94
const lightnessOf = name => Number(varOf(name).match(/,\s*([\d.]+)%\s*\)/)[1])

beforeEach(() => {
    localStorage.clear()
    root().removeAttribute('data-theme')
    root().removeAttribute('style')
})

describe('appearance mode', () => {
    it('defaults to dark, and treats an unknown stored value as dark', () => {
        expect(loadAppearance()).toBe('dark')
        localStorage.setItem('themeAppearance', 'sepia')
        expect(loadAppearance()).toBe('dark')
        expect(isLight()).toBe(false)
    })

    it('persists the choice and reports it', () => {
        saveAppearance('light')
        expect(loadAppearance()).toBe('light')
        expect(isLight()).toBe(true)
    })

    it('wears the matching [data-theme] block at boot', () => {
        initTheme()
        expect(root().getAttribute('data-theme')).toBe('axl')

        saveAppearance('light')
        initTheme()
        expect(root().getAttribute('data-theme')).toBe('axl-light')
    })

    it('applyAppearance saves and re-applies in one step', () => {
        applyAppearance('light')
        expect(localStorage.getItem('themeAppearance')).toBe('light')
        expect(root().getAttribute('data-theme')).toBe('axl-light')

        applyAppearance('dark')
        expect(root().getAttribute('data-theme')).toBe('axl')
    })
})

describe('background spectrum follows the appearance', () => {
    it('sits near black in dark and near white in light, at the same slider position', () => {
        applyBgSpectrum(40, 50, false)
        expect(lightnessOf('--bg-base')).toBeLessThan(12)

        applyBgSpectrum(40, 50, true)
        expect(lightnessOf('--bg-base')).toBeGreaterThan(85)
    })

    it('keeps the card lift meaning: a raised surface moves AWAY from the page in both', () => {
        applyBgSpectrum(40, 50, false)
        expect(lightnessOf('--bg-raised')).toBeGreaterThan(lightnessOf('--bg-base')) // toward white
        applyBgSpectrum(40, 50, true)
        expect(lightnessOf('--bg-raised')).toBeGreaterThan(lightnessOf('--bg-base')) // toward white
        expect(lightnessOf('--bg-deep')).toBeLessThan(lightnessOf('--bg-base'))      // the page floor
    })

    it('reads the saved appearance when the caller does not pass one', () => {
        saveAppearance('light')
        applyBgSpectrum(40, 50)
        expect(lightnessOf('--bg-base')).toBeGreaterThan(85)
    })

    it('never leaves the 0-100 lightness range at the ends of the depth slider', () => {
        for (const light of [false, true]) {
            for (const shade of [0, 50, 100]) {
                applyBgSpectrum(100, shade, light)
                const l = lightnessOf('--bg-raised')
                expect(l).toBeGreaterThanOrEqual(0)
                expect(l).toBeLessThanOrEqual(100)
            }
        }
    })
})

describe('accent ramp', () => {
    it('runs pale→ink on paper and ink→pale at night', () => {
        applyAccentHue(174, 50, false)
        // dark: -deep is the dark end, -bright the pale end (accent text on a dark surface)
        expect(lightnessOf('--accent-bright')).toBeGreaterThan(lightnessOf('--accent-deep'))

        applyAccentHue(174, 50, true)
        // light: reversed — -deep is the pale fill, -bright the darkest ink
        expect(lightnessOf('--accent-bright')).toBeLessThan(lightnessOf('--accent-deep'))
        expect(lightnessOf('--accent-bright')).toBeLessThan(45)
    })

    it('keeps the shade knob meaning "deeper" below 50 in both appearances', () => {
        applyAccentHue(174, 50, true)
        const mid = lightnessOf('--accent-bright')
        applyAccentHue(174, 10, true)
        expect(lightnessOf('--accent-bright')).toBeLessThan(mid)
    })

    it('clears the same token set it wrote, whichever ramp produced it', () => {
        applyAccentHue(174, 50, true)
        expect(varOf('--accent-bright')).not.toBe('')
        clearAccentHue()
        expect(varOf('--accent-bright')).toBe('')
        expect(varOf('--h1-glow-1')).toBe('')
    })
})
