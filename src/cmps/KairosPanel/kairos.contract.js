// ── Kairos's pipeline contract ─────────────────────────────────────────────────
// Kairos takes a name and builds the call around it; when it has no name it asks for one.
//
// Unlike Argus it does NOT open on a sentence the conveyor sends. Receiving a candidate here also
// pre-fills the lens chip, remembers the scan's trading window for the whole build, and hands the
// model a structured seed block — none of which is a message. So the panel takes the artifact
// itself and does the briefing inside, where those three things already live. Splitting it into a
// brief() here plus side-effects there would be one hand-off written in two files.
//
// `deliver: 'artifact'` is that difference, declared rather than special-cased.

import { KIND } from '../../services/pipeline/artifact.js'

export const kairosContract = {
    agent:   'kairos',
    accepts: [KIND.CANDIDATE_LIST],
    emits:   [KIND.SCAN_REQUEST],
    // Never remounted on a hand-off: Kairos is holding the bias and horizon the request was built
    // from, and a fresh panel would throw away the conversation the returning ticker is FOR.
    mount:   'continues',
    deliver: 'artifact',
}
