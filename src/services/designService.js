// ── Design trial switcher (dev) ───────────────────────────────────────────────
// Lets us A/B a whole layout at runtime without touching the theme system. A design
// is a structural layer selected by a `data-design` attribute on <html>;
// 'current' = no attribute = the live axl look.
//
// Picked from the Design dropdown in the profile page, persisted in localStorage.

import { initTheme, initAccent } from './themeService'

// First entry is the live app (no override). The rest map to [data-design] blocks.
// Every trial here is STRUCTURAL: it keeps the live Axl palette and changes layout
// instead of colour (palette trials were removed — see git history if we want one back).
//   • floor — the whole workspace becomes three columns: book + calendar | chat | desks.
export const DESIGNS = [
    { id: 'floor',   label: 'Floor (3-col)' },
    { id: 'current', label: 'Axl (current)' },
]

// A stored id that no longer exists (a retired trial, or one synced from another
// device) falls back to the live look rather than flagging a design with no CSS.
export function loadDesign() {
    const id = localStorage.getItem('design')
    return DESIGNS.some(d => d.id === id) ? id : 'current'
}

export function saveDesign(id) {
    localStorage.setItem('design', id)
}

export function applyDesign(id) {
    const root = document.documentElement
    // Structural-only trials keep the live Axl palette (the theme's inline tokens
    // stay), so all we do is flag — or clear — the layout layer on <html>.
    initTheme()                           // restore axl theme + bg spectrum + aurora
    if (!id || id === 'current') root.removeAttribute('data-design')
    else                         root.setAttribute('data-design', id)
    // Re-apply the user's accent override on top of the palette — initTheme() wipes
    // the inline accent vars.
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
