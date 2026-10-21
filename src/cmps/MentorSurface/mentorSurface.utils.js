// The rules Mentor's surface draws by — pure, so each is tested on its own (unified-chat plan phase 8b). Moved from
// MentorPanel with their reasons; the panel is gone, the rules are the same.

export const ACCOUNT_GAP = 'trading account'

/**
 * The Generate verdict as the user can act on it NOW.
 *
 * The server judged the account gap at its last turn; the surface knows it now. Marking an account after the verdict
 * used to leave "trading account" in the list and Generate dark until the user sent Mentor another message (driven
 * live, 2026-10-01). The server's gate reads the account only as "is one marked", so swapping that one entry for the
 * live answer is exact, and `ready` is the gate's own rule: nothing missing, nothing contradictory.
 *
 * Both refusals survive — something ABSENT (missing) and something INCOHERENT (problems: a validity floor drawn below
 * its own stop) — and the account gap is listed once, however many sides noticed it. No verdict yet is never ready.
 *
 * @param {object|null} readiness  the server's verdict ({ ready, missing, problems, warnings })
 * @param {number} accountCount    accounts marked right now
 * @returns {{ ready: boolean, blockers: { kind: 'missing'|'problem', text: string }[], warnings: string[] }}
 */
export function liveReadiness(readiness, accountCount) {
    const missing = [
        ...(readiness?.missing ?? []).filter(m => m !== ACCOUNT_GAP),
        ...(accountCount === 0 ? [ACCOUNT_GAP] : []),
    ]
    const problems = readiness?.problems ?? []
    // The account can clear only what the ACCOUNT was blocking.
    const accountWasTheGap = (readiness?.missing ?? []).includes(ACCOUNT_GAP)
    const ready = !!readiness && missing.length === 0 && problems.length === 0 && (readiness.ready === true || accountWasTheGap)
    return {
        ready,
        blockers: [...missing.map(text => ({ kind: 'missing', text })), ...problems.map(text => ({ kind: 'problem', text }))],
        warnings: readiness?.warnings ?? [],
    }
}

// ── What a press SAYS, and what it settles ───────────────────────────────────
//
// A press says what it means in an OP — deterministic, applied server-side before the model reads the turn — AND in
// words, so the transcript shows the user's agreement instead of reading like Mentor talking to itself.

/**
 * Picking a candidate SETTLES THE OPENING, because that is what the choice was: `<setups>` forks above the opening
 * stage — rival plans that differ in lens, sometimes direction or horizon — so choosing one answers the opening's
 * question by definition. Only what the candidate carries is settled.
 */
export function candidatePress(candidate) {
    const s = candidate?.setup ?? {}
    const settle = [
        ...(s.direction ? ['direction'] : []),
        ...(s.type ? ['horizon'] : []),
        ...(s.trade_mode ? ['lens'] : []),
    ]
    return {
        ops:  settle.length ? [{ claim: { direction: s.direction, horizon: s.type, lens: s.trade_mode }, settle }] : [],
        text: `Let's go with "${candidate?.label ?? 'that one'}".`,
    }
}

export function stagePress(fields, waiver = false) {
    return {
        ops:  [{ settle: fields, ...(waiver ? { waiver: true } : {}) }],
        text: waiver ? 'Yes — and go all the way to sizing.' : 'Yes, those are right.',
    }
}

/** SEVERAL trades may survive the spans gate — the press carries every id ticked, not the one clicked. */
export function spansPress(chosen) {
    if (!chosen?.length) return null
    return {
        ops:  [{ claim: { spans: chosen.map(c => c.id) }, settle: ['spans'] }],
        text: chosen.length === 1
            ? `Let's build "${chosen[0].label}" — ${chosen[0].from} to ${chosen[0].to}.`
            : `Build these ${chosen.length}: ${chosen.map(c => `"${c.label}"`).join(', ')}.`,
    }
}

/** More than one way in is a real answer — under `alternatives` the first trigger to fire takes the position. */
export function entriesPress(chosen) {
    if (!chosen?.length) return null
    return {
        ops:  [{ claim: { entries: chosen.map(c => `${c.trade}:${c.option.id}`) }, settle: ['entries'] }],
        text: chosen.length === 1
            ? `Take "${chosen[0].option.label}" — ${chosen[0].option.trigger}.`
            : `Take these ${chosen.length}: ${chosen.map(c => `"${c.option.label}"`).join(', ')}.`,
    }
}

/**
 * Handing the choice back is a PRESS like any other — `delegate` — and the server settles the gate on Mentor's
 * recommendation before the model reads the turn. Sent as words alone it settled nothing (Marce, PACB, 2026-10-01).
 */
export function delegatePress(gate) {
    return gate === 'spans'
        ? { ops: [{ delegate: 'spans' }], text: 'You choose which of those are worth building, and say why.' }
        : { ops: [{ delegate: 'entries' }], text: 'You pick the way in for each, and say why that one.' }
}

export const revivePress = (rejected) => ({ ops: [], text: `Take another look at "${rejected?.label}" — I'd like that one on the table.` })

/**
 * A name Argus handed over, as the user's opening turn — a name to WORK ON, never "my own trade": a name off a screen
 * is not one the user brought. Uppercased once, so the sentence and the seed name the same thing; a thesis's own
 * trailing stop is trimmed so the template does not add a second.
 * @returns {{ text: string, seed: object }|null}
 */
export function handoffTurn(candidate) {
    if (!candidate?.ticker) return null
    const ticker = String(candidate.ticker).toUpperCase()
    const read = String(candidate.thesis || candidate.analysis || '').trim().replace(/\.+$/, '')
    return {
        text: read
            ? `I want to work on a ${ticker} trade — the read on it is: ${read}. Let's build the setup together.`
            : `I want to work on a ${ticker} trade. Let's build the setup together.`,
        seed: {
            ticker,
            direction:        candidate.direction ?? null,
            thesis:           candidate.thesis ?? null,
            analysis:         candidate.analysis ?? null,
            recommended_mode: candidate.recommended_mode ?? null,
            // A name off the HOTLIST rides as a reference to its board and column; the server reads the
            // board's facts back itself (backend hotlist.service hotlistSeed) — they are never sent from here.
            ...(candidate.hotlist ? { hotlist: { board: candidate.hotlist.board, column: candidate.hotlist.column } } : {}),
        },
    }
}

/** The names in a multi-name build, the one being worked on included exactly once. */
export function batchNames(draft, drafts = {}) {
    return Object.keys({ ...(drafts ?? {}), ...(draft?.asset ? { [draft.asset]: 1 } : {}) })
}

/**
 * What Mentor's table holds that a fresh plan would put aside, said for the question — or null when there is nothing.
 * ANY work counts (phase 8b CR): a generated setup waiting on Arm has no draft, an edit and the other plans neither.
 */
export function mentorHolding(state) {
    if (!state) return null
    if (state.generated) return `${state.generated.asset ?? 'a setup'} (saved, waiting on Arm)`
    if (state.draft) return state.draft.asset ?? 'a setup'
    if (state.editing) return 'an edit of a saved setup'
    const others = Object.keys(state.drafts ?? {})
    return others.length ? others.join(', ') : null
}
