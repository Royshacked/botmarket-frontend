import { AI_MODEL_KEY } from '../services/aiPrefKeys.js'

// Selectable chat models. `id` must match an allowed model id in the backend
// registry (services/llmModels.js); changing the list here means changing it there.
export const MODEL_OPTIONS = [
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', short: 'Haiku 4.5' },
    { id: 'claude-sonnet-5',           label: 'Claude Sonnet 5',   short: 'Sonnet 5' },
    { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6', short: 'Sonnet 4.6' },
    { id: 'claude-opus-4-8',           label: 'Claude Opus 4.8',   short: 'Opus 4.8' },
    { id: 'claude-opus-5',             label: 'Claude Opus 5',     short: 'Opus 5' },
]

export const DEFAULT_MODEL = 'claude-sonnet-4-6'

// ONE stored choice, shared by every desk (services/aiPrefKeys.js). It was once per-surface,
// so each panel could be set independently for side-by-side comparison — that UI is gone, and
// the per-desk keys it left behind are what let four desks drift onto the defaults unnoticed.
export function readStoredModel() {
    const stored = localStorage.getItem(AI_MODEL_KEY)
    return MODEL_OPTIONS.some(m => m.id === stored) ? stored : DEFAULT_MODEL
}
