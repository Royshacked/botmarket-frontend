// ── Walking a desk's pipeline ──────────────────────────────────────────────────
// Where the user is standing in a pipeline (DESKS[].steps), and where "back" goes from there.
//
// Lives outside MainPage because two callers need the SAME answer and must never disagree: the
// breadcrumb highlights the current step, the back button walks off it. Two independent readings of
// "which step is this?" would eventually light one step while sending the user somewhere else.

// Which step the user is on. Derived from the tab rather than stamped by each hand-off, so a new
// hand-off can't forget to update it — but an agent can appear TWICE in one pipeline (Atlas: the
// mandate, then the allocation), which makes a plain tab match ambiguous. Resolve by proximity to
// the step they were on: arriving at Atlas from Research means Allocate, not a walk back to Mandate.
//
// Returns `prev` unchanged when the tab belongs to no step — the order ticket and the Idea chat sit
// outside every pipeline, and a visit there shouldn't lose the user's place in one.
export function resolveStepIndex(steps = [], tab, prev = 0) {
    const matches = []
    steps.forEach((s, i) => { if (s.tab === tab) matches.push(i) })
    if (!matches.length) return prev
    return matches.reduce((best, i) => (Math.abs(i - prev) < Math.abs(best - prev) ? i : best))
}

// The step to go back to, or null when there's nowhere to go. Steps with no `tab` are background
// monitors (Hermes, Themis) — never somewhere the user stands, so never somewhere to send them.
export function previousStep(steps = [], step = 0) {
    if (step <= 0) return null
    const prev = steps[step - 1]
    return prev?.tab ? prev : null
}
