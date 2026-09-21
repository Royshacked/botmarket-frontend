// The opening turn a SHARED-SETUP card hands Mentor. Pure — no React, no fetch.
//
// Same doorway pattern as redrawAsk: the card arrives because something happened (another person
// sent a plan), so the desk opens ON a turn rather than on silence. The worksheet is already
// filled from the blueprint by the time this is sent (chatRestore.setup), so the turn's job is
// not to describe the plan — Mentor can see it — but to say WHOSE it is, what they said about it,
// and what the user wants: a read against the tape now, then help sizing it.
//
// WORDED AS THE USER'S TURN, because that is what it becomes. It does NOT tell Mentor what to
// conclude about the plan, and it does not ask Mentor to re-interview it — the plan is settled;
// the open questions are whether it still stands and how big it should be.

/**
 * @param {object} p
 * @param {object} p.blueprint   the shared plan (services/setup.blueprint.js on the server)
 * @param {?string} p.note       the sender's note, if any
 * @param {?number} p.drawnPrice the price when it was sent, if the server had one
 * @returns {?string} the turn to send, or null when there is no plan to talk about
 */
export function sharedAsk({ blueprint, note = null, drawnPrice = null } = {}) {
    if (!blueprint?.asset) return null

    const who   = blueprint.from?.fullname || blueprint.from?.username || 'Someone'
    const asset = String(blueprint.asset).toUpperCase()
    const dir   = blueprint.direction ? ` ${blueprint.direction}` : ''

    const said  = note?.trim() ? ` — their note: "${note.trim()}"` : ''
    const price = Number.isFinite(drawnPrice) && drawnPrice > 0 ? ` It was drawn with ${asset} at ${drawnPrice}.` : ''

    return `${who} shared this ${asset}${dir} plan with me${said}.${price} Read it against the tape now — tell me what has moved since it was drawn and whether the levels still stand — and then help me size it for my account.`
}
