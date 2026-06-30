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

// Set the global aurora anchor hue — re-tints the shared --aurora-wash everywhere.
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

// ── Background spectrum ───────────────────────────────────────────────────────
// The profile slider (0–100) sweeps the app background through a curated path of
// very dark hues: dark cyan → dark teal → very dark green → dark blue → near-black.
// Only the --bg-* tokens are regenerated — set inline on <html>, overriding the
// axl theme — so accent / text / wordmark are left untouched.
const BG_STOPS = [
    { h: 187, s: 68, l: 6 },  // dark cyan
    { h: 176, s: 72, l: 5 },  // dark teal
    { h: 140, s: 72, l: 4 },  // very dark green
    { h: 218, s: 72, l: 6 },  // dark blue
    { h: 220, s: 10, l: 1.5 }, // near-black
]

// Lightness offset of each background token relative to --bg-base (mirrors the
// hand-tuned spacing of the axl scale, so panels keep their subtle layering).
const BG_DELTAS = {
    '--bg-base':     0,
    '--bg-deep':    -1.5,
    '--bg-hover':    2,
    '--bg-surface':  4,
    '--bg-raised':   6.5,
    '--bg-popover':  4,
}

const DEFAULT_BG = 25 // the dark-teal stop ≈ the original axl background

const lerp = (a, b, t) => a + (b - a) * t

// Interpolate the curated stops at slider position pos (0–100) → {h,s,l} of --bg-base.
function bgStopAt(pos) {
    const t = Math.max(0, Math.min(100, pos)) / 100
    const seg = t * (BG_STOPS.length - 1)
    const i = Math.min(BG_STOPS.length - 2, Math.floor(seg))
    const f = seg - i
    const a = BG_STOPS[i], b = BG_STOPS[i + 1]
    return { h: lerp(a.h, b.h, f), s: lerp(a.s, b.s, f), l: lerp(a.l, b.l, f) }
}

// A brightened swatch of the position, so the slider preview dot is legible
// (the real backgrounds are intentionally near-black).
export function bgPreview(pos) {
    const { h, s } = bgStopAt(pos)
    return `hsl(${h.toFixed(1)}, ${s.toFixed(1)}%, 38%)`
}

// Apply the background spectrum live — sets every --bg-* token inline on <html>.
export function applyBgSpectrum(pos) {
    const { h, s, l } = bgStopAt(pos)
    const root = document.documentElement
    for (const [token, delta] of Object.entries(BG_DELTAS)) {
        const li = Math.max(0, Math.min(100, l + delta))
        root.style.setProperty(token, `hsl(${h.toFixed(1)}, ${s.toFixed(1)}%, ${li.toFixed(1)}%)`)
    }
}

export function saveBgSpectrum(pos) {
    localStorage.setItem('bgSpectrum', String(pos))
}

export function loadBgSpectrum() {
    const raw = localStorage.getItem('bgSpectrum')
    return raw === null ? DEFAULT_BG : Number(raw)
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

function buildAccentVars(h, shade = DEFAULT_ACCENT_SHADE) {
    const d = accentShift(shade)
    // Shift a base lightness by the shade delta, clamped (floor keeps the light
    // tokens legible as accent text even at the deepest setting).
    const L = (v, floor = 3) => Math.max(floor, Math.min(97, +(v + d).toFixed(1)))
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

export function applyAccentHue(hue, shade = DEFAULT_ACCENT_SHADE) {
    const root = document.documentElement
    const vars = buildAccentVars(hue, shade)
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
    // The aurora wash hue is global — it tints the shared --aurora-wash used by the
    // header and every panel, in both the axl and classic header styles, so it's
    // applied up front regardless of which theming path runs below.
    applyAuroraHue(loadAuroraHue())

    // Header-style trial: while the axl header is active (headerStyle !== 'classic'),
    // the app always uses the curated 'axl' aurora theme so its colours match the
    // header exactly. Any generated spectrum vars are cleared, so the profile theme
    // slider can't drift the app off the header palette. Setting headerStyle='classic'
    // restores normal (spectrum/preset) theming below.
    if (localStorage.getItem('headerStyle') !== 'classic') {
        clearHueTheme()
        document.documentElement.setAttribute('data-theme', 'axl')
        applyBgSpectrum(loadBgSpectrum())
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

export { DEFAULT_HUE, DEFAULT_TONE, DEFAULT_AURORA_HUE, DEFAULT_ACCENT_SHADE }
