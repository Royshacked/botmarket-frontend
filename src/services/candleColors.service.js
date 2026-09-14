// ── Candle colours — the user's up/down candle override ───────────────────────
// The price chart paints its candles from two tokens (--mc-arc-open / --mc-arc-closed) that it
// shares with the header session dials. This module lets a user override those two colours for
// the CHART ONLY: the choice lands as inline vars on <html> (--candle-up / --candle-down), which
// PriceChart reads ahead of the shared tokens, and the session dials keep their own. Same shape
// as the accent override (themeService): localStorage is the live copy, no key = theme default,
// `init` re-applies at boot, and preferences.service syncs the keys to the account.
//
// A chart already on screen can't re-read the vars on its own — its palette is handed to
// klinecharts once at init — so every apply/clear also raises CANDLE_COLORS_EVENT on window and
// the mounted chart re-styles itself from that.

export const CANDLE_UP_KEY   = 'candleUpColor'
export const CANDLE_DOWN_KEY = 'candleDownColor'
export const CANDLE_PREF_KEYS = [CANDLE_UP_KEY, CANDLE_DOWN_KEY]

export const CANDLE_COLORS_EVENT = 'candle-colors-change'

const VARS = { up: '--candle-up', down: '--candle-down' }
const KEYS = { up: CANDLE_UP_KEY, down: CANDLE_DOWN_KEY }

// The chart's default direction colours — the shared session tokens, resolved from the live
// theme. Exposed so the picker can show the default swatch when no override is set.
const TOKEN_DEFAULTS = { up: ['--mc-arc-open', '#1c7a3e'], down: ['--mc-arc-closed', '#5e1212'] }

// Only a full #rrggbb is accepted: it is what <input type="color"> emits, what the chart's
// rgba() fade understands, and it keeps an arbitrary string out of an inline style.
export function isHexColor(value) {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

function readVar(name, fallback) {
    if (typeof document === 'undefined') return fallback
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

// The theme's own candle colours (no override applied). Reads the tokens, not --candle-*, so
// the answer is the same whether or not the user has overridden them.
export function defaultCandleColors() {
    return {
        up:   readVar(...TOKEN_DEFAULTS.up),
        down: readVar(...TOKEN_DEFAULTS.down),
    }
}

// The saved override: { up, down } with null for a side that is on the theme default. Anything
// not a valid hex (a hand-edited key, an old shape) reads as unset rather than reaching the chart.
export function loadCandleColors() {
    const read = key => { const v = localStorage.getItem(key); return isHexColor(v) ? v.toLowerCase() : null }
    return { up: read(CANDLE_UP_KEY), down: read(CANDLE_DOWN_KEY) }
}

// What the chart should actually paint: the override where one is set, else the theme default.
export function effectiveCandleColors() {
    const saved = loadCandleColors()
    const base  = defaultCandleColors()
    return { up: saved.up ?? base.up, down: saved.down ?? base.down }
}

function notify() {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent(CANDLE_COLORS_EVENT, { detail: effectiveCandleColors() }))
}

// Paint the saved override onto <html> (and drop the var for a side with no override), then tell
// any mounted chart. Idempotent — safe to call at boot and after every save/clear.
export function applyCandleColors() {
    if (typeof document === 'undefined') return
    const root  = document.documentElement
    const saved = loadCandleColors()
    for (const side of ['up', 'down']) {
        if (saved[side]) root.style.setProperty(VARS[side], saved[side])
        else             root.style.removeProperty(VARS[side])
    }
    notify()
}

// Save one side ('up' | 'down'). An invalid colour is ignored — the previous choice stands.
export function saveCandleColor(side, hex) {
    if (!KEYS[side] || !isHexColor(hex)) return
    localStorage.setItem(KEYS[side], hex.toLowerCase())
    applyCandleColors()
}

// Back to the theme default on both sides.
export function clearCandleColors() {
    for (const key of CANDLE_PREF_KEYS) localStorage.removeItem(key)
    applyCandleColors()
}

// ── Slider ⇄ hex ──────────────────────────────────────────────────────────────
// The picker is two sliders per side — hue (0–360) and shade (0–100, deep → light) — like the
// accent picker, but the STORED value stays a hex so the chart, the inline vars and the account
// blob never learn about sliders. Saturation is fixed; shade maps onto a lightness band that
// reads on the black chart pane at both ends.
const CANDLE_SAT = 60
const LIGHT_MIN = 15, LIGHT_MAX = 65

export function hslToHex(h, s, l) {
    const sat = s / 100, lit = l / 100
    const k = n => (n + h / 30) % 12
    const a = sat * Math.min(lit, 1 - lit)
    const f = n => lit - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
    const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0')
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`
}

export function hexToHsl(hex) {
    if (!isHexColor(hex)) return null
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
    const l = (max + min) / 2
    if (d === 0) return { h: 0, s: 0, l: Math.round(l * 100) }
    const s = d / (1 - Math.abs(2 * l - 1))
    let h
    if (max === r)      h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else                h = (r - g) / d + 4
    h = Math.round(h * 60)
    if (h < 0) h += 360
    return { h, s: Math.round(s * 100), l: Math.round(l * 100) }
}

// Slider positions → the hex that gets saved.
export function candleHexFromSliders(hue, shade) {
    const lit = LIGHT_MIN + (LIGHT_MAX - LIGHT_MIN) * (Math.max(0, Math.min(100, shade)) / 100)
    return hslToHex(((hue % 360) + 360) % 360, CANDLE_SAT, lit)
}

// A saved (or default) hex → where the sliders should sit. A lightness outside the band clamps
// to its edge — the theme's dark defaults land near the deep end.
export function slidersFromHex(hex) {
    const hsl = hexToHsl(hex) ?? { h: 0, l: LIGHT_MIN }
    const shade = Math.round((hsl.l - LIGHT_MIN) / (LIGHT_MAX - LIGHT_MIN) * 100)
    return { hue: hsl.h, shade: Math.max(0, Math.min(100, shade)) }
}

// Track gradient for a side's shade slider: this hue from deep → light.
export function candleShadeTrack(hue) {
    return `linear-gradient(to right, ${candleHexFromSliders(hue, 0)}, ${candleHexFromSliders(hue, 50)}, ${candleHexFromSliders(hue, 100)})`
}

// Re-apply the saved override at boot / after hydration. Alias kept so the boot sequence reads
// like its neighbours (initTheme / initDesign / initAccent).
export const initCandleColors = applyCandleColors
