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

// Apply whichever theme was last saved. Call once before first render.
export function initTheme() {
    const mode = localStorage.getItem('themeMode') ?? 'preset'
    if (mode === 'spectrum') {
        const hue = Number(localStorage.getItem('themeHue')) || DEFAULT_HUE
        applyHueTheme(hue, loadTone())
    } else {
        const id = localStorage.getItem('theme') ?? 'ocean'
        document.documentElement.setAttribute('data-theme', id)
    }
}

export { DEFAULT_HUE, DEFAULT_TONE }
