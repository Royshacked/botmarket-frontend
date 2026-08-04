// ── Moving an artifact along the chain ─────────────────────────────────────────
// The one place that answers "a desk just produced this — who gets it, and how?". Pure: it decides,
// the caller applies. Everything it needs is the pipeline's own steps plus what the agents declared
// (contracts.js), so a reordered pipeline reorders the hops with it and no agent is edited.
//
// See docs/pipeline-service-design.md §3–4.

import { contractFor as _contractFor, accepts, agentsAccepting } from './contracts.js'

/**
 * The step that takes this kind of artifact. FORWARD first, then backward — because a pipeline
 * carries two different things and they travel in opposite directions:
 *
 *   - a RESULT moves on   (Argus's candidate list → Kairos, the next step)
 *   - a REQUEST goes back (Kairos has no name yet → Argus, the step before it)
 *
 * Preferring forward is what keeps a result from falling back into a desk that already ran, and
 * allowing backward is what lets a desk ask upstream for what it is missing without anyone
 * hard-coding the pair. Nearest match in each direction wins, the same proximity rule the crumb
 * already uses to place a step (pipelineNav.resolveStepIndex).
 *
 * Steps with no `tab` are background monitors — they have no agent, so they are never a receiver.
 *
 * @returns {{index: number, step: object}|null}
 */
/**
 * Can this step take that kind? Contract first — the agent has to accept it at all — then the STEP
 * gets to narrow it.
 *
 * `awaits` exists because an agent can stand at two places in one pipeline: Atlas takes the mandate
 * at the start and the coverage at the end, and "route to Atlas" is not an answer when there are two
 * of it. A step that declares `awaits` receives only that kind.
 *
 * And a step that does NOT declare one, whose agent appears more than once, receives nothing. Silence
 * is the safe reading: without a declaration the two steps are indistinguishable, and picking the
 * first would quietly deliver a finished book to the desk that was supposed to frame it. Ambiguity
 * is a missing declaration, not a coin to flip.
 */
function _takes(steps, step, kind, contractFor, duplicated) {
    if (!step?.tab) return false                                        // a background monitor
    if (!contractFor(step.tab)?.accepts?.includes(kind)) return false
    if (step.awaits) return step.awaits === kind
    return !duplicated.has(step.tab)
}

/** Agents standing at more than one step of this pipeline. */
function _duplicatedAgents(steps) {
    const seen = new Set()
    const dupes = new Set()
    for (const s of steps) {
        if (!s?.tab) continue
        if (seen.has(s.tab)) dupes.add(s.tab)
        seen.add(s.tab)
    }
    return dupes
}

export function findReceiver(steps = [], fromIndex = 0, kind, contractFor = _contractFor) {
    const duplicated = _duplicatedAgents(steps)
    const takes = (step) => _takes(steps, step, kind, contractFor, duplicated)
    for (let i = fromIndex + 1; i < steps.length; i++) if (takes(steps[i])) return { index: i, step: steps[i] }
    for (let i = fromIndex - 1; i >= 0; i--)           if (takes(steps[i])) return { index: i, step: steps[i] }

    // No chain to walk — the hand-off is happening outside any pipeline (the user opened Kairos
    // directly and it wants a name). Order cannot answer it, but capability can, as long as the
    // answer is unambiguous: two desks taking the same kind is a routing decision, and a routing
    // decision needs a pipeline to make it. `index: null` — there is no step to move the crumb to.
    if (steps.length) return null
    const candidates = agentsAccepting(kind)
    return candidates.length === 1 ? { index: null, step: { tab: candidates[0] } } : null
}

/**
 * Plan the hand-off. Returns null when nothing in this pipeline takes the artifact — the caller
 * keeps it rather than dropping it, so an unroutable emit is visible instead of silent.
 *
 * @param {{steps: Array, fromIndex: number, artifact: object, mode?: 'manual'|'auto',
 *          contractFor?: function}} spec
 * @returns {{targetIndex, targetTab, agent, delivery, remount, auto}|null}
 */
export function planHop({ steps = [], fromIndex = 0, artifact, mode = 'manual', contractFor = _contractFor } = {}) {
    if (!artifact?.kind) return null
    const found = findReceiver(steps, fromIndex, artifact.kind, contractFor)
    return found ? _planDelivery(found.step, found.index, artifact, mode, contractFor) : null
}

/**
 * ENTER a pipeline at a step, artifact in hand, rather than advancing along one. "Send this list to
 * research" is not a hop from wherever the user happens to be standing — it is arriving at the
 * portfolio desk's Research step with the names already found, skipping the mandate and the screen.
 *
 * The step is identified by AGENT, never by index. An index would be the one thing in this design
 * that a reorder silently breaks: move Research ahead of Screen and every caller quoting `2` now
 * enters the wrong desk, with nothing to catch it. Naming the agent means a reorder moves the entry
 * point with it — which is the property the whole pipeline exists to have.
 *
 * Refuses when that desk does not take this kind, so a wrong pairing is a caller's `false` rather
 * than a panel handed something it cannot read.
 *
 * @param {{steps: Array, agent: string, artifact: object, mode?: string}} spec
 */
export function planEntry({ steps = [], agent, artifact, mode = 'manual', contractFor = _contractFor } = {}) {
    if (!artifact?.kind || !agent) return null
    const duplicated = _duplicatedAgents(steps)
    // Named agent AND the step that awaits this kind: entering "at Atlas" with a coverage set means
    // Allocate, not the Mandate it also stands at.
    const index = steps.findIndex(s =>
        s?.tab === agent && _takes(steps, s, artifact.kind, contractFor, duplicated))
    return index >= 0 ? _planDelivery(steps[index], index, artifact, mode, contractFor) : null
}

/** The half both share: how this desk takes delivery, and under what conditions. */
function _planDelivery(step, index, artifact, mode, contractFor) {
    const contract = contractFor(step.tab)

    // 'seed' → it opens on a sentence it writes itself; 'artifact' → the panel takes the envelope
    // and briefs itself (it needs more than words: a chip to pre-fill, a window to remember). A seed
    // contract whose brief() declines the artifact hands over nothing rather than an empty turn.
    const brief    = contract.deliver === 'seed' ? contract.brief?.(artifact) : null
    const delivery = contract.deliver === 'seed'
        ? (brief?.message ? { type: 'seed', ...brief } : null)
        : { type: 'artifact' }
    if (!delivery) return null

    return {
        // null outside a pipeline: there is no crumb to move, and the caller must not stamp a step.
        targetIndex: index,
        targetTab:   step.tab,
        agent:       step.tab,
        delivery,
        // The step may override what the agent defaults to: the same desk wants a clean panel
        // entering a run and a continuing one between its items.
        remount: (step.mount ?? contract.mount) === 'fresh',
        // Whether the conveyor may apply this without waiting for the user. A gate never
        // auto-advances whatever the mode — that is where arming and order confirmation live, and a
        // pipeline toggle must not become the way around them (design doc §4).
        auto: mode === 'auto' && step.gate !== true,
    }
}

/**
 * Does this desk's step in this pipeline produce ONE thing rather than a list? A desk that exists to
 * build a single trade wants a single name out of its scan; a desk building a book wants the list.
 * Declared on the STEP, because it is a property of the job the pipeline gave that desk — the same
 * agent produces a shortlist on one desk and a pick on another, and neither is its nature.
 *
 * Matched by tab rather than index: it is the same answer wherever the step sits, and an index that
 * has drifted would silently flip the desk into the wrong mode.
 */
export function producesOne(steps = [], tab) {
    return steps.some(s => s.tab === tab && s.produces === 'one')
}

/**
 * Is there another AGENT step after this one — does the work have anywhere to go? Distinguishes a
 * finished artifact (the scan desk's watchlist: hand it over and return to the hub) from one that is
 * mid-pipeline (the trade desk's scan: Kairos is still waiting). Background monitors have no tab and
 * are not somewhere the work goes.
 */
export function hasDownstream(steps = [], fromIndex = 0) {
    return steps.slice(fromIndex + 1).some(s => !!s.tab)
}

export { accepts }
