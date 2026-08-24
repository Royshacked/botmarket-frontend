// The light theme's depth knob. Two things are asserted here that nothing else can see:
//
//   1. It actually travels. The knob used to bottom out at 84% lightness with saturation capped
//      at 26 — "darkest" was an off-white with a hint of colour in it, which is what it was
//      reported as. The floor is now a real dim-daylight paper.
//   2. Sinking the page does NOT break the text ladder. textContrast.test.js measures the
//      _themes.scss block, but the slider overwrites --bg-surface inline at runtime, so that
//      test cannot see a page that has sunk out from under its own ink. This one measures the
//      values the generator actually emits, across every colour stop × every depth — the ink
//      follows the paper down (INK_FOLLOW), and this is the check that the fraction is right.
//
// Same floors as textContrast.test.js — a runtime background is not an excuse for a lower bar.
import { describe, it, expect, beforeEach } from 'vitest'
import { applyBgSpectrum, initTheme, saveAppearance } from './themeService'

const root = () => document.documentElement
const varOf = name => root().style.getPropertyValue(name).trim()

// hsl(176.0, 26.0%, 94.0%) → { h, s, l }
function hslOf(name) {
    const m = varOf(name).match(/hsl\(\s*([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\s*\)/)
    expect(m, `${name} is not an hsl() value (got "${varOf(name)}")`).toBeTruthy()
    return { h: +m[1], s: +m[2] / 100, l: +m[3] / 100 }
}

function luminance({ h, s, l }) {
    const c = (1 - Math.abs(2 * l - 1)) * s
    const hp = h / 60
    const x = c * (1 - Math.abs((hp % 2) - 1))
    const seg = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(hp) % 6]
    const m = l - c / 2
    const [r, g, b] = seg.map(v => v + m).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(fg, bg) {
    const a = luminance(fg), b = luminance(bg)
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

const FLOORS = { '--text-secondary': 7.0, '--text-muted': 5.2, '--text-dim': 4.0 }
const LADDER = ['--text-primary', '--text-secondary', '--text-muted', '--text-dim']

beforeEach(() => {
    localStorage.clear()
    root().removeAttribute('data-theme')
    root().removeAttribute('style')
})

describe('light-mode depth knob', () => {
    it('sinks the page to a real paper stock, not an off-white', () => {
        applyBgSpectrum(40, 50, true)
        const nominal = hslOf('--bg-base')
        applyBgSpectrum(40, 0, true)
        const deepest = hslOf('--bg-base')

        expect(deepest.l * 100).toBeCloseTo(70, 0)              // 94 - 24
        expect(nominal.l - deepest.l).toBeGreaterThan(0.2)      // the knob has somewhere to go
        expect(deepest.s).toBeGreaterThan(nominal.s)            // ...and carries more colour down there
    })

    it('keeps the whole scale ordered as it sinks — the page floor below the page, cards above it', () => {
        applyBgSpectrum(40, 0, true)
        const base = hslOf('--bg-base').l
        expect(hslOf('--bg-deep').l).toBeLessThan(base)
        expect(hslOf('--bg-surface').l).toBeGreaterThan(base)
        expect(hslOf('--bg-raised').l).toBeGreaterThan(hslOf('--bg-surface').l)
    })

    it('holds every text tier above its contrast floor at every colour × depth', () => {
        for (let pos = 0; pos <= 100; pos += 5) {
            for (let shade = 0; shade < 50; shade += 5) {
                applyBgSpectrum(pos, shade, true)
                const bg = hslOf('--bg-surface')
                for (const [token, floor] of Object.entries(FLOORS)) {
                    const ratio = contrast(hslOf(token), bg)
                    expect(ratio, `${token} at pos ${pos} / shade ${shade} is ${ratio.toFixed(2)}:1`)
                        .toBeGreaterThanOrEqual(floor)
                }
            }
        }
    })

    it('keeps the tiers ordered primary > secondary > muted > dim as it sinks', () => {
        for (const shade of [0, 15, 30, 45]) {
            applyBgSpectrum(40, shade, true)
            const bg = hslOf('--bg-surface')
            const ladder = LADDER.map(t => contrast(hslOf(t), bg))
            for (let i = 1; i < ladder.length; i++) {
                expect(ladder[i], `${LADDER[i]} at shade ${shade}`).toBeLessThan(ladder[i - 1])
            }
        }
    })
})

describe('the ink override is scoped to a sunk light page', () => {
    it('is not written at or above the nominal stop — the stylesheet ladder stands', () => {
        applyBgSpectrum(40, 50, true)
        expect(varOf('--text-dim')).toBe('')
        applyBgSpectrum(40, 100, true)
        expect(varOf('--text-dim')).toBe('')
    })

    it('is dropped when the user switches back to dark, not carried over as near-black on black', () => {
        applyBgSpectrum(40, 0, true)
        expect(varOf('--text-dim')).not.toBe('')

        saveAppearance('dark')
        initTheme()
        expect(varOf('--text-dim')).toBe('')
    })

    it('sinks the glass anchor with the paper, and clears it on the way back to dark', () => {
        applyBgSpectrum(40, 50, true)
        const nominal = hslOf('--glass-anchor').l
        applyBgSpectrum(40, 0, true)
        expect(hslOf('--glass-anchor').l).toBeLessThan(nominal)

        applyBgSpectrum(40, 50, false)
        expect(varOf('--glass-anchor')).toBe('')
    })
})
