// ── Design trial switcher (dev) ───────────────────────────────────────────────
// Lets us A/B whole visual identities at runtime — colours, fonts, backgrounds,
// button/title/bubble styling — without touching the theme system. Each design is
// a scoped token + structural layer in setup/_designs.scss, selected by a
// `data-design` attribute on <html>. 'current' = no attribute = the live axl look.
//
// Toggle with Ctrl+Shift+D (see DesignToggle.jsx), persisted in localStorage.

import { initTheme, clearHueTheme } from './themeService'

// First entry is the live app (no override). The rest map to [data-design] blocks.
export const DESIGNS = [
    { id: 'terminal', label: 'Terminal' },
    { id: 'aurora',   label: 'Aurora Soft' },
    { id: 'neon',     label: 'Neon' },
    { id: 'slate',    label: 'Slate Pro' },
    { id: 'current',  label: 'Axl (current)' },
]

// initTheme() writes these --bg-* tokens INLINE on <html> (the bg spectrum), which
// would out-rank any [data-design] CSS block. We strip them so the design layer's
// palette can take over; switching back to 'current' re-runs initTheme() to restore.
const INLINE_BG_TOKENS = ['--bg-base', '--bg-deep', '--bg-hover', '--bg-surface', '--bg-raised', '--bg-popover']

export function loadDesign() {
    return localStorage.getItem('design') || 'current'
}

export function saveDesign(id) {
    localStorage.setItem('design', id)
}

export function applyDesign(id) {
    const root = document.documentElement
    if (!id || id === 'current') {
        root.removeAttribute('data-design')
        initTheme()                       // restore axl theme + bg spectrum + aurora
        return
    }
    // Let the [data-design] CSS block fully own the palette: drop the inline theme
    // vars (generated spectrum + bg spectrum) that would otherwise out-rank it.
    clearHueTheme()
    for (const t of INLINE_BG_TOKENS) root.style.removeProperty(t)
    root.setAttribute('data-design', id)
}

// Apply the saved design once at boot (after initTheme). No-op for 'current'.
export function initDesign() {
    const id = loadDesign()
    if (id && id !== 'current') applyDesign(id)
}

// Advance to the next design in the list, persist + apply it, and return its entry.
export function cycleDesign() {
    const cur  = loadDesign()
    const idx  = DESIGNS.findIndex(d => d.id === cur)
    const next = DESIGNS[(idx + 1) % DESIGNS.length]
    saveDesign(next.id)
    applyDesign(next.id)
    return next
}
