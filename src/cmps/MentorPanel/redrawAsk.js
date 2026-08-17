// The opening turn a re-draw card hands Mentor. Pure — no React, no fetch.
//
// THE DOORWAY PATTERN, not the pencil's. Two shapes exist for reopening an entity at its desk:
// the PENCIL restores the build conversation and waits, because the user chose to edit and the app
// has nothing to say; the CARD arrives because a monitor raised its hand, so the app has plenty to
// say and must say it. Prometheus (AnalystPanel's editCoverage) and Pythia (StrategyPanel's
// reviewRequest) already open on a turn. This is Mentor's.
//
// READ OFF THE SETUP, NEVER OFF THE CARD. The card is a message from whenever Talos looked; a user
// who opens it the next morning must arrive at the reason that stands NOW. Talos writes the reason
// onto the document (`invalidation_reason`) in the same patch that fires the card, so the live
// source is already there and no new payload plumbing is needed — and a card whose setup has since
// been re-drawn opens on the current plan instead of a frozen complaint.
//
// WORDED AS THE USER'S TURN, because that is what it becomes (useSeedTurn: "the words are the
// user's, the hand-off just says them for them"). It reports what happened and asks for a look; it
// does NOT tell Mentor what to conclude. Talos's `edit_proposal.changes` is deliberately not
// rendered into the ask — handing the desk a pre-decided re-map would make it a formatter for the
// monitor's opinion, and re-drawing the levels is the one judgment this desk owns.

// Only the FIRST sentence of Talos's reason goes in — the rest is in the journal, and a paragraph
// pasted into the user's own turn stops reading as something they would have said. Shared with
// Kairos's remapAsk, because trimming a monitor's prose is the same mechanism at both desks.
import { firstSentence } from '../TradeIdeas/monitorJournal.utils.js'

/**
 * @param {?object} setup the setup document, freshly resolved by id
 * @returns {?string} the turn to send, or null when there is nothing to report — in which case the
 *                    doorway falls back to the pencil's behaviour rather than inventing a reason.
 */
export function redrawAsk(setup) {
    if (!setup?.id) return null

    const asset = setup.asset ?? 'this setup'
    // Both of Talos's paths write a finished sentence here; the assessment behind it is the fallback
    // for a document written before the reason was stamped.
    const why = firstSentence(setup.invalidation_reason)
        ?? firstSentence(setup.monitor_state?.last_assessment?.edit_proposal?.why)
        ?? firstSentence(setup.monitor_state?.last_assessment?.read)

    // TWO DIFFERENT THINGS TO HEAR, and one sentence for both would be wrong for one of them.
    // `invalidation_edge: 'time'` is the stamp for Talos's own "the map has drifted" verdict; every
    // other edge is a price that closed past where the plan works. The first is a plan that has gone
    // stale around a trade still worth having; the second is a premise that broke.
    const drifted = setup.invalidation_edge === 'time'
    const what = drifted
        ? `Talos says the map on my ${asset} setup has drifted`
        : `Talos says my ${asset} setup is no longer valid`

    const ask = drifted
        ? 'Look at where structure sits now and re-draw the levels — tell me what you would change and why.'
        : 'Look at it again and tell me whether there is still a trade here — re-draw it if there is, and say so plainly if there is not.'

    return `${what}${why ? ` — ${why}` : ''}. ${ask}`
}
