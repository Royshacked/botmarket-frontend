// The frontend mirror of services/entity/vocabulary.js — the ONE lifecycle every entity speaks.
//
//   waiting → looking → hit → long|short → closed
//   (created,  monitored,  entry fired,  in position,  terminal)
//
// A kind may use a SUBSET, never a synonym. `resting` is the single kind-specific rung (an idea's
// stop-entry order actually sits at the broker).
//
// This file exists because the frontend had no vocabulary at all, and every status question was
// asked as a literal spread across a dozen components. That is precisely how the drift happened:
// the backend renamed a word, the components kept testing the old one, and nothing failed — the
// Setups hub just quietly counted zero and a live call's management card never appeared.
//
// Ask a QUESTION here, never a literal, and a future rename cannot silently unhook a surface.

export const STATUS = {
    WAITING: 'waiting',
    LOOKING: 'looking',
    RESTING: 'resting',
    HIT:     'hit',
    LONG:    'long',
    SHORT:   'short',
    CLOSED:  'closed',
}

/** A monitor is actively watching this entity, whether or not price is near the plan. */
export const isArmed = (status) => status === STATUS.LOOKING

/** Created but NOT monitored — arming is a separate act. */
export const isUnarmed = (status) => status === STATUS.WAITING

/**
 * Entry fired; the user is being asked to confirm. `ordersPlacedAt` — not the status — is what
 * says the order actually reached the broker, so check that too before offering a confirm.
 */
export const isAwaitingConfirm = (status) => status === STATUS.HIT

/** In a live broker position. */
export const isLivePosition = (status) => status === STATUS.LONG || status === STATUS.SHORT

/** Nothing at the broker yet — freely editable and deletable. */
export const isPreEntry = (status) =>
    status === STATUS.WAITING || status === STATUS.LOOKING || status === STATUS.RESTING

export const isTerminal = (status) => status === STATUS.CLOSED

// ─── Invalidation — the SECOND axis ───────────────────────────────────────────
//
// Orthogonal to the lifecycle: a plan can go stale while still perfectly well `looking`. Ideas
// have always had this (a watched price envelope); calls used to spend three lifecycle statuses
// on the same idea (`expiring` / `expired` / `dismissed`), which is what made their language
// diverge from every other kind's. The trigger differs by kind (price envelope vs `valid_until`);
// the state does not.
export const INVALIDATION = { DRIFTING: 'drifting', FIRED: 'fired' }

/** Latched, awaiting the user — re-map it, or let it go. */
export const isInvalidated = (invalidationStatus) => invalidationStatus === INVALIDATION.FIRED

/** Soft warning — running the wrong way, still alive. */
export const isDrifting = (invalidationStatus) => invalidationStatus === INVALIDATION.DRIFTING

// ─── Grouping — the lists' shared axis ────────────────────────────────────────
//
// Every list of entities is read with the same question: which of these needs me? The ladder above
// already answers it, so the buckets are derived from the QUESTIONS, never from status literals —
// a kind that later takes a different subset of the ladder groups correctly for free.
//
// `resting` rides with `looking`: from the reader's side both mean "monitored, not yet in" — where
// the entry is parked (broker vs monitor) is a detail of the plan, not of what it wants from you.
//
// Order is urgency, not the ladder's order: an entity awaiting confirm outranks a live position
// because it is the one that stops working if ignored.

export const BUCKET = {
    READY:       'ready',        // hit — an order is placed or awaiting confirm
    IN_POSITION: 'in_position',  // long | short
    LOOKING:     'looking',      // looking | resting — a monitor is on it
    WAITING:     'waiting',      // created, nothing watching
    CLOSED:      'closed',
}

/** Display order, most-urgent first. Callers render buckets in this sequence. */
export const BUCKET_ORDER = [BUCKET.READY, BUCKET.IN_POSITION, BUCKET.LOOKING, BUCKET.WAITING, BUCKET.CLOSED]

export const BUCKET_LABEL = {
    [BUCKET.READY]:       'Ready',
    [BUCKET.IN_POSITION]: 'In position',
    [BUCKET.LOOKING]:     'Watching',
    [BUCKET.WAITING]:     'Not watched',
    [BUCKET.CLOSED]:      'Closed',
}

/**
 * Which bucket a status belongs to. An unknown status lands in WAITING rather than vanishing —
 * a list that silently drops rows is the failure mode this vocabulary exists to prevent.
 *
 * @param {string} status
 * @returns {string} a BUCKET value
 */
export function lifecycleBucket(status) {
    if (isAwaitingConfirm(status)) return BUCKET.READY
    if (isLivePosition(status))    return BUCKET.IN_POSITION
    if (isTerminal(status))        return BUCKET.CLOSED
    if (isArmed(status) || status === STATUS.RESTING) return BUCKET.LOOKING
    return BUCKET.WAITING
}

/**
 * Group entities into the buckets above, in BUCKET_ORDER, dropping empty ones.
 * Order WITHIN a bucket is the caller's — the input order is preserved.
 *
 * @param {object[]} entities  anything carrying a `status`
 * @returns {{key:string,label:string,items:object[]}[]}
 */
export function groupByLifecycle(entities = []) {
    const m = new Map(BUCKET_ORDER.map(b => [b, []]))
    for (const e of entities) m.get(lifecycleBucket(e?.status))?.push(e)
    return BUCKET_ORDER
        .map(key => ({ key, label: BUCKET_LABEL[key], items: m.get(key) }))
        .filter(g => g.items.length > 0)
}
