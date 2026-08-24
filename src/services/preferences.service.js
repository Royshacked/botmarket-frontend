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
import { AI_PREF_KEYS, LEGACY_AI_PREF_KEYS, migrateAiPrefs } from './aiPrefKeys'

// Explicit allowlist — only these keys sync. Keeps unrelated localStorage
// (loggedinUser, popup-idea-*, …) out of the account preferences blob.
const PREF_KEYS = [
    // dark ⇄ light appearance, background spectrum + depth + aurora wash
    'themeAppearance', 'bgSpectrum', 'bgShade', 'auroraHue',
    // classic-header spectrum/preset theming
    'themeMode', 'theme', 'themeHue', 'themeTone', 'headerStyle',
    // accent picker
    'accentHue', 'accentShade',
    // design trial
    'design',
    // chat text streaming speed
    'chatTextPaceCps',
    // the one shared AI setting every conversational desk reads (services/aiPrefKeys.js)
    ...AI_PREF_KEYS,
    // The monitors' own knob, read SERVER-SIDE (assess.shared.js) for both Hermes and Talos.
    // Deliberately not part of the desk setting: it decides how hard the background monitors
    // think, has no profile card, and nothing in the UI writes it. `hermesRoutingMode` is gone
    // with the rest of the routing layer — it never had a reader.
    'hermesModel', 'hermesReasoning',
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
    // The legacy per-agent AI keys are hydrated too — not because anything reads them, but so
    // migrateAiPrefs can adopt a choice made before the one-key change when the account copy is
    // all a fresh browser has. collectPreferences never sends them back, so the account sheds
    // them on the next sync.
    for (const key of [...PREF_KEYS, ...LEGACY_AI_PREF_KEYS]) {
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
    // Outside the try on purpose: a user whose account copy failed to load may still have
    // local per-agent keys to carry onto the single key. Idempotent — once the legacy keys are
    // cleared a second run finds nothing, so this costs one no-op read per login thereafter.
    const { adopted, cleared } = migrateAiPrefs(localStorage)
    if (adopted.length || cleared.length) queuePrefSync()
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
