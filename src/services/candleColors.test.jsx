import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
    CANDLE_UP_KEY, CANDLE_DOWN_KEY, CANDLE_PREF_KEYS, CANDLE_COLORS_EVENT,
    isHexColor, loadCandleColors, effectiveCandleColors, applyCandleColors,
    saveCandleColor, clearCandleColors,
    hslToHex, hexToHsl, candleHexFromSliders, slidersFromHex,
} from './candleColors.service.js'
import { collectPreferences } from './preferences.service.js'

// The candle colour override: two localStorage keys, two inline vars on <html>, one event. What
// is pinned here is the contract PriceChart and the profile picker both lean on — a saved side
// paints its var and an unset side removes it (so the shared session token shows through), a
// bad value never reaches an inline style, and every change is announced so a mounted chart can
// re-style itself.

const root = () => document.documentElement.style

beforeEach(() => {
    localStorage.clear()
    root().removeProperty('--candle-up')
    root().removeProperty('--candle-down')
})
afterEach(() => vi.restoreAllMocks())

describe('isHexColor', () => {
    it('accepts only a full #rrggbb — what <input type="color"> emits', () => {
        expect(isHexColor('#1C7A3E')).toBe(true)
        expect(isHexColor('#abc')).toBe(false)
        expect(isHexColor('red')).toBe(false)
        expect(isHexColor('rgb(1,2,3)')).toBe(false)
        expect(isHexColor(null)).toBe(false)
    })
})

describe('saveCandleColor / clearCandleColors', () => {
    it('saves one side, paints its var, and leaves the other side on the theme default', () => {
        saveCandleColor('up', '#00FF00')
        expect(localStorage.getItem(CANDLE_UP_KEY)).toBe('#00ff00')
        expect(localStorage.getItem(CANDLE_DOWN_KEY)).toBeNull()
        expect(root().getPropertyValue('--candle-up')).toBe('#00ff00')
        expect(root().getPropertyValue('--candle-down')).toBe('')
        expect(loadCandleColors()).toEqual({ up: '#00ff00', down: null })
    })

    it('ignores an invalid colour and keeps the previous choice', () => {
        saveCandleColor('up', '#00ff00')
        saveCandleColor('up', 'green')
        saveCandleColor('sideways', '#123456')
        expect(loadCandleColors()).toEqual({ up: '#00ff00', down: null })
        expect(localStorage.getItem('undefined')).toBeNull()
    })

    it('a hand-edited key that is not a hex reads as unset and never reaches the inline style', () => {
        localStorage.setItem(CANDLE_DOWN_KEY, 'url(evil)')
        applyCandleColors()
        expect(loadCandleColors().down).toBeNull()
        expect(root().getPropertyValue('--candle-down')).toBe('')
    })

    it('clear removes both keys and both vars', () => {
        saveCandleColor('up', '#00ff00')
        saveCandleColor('down', '#ff0000')
        clearCandleColors()
        expect(loadCandleColors()).toEqual({ up: null, down: null })
        expect(root().getPropertyValue('--candle-up')).toBe('')
        expect(root().getPropertyValue('--candle-down')).toBe('')
    })
})

describe('effectiveCandleColors', () => {
    it('is the override where set, else the theme token', () => {
        // jsdom has no stylesheet, so the token resolves to the code fallback.
        expect(effectiveCandleColors()).toEqual({ up: '#1c7a3e', down: '#5e1212' })
        saveCandleColor('down', '#ff0000')
        expect(effectiveCandleColors()).toEqual({ up: '#1c7a3e', down: '#ff0000' })
    })
})

describe('the change event', () => {
    it('fires on save and on clear, carrying the effective colours', () => {
        const seen = []
        const onChange = e => seen.push(e.detail)
        window.addEventListener(CANDLE_COLORS_EVENT, onChange)
        try {
            saveCandleColor('up', '#00ff00')
            clearCandleColors()
        } finally {
            window.removeEventListener(CANDLE_COLORS_EVENT, onChange)
        }
        expect(seen).toEqual([
            { up: '#00ff00', down: '#5e1212' },
            { up: '#1c7a3e', down: '#5e1212' },
        ])
    })
})

describe('account sync', () => {
    it('both keys are in the preferences allowlist, so the choice follows the user across devices', () => {
        saveCandleColor('up', '#00ff00')
        saveCandleColor('down', '#ff0000')
        const prefs = collectPreferences()
        for (const key of CANDLE_PREF_KEYS) expect(prefs).toHaveProperty(key)
        expect(prefs[CANDLE_UP_KEY]).toBe('#00ff00')
        expect(prefs[CANDLE_DOWN_KEY]).toBe('#ff0000')
    })
})

describe('slider ⇄ hex', () => {
    it('hsl → hex → hsl round-trips (within rounding)', () => {
        expect(hslToHex(0, 100, 50)).toBe('#ff0000')
        expect(hslToHex(120, 100, 25)).toBe('#008000')
        expect(hexToHsl('#ff0000')).toEqual({ h: 0, s: 100, l: 50 })
        expect(hexToHsl('#1c7a3e')).toEqual({ h: 142, s: 63, l: 29 })
        expect(hexToHsl('not-a-colour')).toBeNull()
    })

    it('slider positions produce a valid hex the service will accept, and read back to the same spot', () => {
        for (const [hue, shade] of [[0, 0], [142, 30], [359, 100], [200, 50]]) {
            const hex = candleHexFromSliders(hue, shade)
            expect(isHexColor(hex)).toBe(true)
            const back = slidersFromHex(hex)
            expect(Math.abs(back.hue - hue)).toBeLessThanOrEqual(1)
            expect(Math.abs(back.shade - shade)).toBeLessThanOrEqual(2)
        }
    })

    it('the theme defaults seed the sliders without leaving the band', () => {
        const up = slidersFromHex('#1c7a3e'), down = slidersFromHex('#5e1212')
        expect(up.hue).toBe(142)
        expect(up.shade).toBeGreaterThanOrEqual(0)
        expect(down.shade).toBeGreaterThanOrEqual(0)
        expect(down.shade).toBeLessThanOrEqual(100)
    })

    it('an out-of-range hue or shade is folded into range, not rejected', () => {
        expect(candleHexFromSliders(360, 0)).toBe(candleHexFromSliders(0, 0))
        expect(candleHexFromSliders(0, 150)).toBe(candleHexFromSliders(0, 100))
    })
})
