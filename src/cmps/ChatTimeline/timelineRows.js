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
 * Rows the chat does not draw (one-axl.md, 2026-11-13) — the plumbing of one assistant changing hats: a HAND-OFF (the next
 * row's role says who took over) and a route's OPENING (the receiving role's first turn, written as the user's message —
 * the user typed once and sees it once). Both stay in the session, for the role and for History.
 */
export const isOffScreen = (row) => row?.kind === 'handoff' || (row?.role === 'user' && row?.ref?.opening === true)

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

/**
 * The "✓ … You're back with Axl." line a commit opens a session with (backend act.endAfterCommit). It is shown only
 * while the session is fresh — above Axl's greeting — and never once the conversation has started (Roy, 2026-10-18).
 */
export const isEndedLine = (row) => row?.kind === 'sealed' && row.ref?.ended === true

// When this page was opened. A minute of slack for the server's clock against this one: a save made just after the
// page opened must still show its line.
const OPENED_AT = Date.now() - 60_000

/**
 * Whether that line belongs to THIS visit — the save happened after the page opened (Roy, 2026-11-02: "the built PENG
 * setup chip is stuck even when it's armed already"). An untouched session kept it, and its "arm it" button, for days;
 * the moment it marks is the save, so on the next visit it is gone. `openedAt` — a seam for tests.
 */
export const isFreshEndedLine = (row, openedAt = OPENED_AT) => isEndedLine(row) && Number(row.at) >= openedAt
