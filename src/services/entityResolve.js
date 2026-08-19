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

// ─── Opening by a HANDLE, not just an id ──────────────────────────────────────
//
// An Axl hand-off names an item the way a person does — "the NVDA setup", "my Growth book" — so the
// ref arriving at a doorway is an id OR a name. resolveEntity answers ids; this answers either.
//
// It lived inside MainPage's `openForEdit`, in a 3,000-line component with no test of its own,
// which meant the one genuinely subtle rule here — the exactly-one-match test below — was
// unverifiable. The OPENING stays in the component (each desk's opener is a closure over its own
// state); only the finding moved.

/** Which list answers a NAME for a kind, and which field on a row is that name. */
const BY_NAME = {
    setup:     { list: () => mentorService.listSetups(),        handleOf: (s) => s.asset },
    coverage:  { list: () => analystService.listCoverage(),     handleOf: (c) => c.symbol },
    portfolio: { list: () => portfolioService.listPortfolios(), handleOf: (b) => b.name },
    // `scan` is deliberately absent: a scan is a LIST, not a name — there is nothing to match on,
    // so it is id or nothing.
}

/**
 * A doc is only usable to open with when the desk that receives it can act on it.
 *
 * Coverage is the one that needs saying: Prometheus matches on SYMBOL and its opener bails silently
 * without one, so a symbol-less doc is not "resolved" — reporting success there lands the user at
 * the hub with nothing open and no reason given.
 */
const USABLE = {
    coverage: (doc) => !!doc?.symbol,
}

/**
 * Find the entity a doorway named, by id first and then by name. Returns the document, or null when
 * nothing certain was found — and null is always the honest answer rather than a guess, because the
 * caller's fallback (open the desk normally) is strictly better than opening the wrong trade.
 *
 * A NAME IS ANSWERED ONLY WHEN IT MATCHES EXACTLY ONE ROW. On two live NVDA setups a bare ticker is
 * a coin flip, and losing it means editing a different trade than the one meant — so ambiguity
 * resolves to nothing at all.
 *
 * `portfolio` normalises to `{ portfolioId }` on both paths. A book is not a document — it exists as
 * the items carrying its id — so "found" means its items exist, and what the opener needs is the id
 * rather than a row. Returning the same shape from both branches keeps that asymmetry out of the
 * caller.
 *
 * @param {'idea'|'setup'|'coverage'|'scan'|'portfolio'} kind
 * @param {string} ref  an id, or the name a person would use
 * @returns {Promise<object|null>}
 */
export async function resolveForEdit(kind, ref) {
    if (!kind || !ref) return null

    const byId = await resolveEntity(kind, ref)
    if (kind === 'portfolio') {
        if (byId?.length) return { portfolioId: ref }
    } else if (byId && (USABLE[kind]?.(byId) ?? true)) {
        return byId
    }

    const spec = BY_NAME[kind]
    if (!spec) return null

    let rows = []
    try { rows = (await spec.list()) ?? [] }
    catch (err) { console.error('[entityResolve] name lookup', kind, ref, err); return null }

    const handle = String(ref).toUpperCase()
    const named  = rows.filter(r => String(spec.handleOf(r) ?? '').toUpperCase() === handle)
    if (named.length !== 1) return null

    const hit = named[0]
    if (kind === 'portfolio') return { portfolioId: hit.portfolioId }
    return (USABLE[kind]?.(hit) ?? true) ? hit : null
}
