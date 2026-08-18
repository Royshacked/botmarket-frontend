import { tradeIdeasService } from './tradeIdeas/tradeIdeas.service.remote'
import { mentorService }     from './mentor/mentor.service.remote'
import { analystService }    from './analyst/analyst.service.remote'
import { scannerService }    from './scanner/scanner.service.remote'
import { portfolioService }  from './portfolio/portfolio.service.remote'

// ONE way to open something the user already has.
//
// Three doorways reach a desk's edit/review mode — a social-chat card, a list pencil, and an Axl
// hand-off — and they used to disagree about where the document comes from. Each resolved the id
// against whatever list that surface happened to hold, which made "can I open this?" a question
// about client state rather than about the entity. A card that arrived before its list had loaded
// opened nothing; a list twenty seconds stale opened the wrong version.
//
// So every doorway now reads the same way the rest of the app does: React → service → HTTP →
// router → controller → service → Mongo, and back. No list lookups, no refs, no re-reading a
// stale copy when the fetch is the cheaper and more correct answer.
//
// SHARE THE PIPE, NOT THE JUDGMENT. What lives here is the fetch and the failure posture. What
// each desk DOES with the document — which panel state it seeds, which chart it opens, whether it
// re-plans or reviews — stays in that desk's own opener.
//
// Authorization comes with the pipe rather than around it. Resolving against the client's list
// used to double as the ownership check ("an id that isn't in your list opens nothing"); the
// server's owner-scoped get is the same guarantee made properly, so a borrowed or hallucinated id
// answers 404 instead of relying on it being absent from a list.

// kind → the kind's own getter. Every one of these is already the kind's public read; nothing new
// is introduced here, they are simply named in one place so the doorways don't each pick their own.
const GETTERS = {
    idea:      (id) => tradeIdeasService.getIdea(id),
    setup:     (id) => mentorService.getSetup(id),
    coverage:  (id) => analystService.getCoverage(id),
    scan:      (id) => scannerService.getScan(id),
    // A book is not a document — it exists as the items carrying its id — so its "read one" is the
    // holdings. Returns an ARRAY, and an empty one is a real answer (an emptied or adopted-but-
    // uncommitted book), not a failure. Only a throw means "we could not look".
    portfolio: (id) => portfolioService.getItems(id),
}

/**
 * Read one entity, fresh, by id.
 *
 * @param {'idea'|'setup'|'coverage'|'scan'|'portfolio'} kind
 * @param {string} id
 * @returns {Promise<object|object[]|null>} the document (an array for `portfolio`), or null when
 *   it could not be read — missing, not the user's, or the request failed. The caller decides what
 *   that means; what it must NOT do is carry on with a stale or empty stand-in.
 */
export async function resolveEntity(kind, id) {
    const get = GETTERS[kind]
    if (!get || !id) return null
    try {
        return await get(id)
    } catch (err) {
        console.error('[entityResolve]', kind, id, err)
        return null
    }
}
