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

/**
 * Which desks are CLOSED because another desk is holding an agent they need.
 *
 * A desk panel is a singleton, so an agent can only be in one context at a time. Leave a portfolio
 * build parked at Argus and the standalone "Create a list" route would enter the same panel and
 * clobber it — so that door closes while the build holds Argus, and says why.
 *
 * Reads the thread's `pipeline` (the desk it belongs to), which is exactly why that field had to
 * exist: `agent` alone cannot tell an unfinished build parked at its screen step from a standalone
 * scan, and those two want opposite treatment — one door to resume, one to close.
 *
 * Symmetric by construction. Whoever got there first holds it: an unfinished standalone scan closes
 * the portfolio desk just as firmly as a build closes the scan desk. No precedence rule, because any
 * ordering would be arbitrary and would surprise whoever lost.
 *
 * A thread with no pipeline (a chat opened straight at a desk, off any chain) blocks nothing: it has
 * no run to protect, and resuming it is what opening that desk already does.
 *
 * @returns {Map<string, {thread:object, agent:string}>} desk key → what holds it (absent = open)
 */
export function blockedDesks(threads, desks) {
    const blocked = new Map()
    const list = Array.isArray(threads) ? threads : []

    for (const desk of (desks ?? [])) {
        const agents = deskAgents(desk)
        // Held by a thread belonging to a DIFFERENT desk. Its own unfinished thread is the one it
        // would resume, so that never blocks it.
        const holder = list.find(t => t?.pipeline && t.pipeline !== desk?.key && agents.includes(t.agent))
        if (holder) blocked.set(desk.key, { thread: holder, agent: holder.agent })
    }
    return blocked
}
