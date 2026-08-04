// ── Mentor's pipeline contract ─────────────────────────────────────────────────
// The assist desk is one step today: the user brings a ticker and their own plan, and Mentor
// pressure-tests it. Declaring a contract for a desk with no hops looks like ceremony until you
// want a second step — at which point the whole point is that NOTHING here changes. Argus already
// emits `candidate_list` and this file already accepts it, so putting a scan in front of Mentor is
// an edit to the pipeline's steps and nothing else. (Proved in deskSteps.test.jsx; not done,
// because Mentor deliberately never screens — the ticker comes from the user.)
//
// Emits nothing that hops. A finished setup goes to Talos, and a monitor is not a desk — it is
// where the pipeline ends, not somewhere the work is handed on to. Same shape as Kairos, whose
// call goes to Hermes and whose only emitted artifact is the request for a name.

import { KIND, firstItem } from '../../services/pipeline/artifact.js'

export const mentorContract = {
    agent:   'mentor',
    accepts: [KIND.CANDIDATE_LIST],
    emits:   [],
    // Never remounted on a hand-off: this desk holds the user's own thinking about the trade, and a
    // fresh panel would throw away the very thing it exists to work on.
    mount:   'continues',
    deliver: 'seed',

    /**
     * A name arrived — off a scan, a list, or Axl having resolved it from the conversation.
     *
     * Worded as the USER's opening move, because that is what a seed is: the hand-off says it for
     * them (see useSeedTurn). And deliberately not "my own trade" when a thesis rides along — a name
     * that came off a screen is not one the user brought, and opening as though it were invites
     * Mentor to pressure-test a plan nobody has made yet.
     */
    brief(artifact) {
        const cand = firstItem(artifact)
        if (!cand?.ticker) return null
        const read = cand.thesis || cand.analysis
        return {
            message: read
                ? `I want to work on a ${cand.ticker} trade — the read on it is: ${read}. Let's build the setup together.`
                : `I want to work on my own ${cand.ticker} trade.`,
        }
    },
}
