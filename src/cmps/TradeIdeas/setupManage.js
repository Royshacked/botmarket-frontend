// Talos's in-position VERDICT vocabulary — one home, because three surfaces speak it: the
// social-chat `setup_manage` card, the setup pop-out's management card, and (soon) anything else
// that has to say what the monitor is proposing. Two copies of this table is how "add_leg" ends up
// acceptable in one place and refused in the other.
//
// What this module does NOT do is decide anything. Whether the server will take an accept is the
// server's call (talos.handoff refuses `add_leg` and `let_run` too); this is the client saying the
// same thing so the user is never offered a button that leads to a no.

/**
 * The verdicts a user can ACCEPT, and the button label for each.
 *   add_leg  MISSING ON PURPOSE. Talos already parked the order plan for the printing leg — it is
 *            taken by confirming that ORDER, not from a management card. Accepting here would place
 *            the size twice.
 *   let_run  CONDITIONAL, see canAcceptManage: bare it is a decision not to act, but carrying a new
 *            target it is an amend of the resting limit and needs the same confirm as any other.
 */
export const MANAGE_LABEL = { move_stop: 'Move stop', take_partial: 'Take partial', exit_now: 'Exit now', let_run: 'Move target' }

/** The level a let_run is proposing, in either dialect. Null when it is the bare "keep holding". */
export const proposedTarget = (p) => {
    const level = Number(p?.new_tp ?? p?.tp)
    return Number.isFinite(level) ? level : null
}

/**
 * Can this verdict be accepted at all, or is it a statement / a pointer somewhere else?
 *
 * `let_run` is the one that needs its proposal to answer: the same word covers "I am deliberately
 * not trimming here" (nothing to execute) and "there is more in this than we planned, move the
 * target out to X" (an amend). Offering a button for the first would send the user to a server that
 * answers `bad_proposal`; withholding it from the second would strand a real proposal on the card.
 */
export function canAcceptManage(verdict, proposal = null) {
    if (verdict === 'let_run') return proposedTarget(proposal) != null || proposal?.cancel_tp === true
    return Object.hasOwn(MANAGE_LABEL, verdict ?? '')
}

/** Card-copy phrasing: "Talos wants to <verb>". Falls back to the raw verdict rather than to nothing. */
const VERB_COPY = { move_stop: 'move the stop', add_leg: 'add the planned leg', take_partial: 'take a partial', exit_now: 'exit now', let_run: 'let it run' }
export const manageVerb = (verdict) => VERB_COPY[verdict] ?? verdict

const FRACTION_WORD = { third: 'a third', half: 'half', two_thirds: 'two thirds' }

/**
 * The proposal in one line. Read in TALOS's vocabulary (`stop`, `fraction`, `why`) — not the shared
 * executor's (`new_stop`, `size_pct`), which the server translates into on the way in. `new_stop` is
 * still accepted so a card written in the shared dialect doesn't render blank.
 */
export function manageProposalLine(verdict, p) {
    if (verdict === 'add_leg') return 'The planned leg is printing — confirm its order to add it.'
    if (verdict === 'let_run') {
        if (p?.cancel_tp === true) return 'Cancel the target and let this run uncapped'
        const tp = proposedTarget(p)
        if (tp != null) return `Move the target out to ${tp}${p.why ? ` (${p.why})` : ''}`
        return p?.why || 'Letting it run rather than trimming here.'
    }
    if (!p) return null
    if (verdict === 'move_stop')    return `New stop ${p.stop ?? p.new_stop}${p.why ? ` (${p.why})` : ''}`
    if (verdict === 'take_partial') return `Bank ${FRACTION_WORD[p.fraction] ?? 'part'} of the position`
    if (verdict === 'exit_now')     return p.why || 'Flatten the position now'
    return null
}
