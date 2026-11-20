// The three appearances — black · grey · white. Lives in .test.jsx (not .test.js) because
// everything here writes CSS custom properties onto <html> — it needs vitest's jsdom.
//
// What these lock down is the one thing a light theme gets wrong silently: a generator that
// keeps producing dark-band values while the palette flips. Nothing throws when that happens —
// you just get white text on white, so the assertions are on the numbers the generators emit.
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
    loadAppearance, saveAppearance, isLight, applyAppearance,
    applyAccentHue, clearAccentHue, initTheme, APPEARANCES,
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

describe('appearance', () => {
    it('offers exactly black, grey and white', () => {
        expect(APPEARANCES).toEqual(['black', 'grey', 'white'])
    })

    it('defaults to black, and treats an unknown stored value as black', () => {
        expect(loadAppearance()).toBe('black')
        localStorage.setItem('themeAppearance', 'sepia')
        expect(loadAppearance()).toBe('black')
        expect(isLight()).toBe(false)
    })

    it('carries a device that saved the old switch to its side: dark → black, light → white', () => {
        localStorage.setItem('themeAppearance', 'dark')
        expect(loadAppearance()).toBe('black')
        localStorage.setItem('themeAppearance', 'light')
        expect(loadAppearance()).toBe('white')
        expect(isLight()).toBe(true)
    })

    it('persists the choice and reports it; only white is paper', () => {
        for (const id of ['black', 'grey', 'white']) {
            saveAppearance(id)
            expect(loadAppearance()).toBe(id)
            expect(isLight()).toBe(id === 'white')
        }
    })

    it('wears the matching [data-theme] block at boot', () => {
        for (const id of ['black', 'grey', 'white']) {
            saveAppearance(id)
            initTheme()
            expect(root().getAttribute('data-theme')).toBe(id)
        }
    })

    it('clears what the retired background slider left inline, so the theme block shows', () => {
        root().style.setProperty('--bg-base', 'hsl(176, 72%, 3.5%)')
        root().style.setProperty('--text-muted', 'hsl(197, 17%, 20%)')
        initTheme()
        expect(varOf('--bg-base')).toBe('')
        expect(varOf('--text-muted')).toBe('')
    })

    it('applyAppearance saves and re-applies in one step', () => {
        applyAppearance('white')
        expect(localStorage.getItem('themeAppearance')).toBe('white')
        expect(root().getAttribute('data-theme')).toBe('white')

        applyAppearance('grey')
        expect(root().getAttribute('data-theme')).toBe('grey')
    })

    it('puts a saved accent into the paper band on white and the night band on grey', () => {
        localStorage.setItem('accentHue', '174')
        applyAppearance('white')
        expect(lightnessOf('--accent-bright')).toBeLessThan(lightnessOf('--accent-deep'))
        applyAppearance('grey')
        expect(lightnessOf('--accent-bright')).toBeGreaterThan(lightnessOf('--accent-deep'))
    })
})

describe('the phone browser bar', () => {
    const bar = () => document.querySelector('meta[name="theme-color"]')?.getAttribute('content')
    const css = readFileSync(resolve(__dirname, '../assets/styles/setup/_themes.scss'), 'utf8')
    const bgBaseOf = id => css.match(new RegExp(`\\[data-theme="${id}"\\]\\s*\\{[^}]*?--bg-base:\\s*(#[0-9a-fA-F]{6})`))?.[1]

    beforeEach(() => document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove()))

    it('takes the page colour of whichever theme is on, live', () => {
        for (const id of ['black', 'grey', 'white']) {
            applyAppearance(id)
            expect(bar()?.toUpperCase()).toBe(bgBaseOf(id).toUpperCase())
        }
    })

    it('rewrites the one meta tag index.html ships rather than adding a second', () => {
        const meta = document.createElement('meta')
        meta.setAttribute('name', 'theme-color')
        meta.setAttribute('content', '#050505')
        document.head.appendChild(meta)
        applyAppearance('white')
        expect(document.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1)
        expect(bar()).toBe('#F4F4F5')
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
