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
