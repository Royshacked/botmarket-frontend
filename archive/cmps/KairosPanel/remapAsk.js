// The opening turn a call-expiry card hands Kairos. Pure — the twin of Mentor's redrawAsk, and
// deliberately its own copy rather than a shared "invalidation ask" with a kind switch.
//
// SHARE THE PIPE, NOT THE JUDGMENT. What is shared is the mechanism: read the reason off the
// resolved doc, trim it to a sentence (firstSentence), hand it over as the user's own turn through
// the restore's `ask`. What is NOT shared is what to say — a call is a THESIS with a horizon, and
// its two endings are "this is expiring" and "this has expired", which are different asks from a
// setup's "the map drifted" and "the premise broke". One builder with a kind switch would be four
// sentences pretending to be one.

import { firstSentence } from '../../../src/cmps/TradeIdeas/monitorJournal.utils.js'

/**
 * @param {?object} call the call document, freshly resolved by id
 * @param {?string} kind the card's own axis: 'expired' (terminal) or 'edit' (expiring). Read from
 *   the card because it is the CARD's parameter, not the call's status — a stale thesis is the
 *   invalidation axis and the call itself stays 'looking' either way (see buildCallExpiry).
 * @returns {?string} the turn to send, or null when there is nothing to report — the doorway reads
 *   null as "fall back to the pencil's silence" rather than opening on a sentence about nothing.
 */
export function remapAsk(call, kind = null) {
    if (!call?.id) return null

    const asset = call.asset ?? 'this call'
    const why = firstSentence(call.invalidation_reason)
        ?? firstSentence(call.monitor_state?.last_assessment?.edit_proposal?.why)
        ?? firstSentence(call.monitor_state?.last_assessment?.read)

    // A thesis that has RUN OUT is a different question from one that is running out. The first asks
    // whether there is still a trade at all; the second asks for the re-map while there is still
    // time to take it.
    const expired = kind === 'expired'
    const what = expired
        ? `Hermes says the thesis on my ${asset} call has expired`
        : `Hermes says the thesis on my ${asset} call is going stale`
    const ask = expired
        ? 'Is there still a trade here? Re-map it if the read holds, and say so plainly if it does not.'
        : 'Look at it again and re-map the levels — tell me what you would change and why.'

    return `${what}${why ? ` — ${why}` : ''}. ${ask}`
}
