// Setup-specific status helpers.
//
// Almost nothing lives here any more: a setup speaks the ONE shared ladder (see
// services/entityStatus.js), so it needs no icon remapping and no private armed test. What remains
// is the wording, which IS the setup's own judgment — "not watched" means something specific here
// because Generate and Arm are two separate acts.
import { isArmed, isUnarmed, isLivePosition, isAwaitingConfirm } from '../../services/entityStatus.js'

export { isArmed as isSetupArmed, isLivePosition as isSetupLive, isAwaitingConfirm as isSetupAwaitingConfirm }

/** Can the user arm it? Only from the unmonitored rung. */
export const canArmSetup = (status) => isUnarmed(status)

/**
 * The shared StatusIcon set covers the whole ladder, so there is no remapping. This used to be a
 * `{ watching: 'looking', ready: 'hit' }` table — one entry per synonym the kind had grown.
 */
export const setupIcon = (status) => status

// The ladder is the ONE shared one (services/entityStatus.js): waiting → looking → hit →
// long|short → closed. This copy used to speak an older vocabulary in which `waiting` meant armed,
// so every freshly generated setup — saved, explicitly NOT monitored — told the user "Armed", and an
// armed (`looking`) one had no copy at all (driven live, 2026-10-01). Keyed to the real statuses now.
const STATUS_COPY = {
    waiting:  { label: 'Not watched', hint: 'Generated but not armed — Talos is not looking at it yet.' },
    looking:  { label: 'Armed',       hint: 'Talos is watching for the setup to fill in. No action yet.' },
    long:     { label: 'Long',        hint: 'In position.' },
    short:    { label: 'Short',       hint: 'In position.' },
    closed:   { label: 'Closed',      hint: 'Finished.' },
}

// `hit` is one status with two moments: the entry fired and the user is asked to confirm, or the order
// has reached the broker — told apart by `ordersPlacedAt`, not the status (see entityStatus.isAwaitingConfirm).
const HIT_COPY = {
    confirm: { label: 'Ready',  hint: 'The setup filled in — an order is awaiting your confirmation.' },
    placed:  { label: 'Placed', hint: 'Order placed at the broker, awaiting fill.' },
}

/** The words for a setup's status — its label in the titleline and the hint behind it. */
export function statusCopy(setup) {
    const status = setup?.status ?? 'waiting'
    if (status === 'hit') return setup?.ordersPlacedAt ? HIT_COPY.placed : HIT_COPY.confirm
    return STATUS_COPY[status] ?? { label: status, hint: '' }
}
