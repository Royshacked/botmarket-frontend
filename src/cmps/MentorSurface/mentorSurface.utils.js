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

/**
 * The plan the CHAT draws as Mentor's trade chart — from the moment a way in has its stop and its target (Roy,
 * 2026-11-05: the user sets the risk limit and the reward to risk looking at the levels), or Generate is lit.
 *
 * Read from Mentor's state on the session, not from his surface, so the chart stays in the conversation when the pane
 * is hidden. Nothing while a turn runs (the plan is about to change),
 * once it is generated (the Arm bar takes over), or while an existing setup is being edited (that one is Update).
 *
 * @param {object|null} mentor        session.agentState.mentor
 * @param {number}      accountCount  accounts marked right now
 * @param {boolean}     turning       a turn is running
 * @returns {object|null} the draft to draw, or null
 */
export function tradeChartSetup(mentor, accountCount, turning) {
    const draft = mentor?.draft ?? null
    if (turning || !draft?.asset || mentor?.generated || mentor?.editing?.kind === 'setup') return null
    return tradeChartReady(mentor, accountCount) || _hasExits(draft) ? draft : null
}

/** Is the chart showing the finished plan, the same verdict as the button, or only the levels so far? */
export function tradeChartReady(mentor, accountCount) {
    return liveReadiness(mentor?.view?.readiness ?? null, accountCount).ready
}

const _priced = (legs) => Array.isArray(legs) && legs.some(l => Number.isFinite(Number(l?.price ?? NaN)))
/** A stop and a target on the same way in. The draft itself counts: it can carry the flat legs instead of scenarios. */
const _hasExits = (draft) => [...(draft.scenarios ?? []), draft].some(s => _priced(s?.stop_legs) && _priced(s?.target_legs))

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
            // A name off the HOTLIST rides as a reference to its board and column; the server reads the
            // board's facts back itself (backend hotlist.service hotlistSeed) — they are never sent from here.
            ...(candidate.hotlist ? { hotlist: { board: candidate.hotlist.board, column: candidate.hotlist.column } } : {}),
            // One off the Hotlist's SWING / LONG TERM lists rides as which list; the server reads the name's coverage —
            // its horizon and target — back itself (backend houseBook bookSeed).
            ...(candidate.book ? { book: { column: candidate.book.column } } : {}),
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
