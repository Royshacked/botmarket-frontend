// ── Spectrum theme generator ──────────────────────────────────────────────────
// Generates the full CSS-variable set from a single hue (0–360), mirroring the
// structure of the curated 'ocean' theme so hue is the only knob. Lightness and
// saturation curves are kept from the hand-tuned themes, so any hue stays dark,
// legible, and consistent in mood + text — just rotated in color.
//
// Semantic colors (long/short, bull/bear, type badges) live in :root in
// _themes.scss and are intentionally NOT generated here — trade meaning never
// changes with the hue.

const DEFAULT_HUE = 213 // ≈ the ocean preset

// Each entry maps a CSS custom property to a function of hue.
function buildHueVars(h) {
    return {
        // Backgrounds — very dark, lightly saturated
        '--bg-base':    `hsl(${h}, 60%, 4%)`,
        '--bg-deep':    `hsl(${h}, 60%, 6%)`,
        '--bg-hover':   `hsl(${h}, 55%, 8%)`,
        '--bg-surface': `hsl(${h}, 55%, 9%)`,
        '--bg-raised':  `hsl(${h}, 50%, 12%)`,
        '--bg-popover': `hsl(${h}, 60%, 11%)`,

        // Accent scale
        '--accent-deep':   `hsl(${h}, 73%, 19%)`,
        '--accent':        `hsl(${h}, 57%, 39%)`,
        '--accent-light':  `hsl(${h}, 65%, 73%)`,
        '--accent-bright': `hsl(${h}, 100%, 89%)`,

        // Text scale
        '--text-primary':   `hsl(${h}, 100%, 92%)`,
        '--text-secondary': `hsl(${h}, 35%, 62%)`,
        '--text-muted':     `hsl(${h}, 48%, 32%)`,
        '--text-dim':       `hsl(${h}, 52%, 25%)`,
        '--text-subtle':    `hsl(${h}, 28%, 73%)`,
        '--text-leaf':      `hsl(${h}, 50%, 85%)`,

        // Borders & effects
        '--border':        `hsla(${h}, 72%, 27%, 0.35)`,
        '--border-mid':    `hsla(${h}, 72%, 27%, 0.45)`,
        '--border-strong': `hsla(${h}, 68%, 58%, 0.55)`,
        '--border-soft':   `hsla(${h}, 64%, 43%, 0.30)`,
        '--glow':          `hsla(${h}, 57%, 38%, 0.14)`,
        '--glow-soft':     `hsla(${h}, 57%, 38%, 0.06)`,
        '--glow-mid':      `hsla(${h}, 57%, 38%, 0.10)`,
        '--overlay':       `rgba(0, 0, 0, 0.65)`,

        // User button + popover
        '--user-btn-bg':           `hsla(${h}, 72%, 27%, 0.35)`,
        '--user-btn-border':       `hsla(${h}, 63%, 59%, 0.40)`,
        '--user-btn-bg-hover':     `hsla(${h}, 64%, 43%, 0.45)`,
        '--user-btn-border-hover': `hsla(${h}, 100%, 74%, 0.70)`,
        '--user-btn-text-hover':   `hsl(${h}, 100%, 95%)`,
        '--popover-border':        `hsla(${h}, 70%, 55%, 0.50)`,
        '--popover-divider':       `hsla(${h}, 64%, 43%, 0.30)`,
        '--popover-btn-hover-bg':  `hsla(${h}, 64%, 43%, 0.20)`,

        // H1 gradient + glow
        '--h1-grad-top':    `hsl(${h}, 100%, 99%)`,
        '--h1-grad-mid1':   `hsl(${h}, 100%, 93%)`,
        '--h1-grad-mid2':   `hsl(${h}, 67%, 80%)`,
        '--h1-grad-mid3':   `hsl(${h}, 58%, 59%)`,
        '--h1-grad-bottom': `hsl(${h}, 67%, 34%)`,
        '--h1-glow-1': `hsla(${h}, 100%, 65%, 0.90)`,
        '--h1-glow-2': `hsla(${h}, 80%, 53%, 0.65)`,
        '--h1-glow-3': `hsla(${h}, 85%, 43%, 0.35)`,
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
