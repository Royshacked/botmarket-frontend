/**
 * Unfinished work, per desk — the badge on a desk route. Pure, no I/O.
 *
 * A conversation the user walked away from was always saved and always resumable (a DRAFT thread).
 * What was missing is that nothing outside the desk ever said so, so a half-finished portfolio build
 * quietly became invisible. This is the mapping from "the user has 2 unfinished threads" to "which
 * routes should say something".
 *
 * A desk claims every agent in its STEPS, not just the one it enters at. That is the whole reason a
 * badge is needed on the desk rather than on the agent: leave a portfolio build parked at Argus and
 * the thing left unfinished is the BUILD — the user thinks in desks, and "Create a list" is not where
 * they left off even though Argus is where the conversation sits.
 */

/** Every agent tab a desk covers. A step with `tab: null` is a real step with no chat behind it. */
export function deskAgents(desk) {
    const fromSteps = (desk?.steps ?? []).map(s => s?.tab).filter(Boolean)
    // entryTab included for a desk that declares no steps at all.
    return [...new Set([...(desk?.entryTab ? [desk.entryTab] : []), ...fromSteps])]
}

/**
 * What this desk's badge should say.
 *
 * `yourTurn` outranks a plain count in the UI, so it is reported separately rather than folded in: a
 * desk with two running threads and one awaiting an answer is "your turn", because that is the only
 * one the user can act on.
 *
 * @returns {{ count:number, yourTurn:boolean, threads:object[] }} count 0 → render nothing
 */
export function deskWork(threads, desk) {
    const agents = new Set(deskAgents(desk))
    const mine   = (Array.isArray(threads) ? threads : []).filter(t => agents.has(t?.agent))
    return {
        count:    mine.length,
        yourTurn: mine.some(t => t?.yourTurn === true),
        threads:  mine,
    }
}

// ─── NOT HERE YET: closing the other doors to a busy agent ──────────────────────
//
// The lock (a portfolio build parked at Argus should close the standalone "Create a list" route, and
// say why) cannot be computed from a thread as it is stored today. A thread records its AGENT, not
// which desk the user was standing on — so an unfinished Argus thread is indistinguishable from a
// portfolio build parked at its screen step, and those two need opposite treatment: one is the door to
// resume, the other is the door to close.
//
// It needs one new field on the thread — the pipeline it belongs to — written where the draft is
// saved. Deliberately not stubbed here: a function that reads a field nothing writes looks like
// working code and silently returns "nothing is blocked" forever.
