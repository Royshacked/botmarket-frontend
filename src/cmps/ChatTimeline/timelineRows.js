import { AGENTS } from '../AxlHub/agentMeta.jsx'

// The timeline's pure row helpers (plan phase 7) — kept out of the component files so Fast Refresh keeps
// working for them.

const AXL = { tab: 'axl', brand: 'Axl', hue: 'accent' }

/** The display meta for a session agent key. Axl has no desk entry; an unknown key still shows its name. */
export function agentMeta(key) {
    if (key === 'axl') return AXL
    return AGENTS[key] ?? { tab: key, brand: key ?? 'Agent', hue: 'accent' }
}

// Rows that name their own speaker: a hand-off names both sides.
const SELF_NAMED = new Set(['handoff'])

/**
 * Whether a row starts a new speaker run: an agent's row after the user, or after another agent. User turns
 * never carry a tag (they are the user's), nor do rows that name their own speaker — and the row after one
 * of those starts a fresh run, so a reply under a hand-off still says who is talking.
 */
export function startsRun(row, prev) {
    if (row.role === 'user' || SELF_NAMED.has(row.kind)) return false
    if (!prev || prev.role === 'user' || SELF_NAMED.has(prev.kind)) return true
    return prev.agent !== row.agent
}
