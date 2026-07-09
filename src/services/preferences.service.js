// ── Account-level preference sync ─────────────────────────────────────────────
// The app's UI preferences (theme/accent/aurora/design/text-pace/per-agent AI
// settings) live in localStorage — that's the fast, synchronous source the boot
// appliers (initTheme/initDesign/initAccent) read before first render, so there's
// no flash. This module mirrors that snapshot to the user's account so it follows
// them across devices and browsers:
//   • on login  → hydratePreferences() pulls the account copy and applies it (the
//                 account wins, since it's the durable cross-device record).
//   • on change → queuePrefSync() debounces a push of the whole snapshot.
// localStorage stays the live copy; the server is the durable backup.

import { httpService } from './http.service'
import { initTheme, initAccent } from './themeService'
import { initDesign } from './designService'

// Explicit allowlist — only these keys sync. Keeps unrelated localStorage
// (loggedinUser, popup-idea-*, …) out of the account preferences blob.
const PREF_KEYS = [
    // background spectrum + depth + aurora wash
    'bgSpectrum', 'bgShade', 'auroraHue',
    // classic-header spectrum/preset theming
    'themeMode', 'theme', 'themeHue', 'themeTone', 'headerStyle',
    // accent picker
    'accentHue', 'accentShade',
    // design trial
    'design',
    // chat text streaming speed
    'chatTextPaceCps',
    // per-agent AI settings (model / reasoning / routing)
    'ideaModel', 'ideaReasoning', 'ideaRoutingMode',
    'scannerModel', 'scannerReasoning', 'scannerRoutingMode',
    'portfolioModel', 'portfolioReasoning', 'portfolioRoutingMode',
    'kairosModel', 'kairosReasoning', 'kairosRoutingMode',
    // Hermes = the Kairos monitor; its model is read server-side from this synced blob.
    'hermesModel', 'hermesReasoning', 'hermesRoutingMode',
]

function loggedinUserId() {
    try { return JSON.parse(sessionStorage.getItem('loggedinUser'))?._id ?? null }
    catch { return null }
}

// Snapshot the current preference set from localStorage (present keys only).
export function collectPreferences() {
    const prefs = {}
    for (const key of PREF_KEYS) {
        const val = localStorage.getItem(key)
        if (val !== null) prefs[key] = val
    }
    return prefs
}

// Write an account preferences object into localStorage, then re-run the boot
// appliers so the freshly-hydrated values take effect live.
export function applyPreferences(prefs) {
    if (!prefs || typeof prefs !== 'object') return
    let changed = false
    for (const key of PREF_KEYS) {
        const val = prefs[key]
        if (val === undefined || val === null) continue
        localStorage.setItem(key, String(val))
        changed = true
    }
    if (!changed) return
    // Reflect the hydrated values without a reload. Order mirrors index.jsx.
    initTheme()
    initDesign()
    initAccent()
}

// Pull the account's saved preferences and apply them. Best-effort: on any failure
// (offline, 404) the local copy is kept as-is.
export async function hydratePreferences(userId) {
    const id = userId ?? loggedinUserId()
    if (!id) return
    try {
        const prefs = await httpService.get(`api/users/${id}/preferences`)
        applyPreferences(prefs)
    } catch { /* keep local prefs */ }
}

let syncTimer = null

// Debounced push of the full local preference snapshot to the account. No-op when
// signed out. Best-effort — localStorage remains the live copy regardless.
export function queuePrefSync() {
    const id = loggedinUserId()
    if (!id) return
    clearTimeout(syncTimer)
    syncTimer = setTimeout(() => {
        httpService.put(`api/users/${id}/preferences`, collectPreferences())
            .catch(() => { /* best-effort */ })
    }, 600)
}
