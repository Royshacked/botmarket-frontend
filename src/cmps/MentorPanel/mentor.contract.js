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

import { KIND } from '../../services/pipeline/artifact.js'

export const mentorContract = {
    agent:   'mentor',
    accepts: [KIND.CANDIDATE_LIST],
    emits:   [],
    // Never remounted on a hand-off: this desk holds the user's own thinking about the trade, and a
    // fresh panel would throw away the very thing it exists to work on.
    mount:   'continues',
    // `deliver: 'artifact'` for Kairos's reason, arrived at later: opening on a candidate is more
    // than a sentence now. Argus recommends a LENS with the name, Mentor authors `trade_mode`, and a
    // recommendation that survives only as prose in an opening line cannot be told apart from the
    // user having asked for it. The envelope arrives whole so the lens reaches the prompt as data
    // and the panel can say whose idea it was.
    deliver: 'artifact',
    // No `brief`. The opening turn is composed in MentorPanel, where the seed it must agree with
    // is also built — two openers for one hand-off is one of them going stale.
}
