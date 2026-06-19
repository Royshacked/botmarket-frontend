// Selectable chat models. `id` must match an allowed model id in the backend
// registry (services/llmModels.js); changing the list here means changing it there.
export const MODEL_OPTIONS = [
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', short: 'Sonnet 4.6' },
    { id: 'gpt-5',             label: 'GPT-5',              short: 'GPT-5' },
]

export const DEFAULT_MODEL = 'claude-sonnet-4-6'

// Persist the choice per-surface (idea vs portfolio) so a reload keeps it and the
// two agents can be set independently for side-by-side comparison.
export function readStoredModel(storageKey) {
    const stored = localStorage.getItem(storageKey)
    return MODEL_OPTIONS.some(m => m.id === stored) ? stored : DEFAULT_MODEL
}
