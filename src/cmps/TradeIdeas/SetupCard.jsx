import PropTypes from 'prop-types'
import { ConvictionChip } from '../ConvictionChip/ConvictionChip'
import { TalosBadge } from '../AxlHub/AgentBadges.jsx'
import { EntityCard, SymbolCell, Pill, StatusBadge, EditButton, DeleteButton } from '../EntityCard/EntityCard.jsx'
import { formatCreatedAt } from './tradeIdea.utils.js'
import { setupIcon, isSetupArmed, isSetupLive, canArmSetup } from './setupStatus.js'
import './SetupCard.scss'

// One `setup` in the Lists surface. Mentor's artifact, watched by Talos.
//
// Renders into the shared EntityCard, so a setup sits in the same frame as the idea and the call
// one tab away. What stays here is the setup's own judgment — above all ARM STATE.
//
// A setup sits at `unarmed` after Generate and NOTHING watches it until it is armed. That
// distinction is invisible in the data and expensive to get wrong, so it is stated twice: as a
// word in the titleline (not a colour a user has to learn) and as the status toggle's action.
//
// The lifecycle IS the Kairos call's: armed (`waiting`) → price in a zone (`watching`) → the setup
// fulfils (`ready`). `watching` is NOT a call to action — the zone is only the first gate, and
// Talos asks for a confirm only once the setup itself fills in. `unarmed` is the one rung a call
// has no equivalent of, because a call is live from the moment it is saved.

// The readiness ladder a setup shares with a call: waiting → watching → ready.
const STATUS_COPY = {
    unarmed:  { label: 'Not watched', hint: 'Generated but not armed — Talos is not looking at it yet.' },
    waiting:  { label: 'Armed',       hint: 'Talos is watching for price to reach a zone.' },
    watching: { label: 'In zone',     hint: 'Price is in your zone — Talos is reading whether the setup actually fills in. No action yet.' },
    ready:    { label: 'Ready',       hint: 'The setup filled in — an order is awaiting your confirmation.' },
    hit:      { label: 'Placed',      hint: 'Order placed at the broker, awaiting fill.' },
    long:     { label: 'Long',        hint: 'In position.' },
    short:    { label: 'Short',       hint: 'In position.' },
    closed:   { label: 'Closed',      hint: 'Finished.' },
}

const fmtZone = (z) => (z?.lower === z?.upper ? `${z?.lower}` : `${z?.lower}–${z?.upper}`)

/** in / stop / target on one line — the summary a setup is actually read for. */
function zoneSummary(setup) {
    const parts = [
        `in ${fmtZone(setup.entry_zones?.[0])}`,
        `stop ${fmtZone(setup.stop_zones?.[0])}`,
    ]
    if (setup.tp_zones?.[0]) parts.push(`target ${fmtZone(setup.tp_zones[0])}`)
    return parts.join(' · ')
}

export function SetupCard({ setup, onArm, onDisarm, onDelete, onOpen, onEdit, onSymbolClick, busy = false }) {
    const status = setup.status ?? 'waiting'
    const copy   = STATUS_COPY[status] ?? { label: status, hint: '' }
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
