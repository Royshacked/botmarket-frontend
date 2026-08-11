/**
 * Unfinished work, per desk — the badge on a desk route. Pure, no I/O.
 *
 * A conversation the user walked away from was always saved and always resumable (a DRAFT thread).
 * What was missing is that nothing outside the desk ever said so, so a half-finished portfolio build
 * quietly became invisible. This is the mapping from "the user has 2 unfinished threads" to "which
 * routes should say something".
 *
 * Two different questions, deliberately answered from two different fields:
 *
 *   the MARKER (deskWork) reads `pipeline` — the ONE desk the user actually left. They walked out of
 *   one door, so exactly one route says so.
 *
 *   the LOCK (blockedDesks) reads `agent` — every desk that NEEDS the agent now busy elsewhere. A
 *   panel is a singleton, so a build parked at Argus closes every other door to Argus.
 *
 * Keying both off `agent` is what made a single parked build light up three desks: the badge was
 * answering the lock's question. The user thinks in desks — "Produce a watchlist" is not where they
 * left off, even though Argus is where the conversation sits.
 */

/** Every agent tab a desk covers. A step with `tab: null` is a real step with no chat behind it. */
export function deskAgents(desk) {
    const fromSteps = (desk?.steps ?? []).map(s => s?.tab).filter(Boolean)
    // entryTab included for a desk that declares no steps at all.
    return [...new Set([...(desk?.entryTab ? [desk.entryTab] : []), ...fromSteps])]
}

/**
 * WHICH DESK a thread was left at — the one desk its marker belongs on.
 *
 * `pipeline` answers it outright, and is the only answer that can be right: the user left ONE desk,
 * and marking every desk that happens to share the agent says they left three. A build parked at
 * Argus is unfinished work at the desk it belongs to, not at "Produce a watchlist".
 *
 * A thread with NO pipeline was opened off any chain (a tab clicked directly, a thread reopened from
 * history). It still belongs somewhere, and the honest home is the desk that is only that agent — of
 * the desks entering at it, the shortest chain. Argus enters both the trade desk and the scan desk;
 * a standalone Argus chat is the SCAN desk, because the trade desk is a chain the user never started.
 *
 * @returns {string|null} desk key, or null when no desk claims it
 */
export function deskOfThread(thread, desks) {
    const agent = thread?.agent
    if (!agent) return null
    const list = Array.isArray(desks) ? desks : []
    if (thread.pipeline) {
        // Named its desk. Honour it even if that desk is gone from DESKS — a marker on a desk that no
        // longer exists renders nowhere, which beats moving the thread to a desk it never ran on.
        return thread.pipeline
    }
    const homes = list.filter(d => d?.entryTab === agent)
    if (!homes.length) return null
    return homes.reduce((a, b) => ((b?.steps?.length ?? 0) < (a?.steps?.length ?? 0) ? b : a)).key
}

/**
 * What this desk's badge should say.
 *
 * `yourTurn` outranks a plain count in the UI, so it is reported separately rather than folded in: a
 * desk with two running threads and one awaiting an answer is "your turn", because that is the only
 * one the user can act on.
 *
 * `desks` is needed to place a thread that named no pipeline (see deskOfThread). Omitted, only threads
 * that named this desk count — never a wrong desk, just a quieter one.
 *
 * @returns {{ count:number, yourTurn:boolean, threads:object[] }} count 0 → render nothing
 */
export function deskWork(threads, desk, desks = null) {
    if (!desk?.key) return { count: 0, yourTurn: false, threads: [] }
    const mine = (Array.isArray(threads) ? threads : [])
        .filter(t => deskOfThread(t, desks ?? [desk]) === desk.key)
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
