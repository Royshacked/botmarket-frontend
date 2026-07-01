// Selectable model-routing modes. `id` must match what the backend router
// understands (manual = client picks model+reasoning; auto = phase-based routing;
// classifier = Haiku reads each message and picks the model). Split out from a
// component file so it's a pure helper module (mirrors reasoningOptions.js).
export const ROUTING_MODES = [
    { id: 'manual',     short: 'Manual',  title: 'You pick model and reasoning each turn' },
    { id: 'auto',       short: 'Auto',    title: 'Phase-based routing — cheapest model per phase, zero latency' },
    { id: 'classifier', short: 'AI classifier', title: 'Haiku reads each message and picks the right model' },
]

export const DEFAULT_ROUTING_MODE = 'manual'

// Persist per-surface (idea vs portfolio vs scanner) like the model choice.
export function readStoredRoutingMode(storageKey) {
    const stored = localStorage.getItem(storageKey)
    return ROUTING_MODES.some(m => m.id === stored) ? stored : DEFAULT_ROUTING_MODE
}
