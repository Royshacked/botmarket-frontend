// Selectable reasoning-effort levels. `id` must match a level the backend
// providers understand (providers/anthropic.provider.js → thinking budget,
// providers/openai.provider.js → reasoning.effort). 'off' means no extended
// thinking on Anthropic (zero reasoning tokens) and the lowest setting on GPT-5.
export const REASONING_OPTIONS = [
    { id: 'off',  label: 'No thinking', short: 'Fast', hint: 'Fastest, cheapest — no extended reasoning' },
    { id: 'low',  label: 'Think',       short: 'Think', hint: 'A little reasoning before answering' },
    { id: 'high', label: 'Deep think',  short: 'Deep', hint: 'Most reasoning — best for sizing & theses' },
]

export const DEFAULT_REASONING = 'off'

// Persist per-surface (idea vs portfolio vs scanner) like the model choice, so a
// reload keeps it and each agent can be tuned independently.
export function readStoredReasoning(storageKey) {
    const stored = localStorage.getItem(storageKey)
    return REASONING_OPTIONS.some(r => r.id === stored) ? stored : DEFAULT_REASONING
}
