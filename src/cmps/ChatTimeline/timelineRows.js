import { AGENTS } from '../AxlHub/agentMeta.jsx'

// The timeline's pure row helpers (plan phase 7) — kept out of the component files so Fast Refresh keeps
// working for them.

const AXL = { tab: 'axl', brand: 'Axl', hue: 'accent' }

/** The display meta for a session agent key. Axl has no desk entry; an unknown key still shows its name. */
export function agentMeta(key) {
    if (key === 'axl') return AXL
    return AGENTS[key] ?? { tab: key, brand: key ?? 'Agent', hue: 'accent' }
}

/**
 * Whether a row starts a new speaker run: an agent's row after the user, or after another agent. User turns
 * never carry a tag (they are the user's), nor do hand-off dividers (they name both sides themselves).
 */
export function startsRun(row, prev) {
    if (row.role === 'user' || row.kind === 'handoff') return false
    if (!prev || prev.role === 'user' || prev.kind === 'handoff') return true
    return prev.agent !== row.agent
}

/** A card row as its bubble reads it — the card itself, attached by the server (J3). */
export function cardMessageOf(row) {
    const c = row.card ?? {}
    return {
        id: row.ref?.msgId, conversationId: row.ref?.conversationId, type: row.ref?.type, content: row.content,
        payload: c.payload ?? null, actions: c.actions ?? null, status: c.status ?? null,
        resolveOutcome: c.resolveOutcome ?? null, resolveNote: c.resolveNote ?? null, createdAt: row.at,
    }
}
