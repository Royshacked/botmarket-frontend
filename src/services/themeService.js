// ── Spectrum theme generator ──────────────────────────────────────────────────
// Generates the full CSS-variable set from a single hue (0–360), mirroring the
// structure of the curated 'ocean' theme so hue is the only knob. Lightness and
// saturation curves are kept from the hand-tuned themes, so any hue stays dark,
// legible, and consistent in mood + text — just rotated in color.
//
// The spectrum is intentionally a *dark* spectrum: saturation is muted and fades
// to zero at both edges, and the far-left edge darkens toward black. So sliding
// gives `black | dark muted hues | gray` rather than a bright rainbow — see
// spectrumShape. Text + heading lightness is left untouched so every position
// stays legible; only saturation/darkness are reshaped.
//
// Semantic colors (long/short, bull/bear, type badges) live in :root in
// _themes.scss and are intentionally NOT generated here — trade meaning never
// changes with the hue.

const DEFAULT_HUE = 213 // ≈ the ocean preset

// Position-derived shape (hue doubles as the 0–360 slider position):
//   satMul  — muted saturation that fades to 0 at both ends → neutral gray/black edges.
//   darkMul — darkness ramp: 0.4 (black) at the left edge, reaching full by ≈15% in.
// Together the left edge reads as black, the right edge as gray, the middle as
// dark muted hues.
function spectrumShape(hue) {
    const p       = hue / 360
    const satMul  = Math.sin(Math.PI * p) * 0.55
    const darkMul = Math.min(1, 0.4 + (p / 0.15) * 0.6)
    return { satMul, darkMul }
}

// Accent color for a given hue — single source of truth for the slider preview.
export function spectrumPreview(hue) {
    const { satMul, darkMul } = spectrumShape(hue)
    return `hsl(${hue}, ${+(57 * satMul).toFixed(1)}%, ${+(39 * darkMul).toFixed(1)}%)`
}

// Each entry maps a CSS custom property to a function of hue.
function buildHueVars(h) {
    const { satMul, darkMul } = spectrumShape(h)
    const s = v => +(v * satMul).toFixed(1)   // muted saturation, neutral at the spectrum ends
    const d = v => +(v * darkMul).toFixed(1)  // lightness darkened toward black at the left edge
    return {
        // Backgrounds — very dark, lightly saturated
        '--bg-base':    `hsl(${h}, ${s(60)}%, ${d(4)}%)`,
        '--bg-deep':    `hsl(${h}, ${s(60)}%, ${d(6)}%)`,
        '--bg-hover':   `hsl(${h}, ${s(55)}%, ${d(8)}%)`,
        '--bg-surface': `hsl(${h}, ${s(55)}%, ${d(9)}%)`,
        '--bg-raised':  `hsl(${h}, ${s(50)}%, ${d(12)}%)`,
        '--bg-popover': `hsl(${h}, ${s(60)}%, ${d(11)}%)`,

        // Accent scale
        '--accent-deep':   `hsl(${h}, ${s(73)}%, ${d(19)}%)`,
        '--accent':        `hsl(${h}, ${s(57)}%, ${d(39)}%)`,
        '--accent-light':  `hsl(${h}, ${s(65)}%, ${d(73)}%)`,
        '--accent-bright': `hsl(${h}, ${s(100)}%, ${d(89)}%)`,

        // Text scale — lightness kept raw so text stays legible at every position
        '--text-primary':   `hsl(${h}, ${s(100)}%, 92%)`,
        '--text-secondary': `hsl(${h}, ${s(35)}%, 62%)`,
        '--text-muted':     `hsl(${h}, ${s(48)}%, 32%)`,
        '--text-dim':       `hsl(${h}, ${s(52)}%, 25%)`,
        '--text-subtle':    `hsl(${h}, ${s(28)}%, 73%)`,
        '--text-leaf':      `hsl(${h}, ${s(50)}%, 85%)`,

        // Borders & effects
        '--border':        `hsla(${h}, ${s(72)}%, ${d(27)}%, 0.35)`,
        '--border-mid':    `hsla(${h}, ${s(72)}%, ${d(27)}%, 0.45)`,
        '--border-strong': `hsla(${h}, ${s(68)}%, ${d(58)}%, 0.55)`,
        '--border-soft':   `hsla(${h}, ${s(64)}%, ${d(43)}%, 0.30)`,
        '--glow':          `hsla(${h}, ${s(57)}%, ${d(38)}%, 0.14)`,
        '--glow-soft':     `hsla(${h}, ${s(57)}%, ${d(38)}%, 0.06)`,
        '--glow-mid':      `hsla(${h}, ${s(57)}%, ${d(38)}%, 0.10)`,
        '--overlay':       `rgba(0, 0, 0, 0.65)`,

        // User button + popover
        '--user-btn-bg':           `hsla(${h}, ${s(72)}%, ${d(27)}%, 0.35)`,
        '--user-btn-border':       `hsla(${h}, ${s(63)}%, ${d(59)}%, 0.40)`,
        '--user-btn-bg-hover':     `hsla(${h}, ${s(64)}%, ${d(43)}%, 0.45)`,
        '--user-btn-border-hover': `hsla(${h}, ${s(100)}%, ${d(74)}%, 0.70)`,
        '--user-btn-text-hover':   `hsl(${h}, ${s(100)}%, 95%)`,
        '--popover-border':        `hsla(${h}, ${s(70)}%, ${d(55)}%, 0.50)`,
        '--popover-divider':       `hsla(${h}, ${s(64)}%, ${d(43)}%, 0.30)`,
        '--popover-btn-hover-bg':  `hsla(${h}, ${s(64)}%, ${d(43)}%, 0.20)`,

        // H1 gradient (lightness kept raw, like text) + glow
        '--h1-grad-top':    `hsl(${h}, ${s(100)}%, 99%)`,
        '--h1-grad-mid1':   `hsl(${h}, ${s(100)}%, 93%)`,
        '--h1-grad-mid2':   `hsl(${h}, ${s(67)}%, 80%)`,
        '--h1-grad-mid3':   `hsl(${h}, ${s(58)}%, 59%)`,
        '--h1-grad-bottom': `hsl(${h}, ${s(67)}%, 34%)`,
        '--h1-glow-1': `hsla(${h}, ${s(100)}%, ${d(65)}%, 0.90)`,
        '--h1-glow-2': `hsla(${h}, ${s(80)}%, ${d(53)}%, 0.65)`,
        '--h1-glow-3': `hsla(${h}, ${s(85)}%, ${d(43)}%, 0.35)`,
    }
}

// Apply a generated hue theme as inline vars on <html> (overrides the [data-theme] block).
export function applyHueTheme(hue) {
    const root = document.documentElement
    const vars = buildHueVars(hue)
    for (const [key, val] of Object.entries(vars)) root.style.setProperty(key, val)
    root.setAttribute('data-theme', 'spectrum')
}

// Remove the generated vars so a preset [data-theme] block takes over again.
export function clearHueTheme() {
    const root = document.documentElement
    for (const key of Object.keys(buildHueVars(0))) root.style.removeProperty(key)
}

export function savePreset(id) {
    localStorage.setItem('themeMode', 'preset')
    localStorage.setItem('theme', id)
}

export function saveSpectrum(hue) {
    localStorage.setItem('themeMode', 'spectrum')
    localStorage.setItem('themeHue', String(hue))
}

// Apply whichever theme was last saved. Call once before first render.
export function initTheme() {
    const mode = localStorage.getItem('themeMode') ?? 'preset'
    if (mode === 'spectrum') {
        const hue = Number(localStorage.getItem('themeHue')) || DEFAULT_HUE
        applyHueTheme(hue)
    } else {
        const id = localStorage.getItem('theme') ?? 'ocean'
        document.documentElement.setAttribute('data-theme', id)
    }
}

export { DEFAULT_HUE }
