// Kairos analytical MODES — the build lens (discretionary / smc / institutional). `id` must match
// the backend (chatState.mode → tool subset + prompt profile). Split out as a pure helper module
// (mirrors modelOptions.js). See KAIROS_MODES.md. Unrelated to the removed AI routing modes —
// these are Kairos's analytical LENSES (discretionary / institutional / smc).
export const KAIROS_MODES = [
    { id: 'discretionary', short: 'Discretionary', title: 'Classical price action — structure, momentum, false-breaks' },
    { id: 'smc',           short: 'SMC',           title: 'Smart-money — order-blocks, FVG, liquidity, BOS/CHoCH, premium/discount' },
    { id: 'institutional', short: 'Institutional', title: 'Macro regime, relative strength, positioning' },
]

export const DEFAULT_KAIROS_MODE = 'discretionary'

// Persist the last-picked mode per-surface, like the model/reasoning choices.
export function readStoredKairosMode(storageKey) {
    const stored = localStorage.getItem(storageKey)
    return KAIROS_MODES.some(m => m.id === stored) ? stored : DEFAULT_KAIROS_MODE
}
