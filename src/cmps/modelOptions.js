import { AI_MODEL_KEY } from '../services/aiPrefKeys.js'

// The chat models the HOUSE card offers (pages/UserProfile.jsx — the admin's one selector, which
// chooses for every account). `id` must match an allowed model id in the backend registry
// (services/llmModels.js); changing the list here means changing it there.
export const MODEL_OPTIONS = [
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', short: 'Haiku 4.5' },
    { id: 'claude-sonnet-5',           label: 'Claude Sonnet 5',   short: 'Sonnet 5' },
    { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6', short: 'Sonnet 4.6' },
    { id: 'claude-opus-4-8',           label: 'Claude Opus 4.8',   short: 'Opus 4.8' },
    { id: 'claude-opus-5',             label: 'Claude Opus 5',     short: 'Opus 5' },
    // CANDIDATES for the desks' base model (2026-09-20). `adminOnly` mirrors the backend registry's
    // flag; since 2026-09-21 only the house card offers any model and only an admin sees it, so the
    // flag gates nothing here any more and the `short` labels are unused.
    { id: 'gpt-5.6-luna',              label: 'GPT-5.6 Luna',      short: 'Luna (admin)',       adminOnly: true },
    { id: 'qwen3.7-plus',              label: 'Qwen3.7-Plus',      short: 'Qwen (admin)',       adminOnly: true },
    { id: 'mistral-medium-3.5',        label: 'Mistral Medium 3.5', short: 'Mistral (admin)',   adminOnly: true },
    // 2026-09-21: the bracket below Luna, the concrete DeepSeek flash id, and the step up from
    // Luna that stays under Sonnet money. Same gate, same registries (llmModels + TALOS_MODELS).
    { id: 'qwen3.7-flash',             label: 'Qwen3.7 Flash',     short: 'Qwen Flash (admin)', adminOnly: true },
    { id: 'deepseek-v4.1-flash',       label: 'DeepSeek V4.1 Flash', short: 'DeepSeek (admin)', adminOnly: true },
    { id: 'gemini-3.8-flash',          label: 'Gemini 3.8 Flash',  short: 'Gemini (admin)',     adminOnly: true },
]

// Sonnet 5 since 2026-09-20 — mirrors the backend's llmModels.DEFAULT_MODEL, which is what an
// unset preference resolves to server-side; this is only what the select shows for it.
export const DEFAULT_MODEL = 'claude-sonnet-5'

// ── The monitors' model (Talos) ──────────────────────────────────────────────
// A SEPARATE list, on purpose: these are the CANDIDATES under evaluation for the Talos read
// (backend monitoring/assess.shared.js TALOS_MODELS — ids must match there). The house card offers
// them, to an admin only, and the pick is the house's `talosModel` for every setup read — the
// per-user `hermesModel` preference is no longer read by anything. Haiku is deliberately absent:
// it was rejected for a real read.
export const TALOS_DEFAULT_MODEL = 'claude-sonnet-4-6'
export const TALOS_MODEL_OPTIONS = [
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (default)' },
    { id: 'claude-sonnet-5',   label: 'Claude Sonnet 5' },
    { id: 'gpt-5.6-luna',      label: 'GPT-5.6 Luna' },
    { id: 'mistral-medium-3.5', label: 'Mistral Medium 3.5' },
    { id: 'qwen3.7-plus',      label: 'Qwen3.7-Plus' },
    { id: 'qwen3.7-flash',     label: 'Qwen3.7 Flash' },
    { id: 'deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash' },
    { id: 'gemini-3.8-flash',  label: 'Gemini 3.8 Flash' },
]

// ONE stored choice, shared by every desk (services/aiPrefKeys.js). It was once per-surface,
// so each panel could be set independently for side-by-side comparison — that UI is gone, and
// the per-desk keys it left behind are what let four desks drift onto the defaults unnoticed.
// SINCE 2026-09-21 the server does not read what the desks send: every turn runs on the house
// model. The desks still put it on the wire (17 call sites) and nothing sets it any more; it is
// a leftover, not a choice.
export function readStoredModel() {
    const stored = localStorage.getItem(AI_MODEL_KEY)
    return MODEL_OPTIONS.some(m => m.id === stored) ? stored : DEFAULT_MODEL
}
