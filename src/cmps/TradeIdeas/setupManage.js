// Talos's in-position VERDICT vocabulary — one home, because three surfaces speak it: the
// social-chat `setup_manage` card, the setup pop-out's management card, and anything else that has
// to say what the monitor is proposing. Two copies of this table is how "add_leg" ends up
// acceptable in one place and refused in the other.
//
// What this module does NOT do is decide anything. Whether the server will take an accept is the
// server's call (talos.handoff refuses `add_leg` too); this is the client saying the same thing so
// the user is never offered a button that leads to a no.

/**
 * The verdicts a user can ACCEPT, and the button label for each.
 *   add_leg  MISSING ON PURPOSE. Talos already parked the order plan for the printing leg — it is
 *            taken by confirming that ORDER, not from a management card. Accepting here would place
 *            the size twice.
 */
export const MANAGE_LABEL = { move_stop: 'Move stop', take_partial: 'Take partial', exit_now: 'Exit now' }

/** Can this verdict be accepted from a card? Safe on a missing / unknown verdict. */
export function canAcceptManage(verdict) {
    return Object.hasOwn(MANAGE_LABEL, verdict ?? '')
}

/** Card-copy phrasing: "Talos wants to <verb>". Falls back to the raw verdict rather than to nothing. */
const VERB_COPY = { move_stop: 'move the stop', add_leg: 'add the planned leg', take_partial: 'take a partial', exit_now: 'exit now' }
export const manageVerb = (verdict) => VERB_COPY[verdict] ?? verdict

/**
 * The proposal as one line the user can accept at a glance. A partial names the watched target's
 * own size — the user's number, set when they made the leg conditional
 * (docs/design/talos-per-candle.md). `new_stop` is still accepted so a card written in the shared
 * executor's dialect doesn't render blank.
 */
export function manageProposalLine(verdict, p) {
    if (verdict === 'add_leg') return 'The planned leg is printing — confirm its order to add it.'
    if (!p) return null
    if (verdict === 'move_stop')    return `New stop ${p.stop ?? p.new_stop}${p.why ? ` (${p.why})` : ''}`
    if (verdict === 'take_partial') return `Bank ${Number.isFinite(p.quantity) ? p.quantity : 'the watched leg'} — the condition on your target came true`
    if (verdict === 'exit_now')     return p.why || 'Flatten the position now'
    return null
}
