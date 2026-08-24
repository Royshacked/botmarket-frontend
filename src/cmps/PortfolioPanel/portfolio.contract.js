// ── Atlas's pipeline contract ──────────────────────────────────────────────────
// The desk that stands at BOTH ends of its own pipeline: it sets the mandate the sleeves are
// screened against, and it allocates the book once the research is in. Which is why its steps
// declare `awaits` — "route to Atlas" is not an answer when there are two of it, and a coverage set
// arriving at the Mandate step would hand a finished book to the desk that was meant to frame it.
//
// This file completes the vocabulary: `mandate` had no declared emitter and `coverage_set` had no
// declared acceptor, so both ends of Atlas were the two loose threads the hop tests carried as
// named exceptions.

import { KIND, resolveArtifact } from '../../services/pipeline/artifact.js'

/**
 * A finished research run → the words Atlas opens the allocation on.
 *
 * This brief used to be composed in MainPage, which made the SENDER write the receiver's opening
 * turn — the exact coupling the pipeline exists to remove, and the last place it survived.
 *
 * What it has to carry is not the good news. Atlas reads coverage itself (`get_coverage`), so the
 * covered names are a nudge; what it cannot discover on its own is what did NOT come back. A sleeve
 * that screened empty and a name whose draft the user declined both look identical from here — a
 * shorter coverage list with no reason attached — and a book built without being told is quietly
 * missing a bucket its own architecture called for. So the empties are the payload.
 */
function briefCoverage(artifact) {
    const { items } = resolveArtifact(artifact)
    const { unfilled = [], declined = [] } = artifact?.context ?? {}

    // Name each ticker with the sleeve it was researched FOR, so Atlas can place it without
    // inferring the mapping. '' groups the one-off lists that have no sleeve label to give.
    const group = (rows) => {
        const by = new Map()
        for (const r of rows) {
            const k = r.sector ?? ''
            if (!by.has(k)) by.set(k, [])
            by.get(k).push(r.ticker)
        }
        return [...by].map(([sector, ts]) => `${ts.join(', ')}${sector ? ` (${sector})` : ''}`).join('; ')
    }

    const lines = [items.length
        ? `Coverage is in for ${group(items)}. Build from it.`
        : 'No coverage was initiated on this run.']
    if (unfilled.length) lines.push(`These sleeves came back with NOTHING screened: ${unfilled.join(', ')}.`)
    if (declined.length) lines.push(`Screened but NOT researched (no coverage initiated): ${group(declined)}.`)
    if (unfilled.length || declined.length) {
        lines.push('Do not fill those buckets from another sleeve\'s names — say what is unfilled and give me the choice: widen the sleeve and re-screen, drop it, or reallocate its weight across the rest.')
    }
    return { message: lines.join(' ') }
}

export const portfolioContract = {
    agent:   'portfolio',
    accepts: [KIND.COVERAGE_SET],
    emits:   [KIND.MANDATE],
    // Never remounted: the mandate conversation is what the allocation has to be consistent with,
    // and a fresh panel would drop the frame the whole run was built against.
    mount:   'continues',
    deliver: 'seed',

    brief(artifact) {
        return artifact?.kind === KIND.COVERAGE_SET ? briefCoverage(artifact) : null
    },
}
