import PropTypes from 'prop-types'
import { ConvictionChip } from '../ConvictionChip/ConvictionChip'
import { TalosBadge } from '../AxlHub/AgentBadges.jsx'
import { EntityCard, SymbolCell, Pill, StatusBadge, EditButton, DeleteButton } from '../EntityCard/EntityCard.jsx'
import { formatCreatedAt } from './tradeIdea.utils.js'
import { setupIcon, isSetupArmed, isSetupLive, canArmSetup, statusCopy } from './setupStatus.js'
import { fmtLevel, fmtEntry } from './setupPlan.utils.js'
import './SetupCard.scss'

// One `setup` in the Lists surface. Mentor's artifact, watched by Talos.
//
// Renders into the shared EntityCard, so a setup sits in the same frame as the idea and the call
// one tab away. What stays here is the setup's own judgment — above all ARM STATE.
//
// A setup sits at `waiting` after Generate and NOTHING watches it until it is armed. That
// distinction is invisible in the data and expensive to get wrong, so it is stated twice: as a
// word in the titleline (not a colour a user has to learn) and as the status toggle's action. The
// words themselves live in setupStatus.statusCopy.

/**
 * in / stop / target on one line — the summary a setup is actually read for.
 *
 * These are the doc's flat zones, which are the EXECUTION PROJECTION of whichever premise armed
 * (pre-arm, the first authored). A setup can hold rivals, so the count of the others is appended:
 * a card that showed one set of levels with no hint of a second way in would read as the whole plan.
 */
function zoneSummary(setup) {
    const parts = [
        // The ENTRY through the shared reading: a trigger entry has no price, and this line used to
        // print "in null" for it (driven live, 2026-10-01).
        `in ${fmtEntry(setup.entry_legs?.[0])}`,
        `stop ${fmtLevel(setup.stop_legs?.[0])}`,
    ]
    if (setup.target_legs?.[0]) parts.push(`target ${fmtLevel(setup.target_legs[0])}`)
    const others = Math.max((setup.scenarios?.length ?? 0) - 1, 0)
    if (others > 0) parts.push(`+${others} more way${others > 1 ? 's' : ''} in`)
    return parts.join(' · ')
}

export function SetupCard({ setup, onArm, onDisarm, onDelete, onOpen, onEdit, onSymbolClick, busy = false }) {
    const status = setup.status ?? 'waiting'
    const copy   = statusCopy(setup)
    const armed  = isSetupArmed(status)
    const live   = isSetupLive(status)
    const canArm = canArmSetup(status)
    const icon   = setupIcon(status)

    const title = (
        <>
            <SymbolCell symbol={setup.asset} onSymbolClick={onSymbolClick} />
            {setup.direction && <Pill variant="dir" className={`direction--${setup.direction}`}>{setup.direction}</Pill>}
            {setup.type && <Pill variant="type">{setup.type}</Pill>}
            {setup.trade_mode && <Pill variant="lens">{setup.trade_mode}</Pill>}
            {/* Arm state in WORDS. The lifecycle colour alone can't say "nothing is watching this". */}
            <span className={`setup-card__state setup-card__state--${status}`} title={copy.hint}>{copy.label}</span>
        </>
    )

    const summary = (
        <>
            <span className="idea-card__summary-text">{zoneSummary(setup)}</span>
            {Number.isFinite(setup.rr) && (
                <span className={`setup-card__rr${setup.rr < 1.5 ? ' is-thin' : ''}`}>{setup.rr}R</span>
            )}
            {setup.quantity != null && <span className="setup-card__qty">{setup.quantity}</span>}
            <ConvictionChip conviction={setup.conviction} />
            <span className="idea-card__date"> · {formatCreatedAt(setup.savedAt) || '—'}</span>
        </>
    )

    // Talos's running monologue — what it saw on its last look.
    const footer = setup.monitor_state?.memo
        ? <p className="setup-card__memo">{setup.monitor_state.memo}</p>
        : null

    const controls = (
        <>
            {(canArm || armed) && (
                <StatusBadge
                    status={status}
                    iconStatus={icon}
                    label={canArm ? 'Arm it — start Talos watching the zones' : 'Stop watching (back to unarmed)'}
                    onToggle={() => (canArm ? onArm?.(setup) : onDisarm?.(setup))}
                    disabled={busy}
                />
            )}
            {!canArm && !armed && <StatusBadge status={status} iconStatus={icon} label={copy.hint} />}
            {/* Parity with ideas and calls: the card opens the pop-out, the pencil returns it to
                the build chat. Editing a live setup is a light edit, so the pencil stays enabled. */}
            {onEdit && <EditButton onClick={() => onEdit(setup)} title="Edit in Mentor chat" />}
            {/* A live position is delete-locked server-side; don't offer an action that 409s. */}
            <DeleteButton
                onClick={() => onDelete?.(setup)}
                title="Delete setup"
                lockedReason={live ? 'In a live position — close it at the broker first' : null}
                disabled={busy}
            />
        </>
    )

    return (
        <EntityCard
            status={status}
            badge={<TalosBadge size={34} />}
            title={title}
            summary={summary}
            footer={footer}
            controls={controls}
            onOpen={onOpen ? () => onOpen(setup) : undefined}
            cardTitle="Open this setup"
        />
    )
}

SetupCard.propTypes = {
    setup:         PropTypes.object.isRequired,
    onArm:         PropTypes.func,
    onDisarm:      PropTypes.func,
    onDelete:      PropTypes.func,
    onOpen:        PropTypes.func,
    onEdit:        PropTypes.func,
    onSymbolClick: PropTypes.func,
    busy:          PropTypes.bool,
}
