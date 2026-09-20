import { AI_MODEL_KEY } from '../services/aiPrefKeys.js'

// Selectable chat models. `id` must match an allowed model id in the backend
// registry (services/llmModels.js); changing the list here means changing it there.
export const MODEL_OPTIONS = [
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', short: 'Haiku 4.5' },
    { id: 'claude-sonnet-5',           label: 'Claude Sonnet 5',   short: 'Sonnet 5' },
    { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6', short: 'Sonnet 4.6' },
    { id: 'claude-opus-4-8',           label: 'Claude Opus 4.8',   short: 'Opus 4.8' },
    { id: 'claude-opus-5',             label: 'Claude Opus 5',     short: 'Opus 5' },
    // A CANDIDATE for the desks' base model (2026-09-20), offered to an admin only — the backend's
    // registry gates it the same way (llmModels adminOnly → resolveAgentStream), so a stored value
    // on a non-admin account is routed to the default server-side. See chatModelOptions.
    { id: 'gpt-5.6-luna',              label: 'GPT-5.6 Luna',      short: 'Luna (admin)', adminOnly: true },
]

/** The chat model options this user may pick from. */
export function chatModelOptions(isAdmin) {
    return isAdmin ? MODEL_OPTIONS : MODEL_OPTIONS.filter(m => !m.adminOnly)
}

// Sonnet 5 since 2026-09-20 — mirrors the backend's llmModels.DEFAULT_MODEL, which is what an
// unset preference resolves to server-side; this is only what the select shows for it.
export const DEFAULT_MODEL = 'claude-sonnet-5'

// ── The monitors' model (Talos) ──────────────────────────────────────────────
// A SEPARATE list, on purpose: these are the CANDIDATES under evaluation for the Talos read
// (backend monitoring/assess.shared.js TALOS_MODELS — ids must match there, and the non-Anthropic
// ones are admin-only on the server too, so a hand-crafted preference cannot route a trader onto
// one). The card that offers them renders for an admin only. Haiku is deliberately absent: it was
// rejected for a real read. The key it writes is `hermesModel` — the monitors' own knob, read by
// assessRouting for every read of the user's setups.
export const TALOS_MODEL_KEY = 'hermesModel'
export const TALOS_DEFAULT_MODEL = 'claude-sonnet-4-6'
export const TALOS_MODEL_OPTIONS = [
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (default)' },
    { id: 'claude-sonnet-5',   label: 'Claude Sonnet 5' },
    { id: 'gpt-5.6-luna',      label: 'GPT-5.6 Luna' },
    { id: 'mistral-medium-3.5', label: 'Mistral Medium 3.5' },
    { id: 'qwen3.7-plus',      label: 'Qwen3.7-Plus' },
]

export function readStoredTalosModel() {
    const stored = localStorage.getItem(TALOS_MODEL_KEY)
    return TALOS_MODEL_OPTIONS.some(m => m.id === stored) ? stored : TALOS_DEFAULT_MODEL
}

// ONE stored choice, shared by every desk (services/aiPrefKeys.js). It was once per-surface,
// so each panel could be set independently for side-by-side comparison — that UI is gone, and
// the per-desk keys it left behind are what let four desks drift onto the defaults unnoticed.
export function readStoredModel() {
    const stored = localStorage.getItem(AI_MODEL_KEY)
    return MODEL_OPTIONS.some(m => m.id === stored) ? stored : DEFAULT_MODEL
}
