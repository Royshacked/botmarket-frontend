// ── Design trial switcher (dev) ───────────────────────────────────────────────
// Lets us A/B whole visual identities at runtime — colours, fonts, backgrounds,
// button/title/bubble styling — without touching the theme system. Each design is
// a scoped token + structural layer in setup/_designs.scss, selected by a
// `data-design` attribute on <html>. 'current' = no attribute = the live axl look.
//
// Toggle with Ctrl+Shift+D (see DesignToggle.jsx), persisted in localStorage.

import { initTheme, clearHueTheme, initAccent } from './themeService'

// First entry is the live app (no override). The rest map to [data-design] blocks.
// 'cards' and 'floor' are structural-only trials (see applyDesign + STRUCTURAL_ONLY):
// they keep the live Axl palette and change layout instead of colour.
//   • cards — swaps the Axl Lists Ideas tab from a table to stacked cards.
//   • floor — the whole workspace becomes three columns: book + calendar | chat | desks.
export const DESIGNS = [
    { id: 'terminal', label: 'Terminal' },
    { id: 'neon',     label: 'Neon' },
    { id: 'slate',    label: 'Slate Pro' },
    { id: 'cards',    label: 'Cards' },
    { id: 'floor',    label: 'Floor (3-col)' },
    { id: 'current',  label: 'Axl (current)' },
]

// Trials that change STRUCTURE, not palette: keep the theme's inline tokens (so the app still
// looks like itself) and only flag the layout layer on <html>. A palette trial does the opposite —
// see the else branch in applyDesign.
const STRUCTURAL_ONLY = new Set(['cards', 'floor'])

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
    } else if (STRUCTURAL_ONLY.has(id)) {
        // Structural-only trial: keep the live Axl palette (don't strip the theme's
        // inline tokens), just flag the layout layer on <html>.
        initTheme()
        root.setAttribute('data-design', id)
    } else {
        // Let the [data-design] CSS block fully own the palette: drop the inline theme
        // vars (generated spectrum + bg spectrum) that would otherwise out-rank it.
        clearHueTheme()
        for (const t of INLINE_BG_TOKENS) root.style.removeProperty(t)
        root.setAttribute('data-design', id)
    }
    // Re-apply the user's accent override on top of the now-active palette — the
    // steps above (initTheme / clearHueTheme) wipe the inline accent vars.
    initAccent()
}

// Apply the saved design once at boot (after initTheme). No-op for 'current'.
// Also keep every OTHER open same-origin window (notably a popped-out idea window)
// in sync: the `storage` event fires in other windows whenever localStorage 'design'
// is written, so changing the design in one window live-updates the rest.
export function initDesign() {
    const id = loadDesign()
    if (id && id !== 'current') applyDesign(id)

    window.addEventListener('storage', (e) => {
        if (e.key === 'design') applyDesign(e.newValue || 'current')
    })
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
