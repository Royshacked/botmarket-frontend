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
