// ── The authoring vocabulary, in the user's words ──────────────────────────────
//
// The backend files three things on every setup that nothing in the UI used to show: WHICH of eight
// ways in a scenario is (`archetype`), what each stop and target price was measured FROM (`anchor`),
// and the ways in that were rejected (`alternatives`). See botmarket-backend
// services/setup.taxonomy.js and docs/desks/mentor-talos.md §The paths not taken.
//
// WHY THE UI CARES. A number on its own invites agreement or a shrug. "Stop 234.8 · structure — the
// last swing that would have to break" invites the only useful reply, which is a different member of
// the same set: *why not the order block's far edge?* That is the whole point of rendering these —
// they turn a level into something the user can argue with instead of accept.
//
// ONE MAP, THREE CONSUMERS: the live worksheet (MentorPanel), the saved plan (SetupPlan) and the
// order confirm. A second copy of these words in any of them is a copy that drifts into describing a
// different vocabulary than the server files.
//
// UNKNOWN IDS DEGRADE, THEY DO NOT BREAK. The backend can grow a ninth archetype before this file
// hears about it, and the honest fallback is the id with its underscores opened out ("gap fill") and
// no tooltip — readable, obviously un-annotated, and never a crash or a blank where a word should be.
// That is why there is no exhaustiveness test here: it would assert a coupling across two repos that
// this fallback exists precisely to survive.

/** A taxonomy id as a trader says it out loud. `sweep_reclaim` → "sweep reclaim". */
export const words = (id) => String(id ?? '').replace(/_/g, ' ')

// What each way in IS — one clause, phrased for a long and mirrored for a short.
const ARCHETYPE_HINT = {
    pullback:              'A retrace into a level that held before. The fill sits below price on a long.',
    breakout:              'Through a pre-defined trigger, at or above price.',
    retest:                'The return to a level already broken — the second chance.',
    sweep_reclaim:         'A push through the level that closes back inside it.',
    fade:                  'Against an extended move, into a level expected to reject.',
    gap_fill:              'The fill of a gap or an unfilled imbalance.',
    momentum_continuation: 'No level — strength inside an established trend.',
    event_gated:           'Contingent on a dated catalyst landing, with price secondary.',
}

// `structure` and `session` mean DIFFERENT things on a stop and on a target, which is why these are
// two maps and why the tone has to be passed in. One merged map would describe the wrong level half
// the time, and it would read as correct.
const STOP_ANCHOR_HINT = {
    structure:  'The last swing that would have to break.',
    level:      'The far side of the level being traded — an order block edge, a shelf.',
    session:    'A prior-session line: PDL/PDH, the week’s low, the open.',
    volatility: 'An ATR multiple from the entry — the anchor of last resort, not of first choice.',
    indicator:  'The moving average or VWAP the thesis lives above.',
}

const TARGET_ANCHOR_HINT = {
    liquidity:     'The next pool — resting stops, an untested high.',
    structure:     'The next swing or supply shelf.',
    measured_move: 'The pattern’s own projection.',
    session:       'A prior-session line, or a round number the tape respects.',
    r_multiple:    'A fixed multiple of the risk, with no level under it — the one to question first.',
}

/**
 * The tooltip for a way in, or null when this build has not heard of it.
 * Null is meaningful: the label still renders, just without an explanation it cannot give honestly.
 */
export const archetypeHint = (id) => ARCHETYPE_HINT[id] ?? null

/**
 * The tooltip for a leg's anchor. `tone` is 'stop' or 'tp' — the same tones SetupPlan's legs use.
 * An entry leg has no anchor at all (what an entry is anchored to is the scenario's archetype), so
 * passing one here is a question with no answer and returns null.
 */
export const anchorHint = (id, tone) => (tone === 'stop' ? STOP_ANCHOR_HINT : tone === 'tp' ? TARGET_ANCHOR_HINT : {})[id] ?? null

/** What the away edge does when price leaves on the favourable side. `null` is "nobody answered". */
export const AWAY_COPY = {
    revise: 'ping me to re-draw it',
    pass:   'let it go',
}
export const awayLabel = (onAway) => AWAY_COPY[onAway] ?? null

/** What a challenge pass came back with, and what it means for the plan. */
export const VERDICT_COPY = {
    stands:    { label: 'stands',      hint: 'The opposite case off the same numbers was weak, so this read is coming from the chart.' },
    two_sided: { label: 'two-sided',   hint: 'The chart supports both directions about as well. This needs the trigger that tells them apart — or it is a coin flip with a spread.' },
    reversed:  { label: 'reversed',    hint: 'The numbers favoured the other side. The direction was re-opened, so nothing below it survived unchanged.' },
}
export const verdictCopy = (verdict) => VERDICT_COPY[verdict] ?? null
