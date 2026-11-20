// ── Spectrum theme generator ──────────────────────────────────────────────────
// Generates the full CSS-variable set from two knobs that mirror the structure
// of the curated 'ocean' theme:
//
//   hue  (0–360) — the color. Saturation eases to 0 at both ends of the hue
//                  slider, so its extremes give a *neutral* (grayscale) theme
//                  while the middle gives rich, saturated color.
//   tone (0–1)   — the brightness, spanning the whole range from black (0)
//                  through to white (1). Surfaces interpolate their lightness
//                  across this range; text + headings *flip* from light-on-dark
//                  to dark-on-light as it crosses the midpoint, so contrast is
//                  preserved at both ends. (The mid-gray middle is inherently
//                  low-contrast — that's the one washed-out zone of the range.)
//
// Together: hue picks the color (or neutral at its edges), tone slides the whole
// theme from white to black. tone = 0 reproduces the original hand-tuned dark
// theme exactly, so existing dark setups are unchanged.
//
// Semantic colors (long/short, bull/bear, type badges) live in :root in
// _themes.scss and are intentionally NOT generated here — trade meaning never
// changes with the theme.

const DEFAULT_HUE  = 213 // ≈ the ocean preset
const DEFAULT_TONE = 0   // darkest end → reproduces the original dark theme

// Anchor hue of the app-wide aurora wash (the green→teal→cyan→violet backdrop
// shared by the header and every panel). The profile hue slider rotates the whole
// spread by setting the global --aurora-hue CSS var; the other stops follow it via
// fixed offsets in _themes.scss. 174 = the brand teal (the current look).
const DEFAULT_AURORA_HUE = 174

// Set the global aurora anchor hue. Since the background wash was dropped, its one remaining
// consumer is the header's calm-water wave (--wave-1..5 in _themes.scss derive from it), so this
// rotates that line with the accent.
export function applyAuroraHue(hue) {
    document.documentElement.style.setProperty('--aurora-hue', String(hue))
}

export function saveAuroraHue(hue) {
    localStorage.setItem('auroraHue', String(hue))
}

// Read the saved aurora hue, falling back to the brand teal anchor.
export function loadAuroraHue() {
    const raw = localStorage.getItem('auroraHue')
    return raw === null ? DEFAULT_AURORA_HUE : Number(raw)
}

// ── Appearance: black · grey · white ─────────────────────────────────────────
// Three neutral palettes (style session 2026-11-20). The id IS the [data-theme] block the app
// wears (_themes.scss). White is the one paper appearance: the accent generator below puts its
// ramp into the light band there, and into the dark band on black and grey.
//
// They replaced the dark/light switch AND the background colour + depth sliders: those tinted
// every --bg-* token inline on <html>, which is exactly what a neutral theme must not have.
// A device that saved the old switch keeps its side — 'dark' opens on black, 'light' on white.
const APPEARANCES = ['black', 'grey', 'white']
const DEFAULT_APPEARANCE = 'black'
const LEGACY_APPEARANCE = { dark: 'black', light: 'white' }

// The inline tokens the retired background slider used to write. Cleared at boot so nothing a
// previous build left on <html> in this window can sit over the theme block.
const RETIRED_INLINE = [
    '--bg-base', '--bg-deep', '--bg-hover', '--bg-surface', '--bg-raised', '--bg-popover', '--glass-anchor',
    '--text-primary', '--text-secondary', '--text-muted', '--text-dim', '--text-subtle', '--text-leaf',
]

// The phone's browser bar (and an installed app's status bar) — <meta name="theme-color">. It is
// painted by the browser, not by CSS, so it cannot read a token: each value MUST equal that
// theme's --bg-base in _themes.scss, or the bar shows as a band over the page.
// (The manifest's theme_color in vite.config.js is static — it only colours the install splash.)
const BROWSER_BAR = { black: '#050505', grey: '#1C1D1F', white: '#F4F4F5' }

function applyBrowserBar(appearance) {
    let meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) {
        meta = document.createElement('meta')
        meta.setAttribute('name', 'theme-color')
        document.head.appendChild(meta)
    }
    meta.setAttribute('content', BROWSER_BAR[appearance])
}

function normalizeAppearance(raw) {
    if (APPEARANCES.includes(raw)) return raw
    return LEGACY_APPEARANCE[raw] ?? DEFAULT_APPEARANCE
}

export function loadAppearance() {
    return normalizeAppearance(localStorage.getItem('themeAppearance'))
}

export function saveAppearance(mode) {
    localStorage.setItem('themeAppearance', normalizeAppearance(mode))
}

export function isLight() {
    return loadAppearance() === 'white'
}


// Width (as a fraction of the 0–360 hue range) of the transition at each edge
// of the hue slider, where saturation eases out to a neutral grayscale theme.
const EDGE = 0.12

// Saturation multiplier for a hue: 0 (neutral) at both extremes of the slider,
// ramping up to a vivid plateau across the middle.
function hueSat(hue) {
    const p = hue / 360
    return Math.max(0, Math.min(1, Math.min(p, 1 - p) / EDGE)) * 0.95
}

// Eased tone → easing pushes the slider quickly out of the washed-out mid-gray
// zone, so most positions read as clearly light or clearly dark.
function easeTone(tone) {
    const k = 2 * tone - 1
    return 0.5 + 0.5 * Math.sign(k) * Math.pow(Math.abs(k), 0.6)
}

// Surface lightness: interpolates from the hand-tuned dark value L (tone 0) to
// its mirror 100 − L (tone 1), so a well-contrasted dark theme becomes a
// well-contrasted light theme.
function surfaceL(L, tone) {
    const e = easeTone(tone)
    return Math.max(0, Math.min(100, L + (100 - 2 * L) * e))
}

// Text/heading lightness: flips wholesale at the midpoint (light text on dark
// backgrounds → dark text on light backgrounds) so text never washes out.
function textL(L, tone) {
    return tone >= 0.5 ? 100 - L : L
}

// Accent color for given knobs — single source of truth for the slider previews.
export function spectrumPreview(hue, tone = DEFAULT_TONE) {
    const sat = +(57 * hueSat(hue)).toFixed(1)
    const lit = +surfaceL(39, tone).toFixed(1)
    return `hsl(${hue}, ${sat}%, ${lit}%)`
}

// Each entry maps a CSS custom property to a function of (hue, tone).
function buildThemeVars(h, tone) {
    const satMul = hueSat(h)
    const s = v => +(v * satMul).toFixed(1)         // saturation, neutral at the hue ends
    const L = v => +surfaceL(v, tone).toFixed(1)    // surfaces — interpolate white↔black
    const T = v => +textL(v, tone).toFixed(1)       // text/headings — flip for contrast
    return {
        // Backgrounds
        '--bg-base':    `hsl(${h}, ${s(60)}%, ${L(4)}%)`,
        '--bg-deep':    `hsl(${h}, ${s(60)}%, ${L(6)}%)`,
        '--bg-hover':   `hsl(${h}, ${s(55)}%, ${L(8)}%)`,
        '--bg-surface': `hsl(${h}, ${s(55)}%, ${L(9)}%)`,
        '--bg-raised':  `hsl(${h}, ${s(50)}%, ${L(12)}%)`,
        '--bg-popover': `hsl(${h}, ${s(60)}%, ${L(11)}%)`,

        // Accent scale
        '--accent-deep':   `hsl(${h}, ${s(73)}%, ${L(19)}%)`,
        '--accent':        `hsl(${h}, ${s(57)}%, ${L(39)}%)`,
        '--accent-light':  `hsl(${h}, ${s(65)}%, ${L(73)}%)`,
        '--accent-bright': `hsl(${h}, ${s(100)}%, ${L(89)}%)`,

        // Text scale — flips to stay legible at both ends of the tone range
        '--text-primary':   `hsl(${h}, ${s(100)}%, ${T(92)}%)`,
        '--text-secondary': `hsl(${h}, ${s(35)}%, ${T(62)}%)`,
        '--text-muted':     `hsl(${h}, ${s(48)}%, ${T(32)}%)`,
        '--text-dim':       `hsl(${h}, ${s(52)}%, ${T(25)}%)`,
        '--text-subtle':    `hsl(${h}, ${s(28)}%, ${T(73)}%)`,
        '--text-leaf':      `hsl(${h}, ${s(50)}%, ${T(85)}%)`,

        // Borders & effects
        '--border':        `hsla(${h}, ${s(72)}%, ${L(27)}%, 0.35)`,
        '--border-mid':    `hsla(${h}, ${s(72)}%, ${L(27)}%, 0.45)`,
        '--border-strong': `hsla(${h}, ${s(68)}%, ${L(58)}%, 0.55)`,
        '--border-soft':   `hsla(${h}, ${s(64)}%, ${L(43)}%, 0.30)`,
        '--glow':          `hsla(${h}, ${s(57)}%, ${L(38)}%, 0.14)`,
        '--glow-soft':     `hsla(${h}, ${s(57)}%, ${L(38)}%, 0.06)`,
        '--glow-mid':      `hsla(${h}, ${s(57)}%, ${L(38)}%, 0.10)`,
        '--overlay':       `rgba(0, 0, 0, 0.65)`,

        // User button + popover
        '--user-btn-bg':           `hsla(${h}, ${s(72)}%, ${L(27)}%, 0.35)`,
        '--user-btn-border':       `hsla(${h}, ${s(63)}%, ${L(59)}%, 0.40)`,
        '--user-btn-bg-hover':     `hsla(${h}, ${s(64)}%, ${L(43)}%, 0.45)`,
        '--user-btn-border-hover': `hsla(${h}, ${s(100)}%, ${L(74)}%, 0.70)`,
        '--user-btn-text-hover':   `hsl(${h}, ${s(100)}%, ${T(95)}%)`,
        '--popover-border':        `hsla(${h}, ${s(70)}%, ${L(55)}%, 0.50)`,
        '--popover-divider':       `hsla(${h}, ${s(64)}%, ${L(43)}%, 0.30)`,
        '--popover-btn-hover-bg':  `hsla(${h}, ${s(64)}%, ${L(43)}%, 0.20)`,

        // H1 gradient (text-like, flips) + glow (surface-like, interpolates)
        '--h1-grad-top':    `hsl(${h}, ${s(100)}%, ${T(99)}%)`,
        '--h1-grad-mid1':   `hsl(${h}, ${s(100)}%, ${T(93)}%)`,
        '--h1-grad-mid2':   `hsl(${h}, ${s(67)}%, ${T(80)}%)`,
        '--h1-grad-mid3':   `hsl(${h}, ${s(58)}%, ${T(59)}%)`,
        '--h1-grad-bottom': `hsl(${h}, ${s(67)}%, ${T(34)}%)`,
        '--h1-glow-1': `hsla(${h}, ${s(100)}%, ${L(65)}%, 0.90)`,
        '--h1-glow-2': `hsla(${h}, ${s(80)}%, ${L(53)}%, 0.65)`,
        '--h1-glow-3': `hsla(${h}, ${s(85)}%, ${L(43)}%, 0.35)`,
    }
}

// Apply a generated theme as inline vars on <html> (overrides the [data-theme] block).
export function applyHueTheme(hue, tone = DEFAULT_TONE) {
    const root = document.documentElement
    const vars = buildThemeVars(hue, tone)
    for (const [key, val] of Object.entries(vars)) root.style.setProperty(key, val)
    root.setAttribute('data-theme', 'spectrum')
}

// Remove the generated vars so a preset [data-theme] block takes over again.
export function clearHueTheme() {
    const root = document.documentElement
    for (const key of Object.keys(buildThemeVars(0, 0))) root.style.removeProperty(key)
}

export function savePreset(id) {
    localStorage.setItem('themeMode', 'preset')
    localStorage.setItem('theme', id)
}

export function saveSpectrum(hue, tone) {
    localStorage.setItem('themeMode', 'spectrum')
    localStorage.setItem('themeHue', String(hue))
    localStorage.setItem('themeTone', String(tone))
}

// Read the saved tone, falling back to the default dark end.
export function loadTone() {
    const raw = localStorage.getItem('themeTone')
    return raw === null ? DEFAULT_TONE : Number(raw)
}

// ── Accent hue + shade ──────────────────────────────────────────────────────
// An independent accent picker on two knobs:
//   hue   (0–360) — the colour. Saturation is FULL at every hue (unlike the
//                   bg/spectrum generators that neutralize the ends) — a picker
//                   should give a vivid accent for red, green, blue alike.
//   shade (0–100) — depth. 50 = the current look; below 50 deepens the accent
//                   toward dark/rich, above 50 lifts it lighter. Asymmetric:
//                   more room to go deep ("the dark side") than to lighten.
// It recolors only the accent family + its glows + the heading gradient/glow,
// leaving backgrounds and neutral body text alone (so it composes with the
// background slider and any design). Written as inline vars on <html>, so it
// overrides whatever accent the active theme/design hardcoded (e.g. neon's pink).
const DEFAULT_ACCENT_SHADE = 50

// Lightness offset (in % points) for a shade value. 50→0; deep end reaches −22,
// light end +10 — so darkening has the longer travel.
function accentShift(shade) {
    const k = (shade - 50) / 50
    return +(k < 0 ? k * 22 : k * 10).toFixed(1)
}

function buildAccentVars(h, shade = DEFAULT_ACCENT_SHADE, light = isLight()) {
    const d = accentShift(shade)
    // Shift a base lightness by the shade delta, clamped (floor keeps the light
    // tokens legible as accent text even at the deepest setting).
    const L = (v, floor = 3) => Math.max(floor, Math.min(97, +(v + d).toFixed(1)))

    // On paper the ramp runs the other way — -deep is the pale FILL and -bright the darkest
    // INK (see the White note in _themes.scss). Generating the dark ramp here would hand
    // every accent-coloured label a near-white colour on a near-white surface. The shade knob
    // keeps its meaning: below 50 deepens, above 50 lifts.
    if (light) {
        const Ll = (v, lo, hi) => Math.max(lo, Math.min(hi, +(v + d).toFixed(1)))
        return {
            '--accent-deep':   `hsl(${h}, 34%, ${Ll(81, 45, 95)}%)`,
            '--accent':        `hsl(${h}, 46%, ${Ll(40, 12, 62)}%)`,
            '--accent-light':  `hsl(${h}, 46%, ${Ll(28, 10, 48)}%)`,
            '--accent-bright': `hsl(${h}, 52%, ${Ll(19, 8, 40)}%)`,
            '--glow':          `hsla(${h}, 46%, ${Ll(45, 20, 70)}%, 0.10)`,
            '--glow-soft':     `hsla(${h}, 46%, ${Ll(45, 20, 70)}%, 0.05)`,
            '--glow-mid':      `hsla(${h}, 46%, ${Ll(45, 20, 70)}%, 0.08)`,
            '--border-strong': `hsla(${h}, 55%, ${Ll(38, 15, 60)}%, 0.45)`,
            '--h1-grad-top':    `hsl(${h}, 40%, ${Ll(20, 8, 40)}%)`,
            '--h1-grad-mid1':   `hsl(${h}, 40%, ${Ll(20, 8, 40)}%)`,
            '--h1-grad-mid2':   `hsl(${h}, 40%, ${Ll(20, 8, 40)}%)`,
            '--h1-grad-mid3':   `hsl(${h}, 40%, ${Ll(20, 8, 40)}%)`,
            '--h1-grad-bottom': `hsl(${h}, 40%, ${Ll(20, 8, 40)}%)`,
            '--h1-glow-1':      `hsla(${h}, 50%, ${Ll(48, 25, 72)}%, 0.30)`,
            '--h1-glow-2':      `hsla(${h}, 45%, ${Ll(48, 25, 72)}%, 0.20)`,
            '--h1-glow-3':      `hsla(${h}, 45%, ${Ll(48, 25, 72)}%, 0.12)`,
        }
    }
    return {
        '--accent-deep':   `hsl(${h}, 73%, ${L(19)}%)`,
        '--accent':        `hsl(${h}, 57%, ${L(39)}%)`,
        '--accent-light':  `hsl(${h}, 65%, ${L(73, 48)}%)`,
        '--accent-bright': `hsl(${h}, 100%, ${L(89, 66)}%)`,
        '--glow':          `hsla(${h}, 57%, ${L(38)}%, 0.14)`,
        '--glow-soft':     `hsla(${h}, 57%, ${L(38)}%, 0.06)`,
        '--glow-mid':      `hsla(${h}, 57%, ${L(38)}%, 0.10)`,
        '--border-strong': `hsla(${h}, 68%, ${L(58)}%, 0.55)`,
        '--h1-grad-top':    `hsl(${h}, 100%, ${L(99, 60)}%)`,
        '--h1-grad-mid1':   `hsl(${h}, 100%, ${L(93, 55)}%)`,
        '--h1-grad-mid2':   `hsl(${h}, 67%, ${L(80, 48)}%)`,
        '--h1-grad-mid3':   `hsl(${h}, 58%, ${L(59)}%)`,
        '--h1-grad-bottom': `hsl(${h}, 67%, ${L(34)}%)`,
        '--h1-glow-1':      `hsla(${h}, 100%, ${L(65)}%, 0.90)`,
        '--h1-glow-2':      `hsla(${h}, 80%, ${L(53)}%, 0.65)`,
        '--h1-glow-3':      `hsla(${h}, 85%, ${L(43)}%, 0.35)`,
    }
}

// Swatch colour for the accent picker — a slightly brighter --accent so it reads.
export function accentPreview(hue, shade = DEFAULT_ACCENT_SHADE) {
    const lit = Math.max(8, Math.min(92, 46 + accentShift(shade)))
    return `hsl(${hue}, 60%, ${lit}%)`
}

export function applyAccentHue(hue, shade = DEFAULT_ACCENT_SHADE, light = isLight()) {
    const root = document.documentElement
    const vars = buildAccentVars(hue, shade, light)
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
}

// Drop the inline accent vars so the active theme/design's own accent shows again.
export function clearAccentHue() {
    const root = document.documentElement
    for (const k of Object.keys(buildAccentVars(0))) root.style.removeProperty(k)
}

export function saveAccentHue(hue)   { localStorage.setItem('accentHue', String(hue)) }
export function saveAccentShade(s)   { localStorage.setItem('accentShade', String(s)) }
export function clearSavedAccentHue() {
    localStorage.removeItem('accentHue')
    localStorage.removeItem('accentShade')
}

// null = no override (use the theme/design accent); a number = custom accent hue.
export function loadAccentHue() {
    const raw = localStorage.getItem('accentHue')
    return raw === null ? null : Number(raw)
}
export function loadAccentShade() {
    const raw = localStorage.getItem('accentShade')
    return raw === null ? DEFAULT_ACCENT_SHADE : Number(raw)
}

// Re-apply the saved accent override (if any) on top of the active theme/design.
// Call after initTheme/initDesign at boot, and after any theme/design switch that
// resets inline vars (clearHueTheme wipes the accent family).
export function initAccent() {
    const hue = loadAccentHue()
    if (hue !== null) applyAccentHue(hue, loadAccentShade())
}

// Apply whichever theme was last saved. Call once before first render.
export function initTheme() {
    // The aurora anchor hue is global — it tints the header's wave in both the axl and classic
    // header styles, so it's applied up front regardless of which theming path runs below.
    applyAuroraHue(loadAuroraHue())

    // While the axl header is active (headerStyle !== 'classic') the app wears one of the three
    // appearances — black, grey or white — straight from its [data-theme] block. Generated spectrum
    // vars and anything the retired background slider left inline are cleared first, so the block
    // is what shows. Setting headerStyle='classic' restores the old spectrum/preset theming below.
    if (localStorage.getItem('headerStyle') !== 'classic') {
        clearHueTheme()
        const root = document.documentElement
        for (const token of RETIRED_INLINE) root.style.removeProperty(token)
        const appearance = loadAppearance()
        root.setAttribute('data-theme', appearance)
        applyBrowserBar(appearance)
        return
    }

    const mode = localStorage.getItem('themeMode') ?? 'preset'
    if (mode === 'spectrum') {
        const hue = Number(localStorage.getItem('themeHue')) || DEFAULT_HUE
        applyHueTheme(hue, loadTone())
    } else {
        const id = localStorage.getItem('theme') ?? 'ocean'
        document.documentElement.setAttribute('data-theme', id)
    }
}

// Switch appearance (black / grey / white): persist the choice, then re-run the boot appliers so
// the whole token set — theme block, accent override — is regenerated in the new band. Order mirrors index.jsx: initTheme() wipes the inline accent
// vars, so the user's accent is re-applied on top of the fresh palette.
export function applyAppearance(mode) {
    saveAppearance(mode)
    initTheme()
    initAccent()
}

export { DEFAULT_HUE, DEFAULT_TONE, DEFAULT_AURORA_HUE, DEFAULT_ACCENT_SHADE, DEFAULT_APPEARANCE, APPEARANCES }
