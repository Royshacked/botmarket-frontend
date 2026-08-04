// ── What one desk hands another ────────────────────────────────────────────────
// A pipeline is a chain of desks, and everything that crosses between them travels in this one
// envelope. It is keyed by `kind` — WHAT it is — and never by where it goes: an artifact carrying
// its destination would mean the sender knows the receiver, which is exactly the coupling that
// makes a pipeline impossible to reorder. Who comes next is the pipeline's business (see hop.js);
// an agent only declares what it emits and what it accepts (see contracts.js).
//
// `from` is kept, but it is PROVENANCE, not routing: Prometheus says "researching for the
// Technology sleeve Atlas asked for". Nothing reads it to decide anything.
//
// See docs/pipeline-service-design.md §1.

/** The kinds that cross between desks. A new hop adds a kind here, not a handler in MainPage. */
export const KIND = {
    SCAN_REQUEST:   'scan_request',      // Kairos → Argus: find me one name (bias + horizon)
    MANDATE:        'mandate',           // Atlas  → Argus: screen this sleeve
    CANDIDATE_LIST: 'candidate_list',    // Argus  → Kairos | Prometheus: names, ranked
    COVERAGE_SET:   'coverage_set',      // Prometheus → Atlas: what came back with a thesis
}

/**
 * Filled / empty / partial. An EMPTY artifact is a result, not an absence — a sleeve that screened
 * to nothing is a decision for the desk downstream (widen it, drop it, reallocate its weight), and
 * one it cannot make if the empty is quietly filtered out on the way. See design doc §5.
 */
export const STATUS = { FILLED: 'filled', EMPTY: 'empty', PARTIAL: 'partial' }

// One-shot delivery needs a key that changes per hand-off (the panels seed on a key, not a value —
// see useSeedTurn). Date.now() alone repeats within a millisecond, and two hops can be planned in
// one tick when a run advances automatically, so a counter rides along.
let _seq = 0

/**
 * Build an artifact. `items` and `ref` are both allowed and both optional:
 *
 *  - `ref`   — the artifact exists as a saved entity ({entityKind, id}); preferred, because it is
 *              still addressable after the run that produced it is gone.
 *  - `items` — inline, alive for the length of the run. Argus's single pick for Kairos is never
 *              persisted, and requiring a save first would add a step to the trade desk for nothing.
 *
 * Consumers must not branch on which arrived — call resolveArtifact.
 *
 * @param {{kind: string, status?: string, ref?: object, items?: Array, context?: object,
 *          from?: object, note?: string}} spec
 */
export function makeArtifact({ kind, status = null, ref = null, items = null, context = null, from = null, note = null } = {}) {
    if (!Object.values(KIND).includes(kind)) throw new Error(`[artifact] unknown kind: ${kind}`)
    const list = Array.isArray(items) ? items : null
    return Object.freeze({
        kind,
        // Inferred when not stated: something with no items is empty however cheerfully it was sent.
        // `partial` is never inferred — only the emitter knows it fell short of what was asked.
        status: status ?? (list?.length ? STATUS.FILLED : STATUS.EMPTY),
        ref,
        items:   list,
        context: context ?? {},
        from,
        note,
        key: `${Date.now()}-${++_seq}`,
    })
}

/**
 * One shape whichever way the artifact carries its payload. `items` wins when both are present:
 * an inline list is what the emitter actually just produced, and `ref` may be the saved version of
 * an earlier state of it.
 *
 * @returns {{items: Array, ref: object|null, isEmpty: boolean}}
 */
export function resolveArtifact(artifact) {
    const items = Array.isArray(artifact?.items) ? artifact.items : []
    return { items, ref: artifact?.ref ?? null, isEmpty: !items.length && !artifact?.ref }
}

/** The first item — what a single-name hand-off (Argus's pick → Kairos) actually means. */
export function firstItem(artifact) {
    return resolveArtifact(artifact).items[0] ?? null
}
