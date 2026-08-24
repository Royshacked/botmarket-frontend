// ── Prometheus's pipeline contract ─────────────────────────────────────────────
// The research desk is one step today — the user names a company and Prometheus builds a coverage
// thesis — but it is the desk with a hop already waiting for it: Argus's investing list routes here
// (MainPage.handleResearchList), still by hand. This file is what that hop gets migrated onto.
//
// `deliver: 'artifact'` for the same reason as Kairos, only more so. A candidate list reaching this
// desk is a QUEUE, not a name: the panel researches one ticker at a time, tells the model which
// sleeve the name is FOR, names what follows it so it can pace itself, and carries the names that
// did NOT make the top slice so "do KLAC as well" is a thing the user can just ask for. None of
// that is a sentence the conveyor could compose — it is the panel's own run, and it already exists.
//
// So the fan-out the pipeline calls `each` lives INSIDE this desk today. Phase 3 decides whether it
// stays here (one desk pacing its own queue) or moves up to the conveyor. Worth knowing before that
// argument starts: the pacing is woven into the prompt text, not just the iteration.

import { KIND } from '../../services/pipeline/artifact.js'

export const analystContract = {
    agent:   'analyst',
    accepts: [KIND.CANDIDATE_LIST],
    emits:   [KIND.COVERAGE_SET],
    // Continues rather than remounts: a research run spans several names and the user's questions
    // about the first one are still worth reading when the third arrives.
    mount:   'continues',
    deliver: 'artifact',
}
