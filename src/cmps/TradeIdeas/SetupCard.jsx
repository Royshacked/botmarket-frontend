import PropTypes from 'prop-types'
import { ConvictionChip } from '../ConvictionChip/ConvictionChip'
import './SetupCard.scss'

// One `setup` row in the Lists surface. Mentor's artifact, watched by Talos.
//
// The card leads with the thing that decides whether anything is happening: ARM STATE. A setup
// sits at `waiting` after Generate and nothing watches it until it is armed — that distinction is
// invisible in the data and expensive to get wrong, so it is the first thing on the card and the
// primary button either fixes it or says it is handled.

const STATUS_COPY = {
    waiting: { label: 'Not watched', hint: 'Generated but not armed — Talos is not looking at it yet.' },
    looking: { label: 'Watching',    hint: 'Armed. Talos checks the zones on its own cadence.' },
    hit:     { label: 'Triggered',   hint: 'Price reached a zone — an order is awaiting your confirmation.' },
    long:    { label: 'Long',        hint: 'In position.' },
    short:   { label: 'Short',       hint: 'In position.' },
    closed:  { label: 'Closed',      hint: 'Finished.' },
}

const fmtZone = (z) => (z?.lower === z?.upper ? `${z?.lower}` : `${z?.lower}–${z?.upper}`)

export function SetupCard({ setup, onArm, onDisarm, onDelete, onOpen, busy = false }) {
    const status = setup.status ?? 'waiting'
    const copy   = STATUS_COPY[status] ?? { label: status, hint: '' }
    const armed  = status === 'looking'
    const live   = status === 'long' || status === 'short'
    const canArm = status === 'waiting'

    return (
        <div className={`setup-card setup-card--${status}`}>
            <header className="setup-card__head">
                <button className="setup-card__asset" onClick={() => onOpen?.(setup)} title="Open this setup">
                    {setup.asset}
                </button>
                {setup.direction && (
                    <span className={`setup-card__dir setup-card__dir--${setup.direction}`}>{setup.direction}</span>
                )}
                <span className="setup-card__state" title={copy.hint}>{copy.label}</span>
            </header>

            <div className="setup-card__tags">
                {setup.type && <span className="setup-card__tag">{setup.type}</span>}
                {setup.trade_mode && <span className="setup-card__tag setup-card__tag--lens">{setup.trade_mode}</span>}
                {setup.mode && <span className={`setup-card__tag setup-card__tag--${setup.mode}`}>{setup.mode}</span>}
            </div>

            <div className="setup-card__levels">
                <span><em>in</em> {fmtZone(setup.entry_zones?.[0])}</span>
                <span><em>stop</em> {fmtZone(setup.stop_zones?.[0])}</span>
                {setup.tp_zones?.[0] && <span><em>target</em> {fmtZone(setup.tp_zones[0])}</span>}
            </div>

            <div className="setup-card__metrics">
                {Number.isFinite(setup.rr) && <span className={`setup-card__rr${setup.rr < 1.5 ? ' is-thin' : ''}`}>{setup.rr}R</span>}
                {setup.quantity != null && <span className="setup-card__qty">{setup.quantity}</span>}
                <ConvictionChip conviction={setup.conviction} />
            </div>

            {/* Talos's running monologue — what it saw on its last look. */}
            {setup.monitor_state?.memo && <p className="setup-card__memo">{setup.monitor_state.memo}</p>}

            <div className="setup-card__actions">
                {canArm && (
                    <button className="setup-card__btn setup-card__btn--primary" onClick={() => onArm?.(setup)} disabled={busy}>
                        Arm it
                    </button>
                )}
                {armed && (
                    <button className="setup-card__btn" onClick={() => onDisarm?.(setup)} disabled={busy}>
                        Stop watching
                    </button>
                )}
                {/* A live position is delete-locked server-side; don't offer an action that 409s. */}
                {!live && (
                    <button className="setup-card__btn setup-card__btn--danger" onClick={() => onDelete?.(setup)} disabled={busy}>
                        Delete
                    </button>
                )}
            </div>
        </div>
    )
}

SetupCard.propTypes = {
    setup:     PropTypes.object.isRequired,
    onArm:     PropTypes.func,
    onDisarm:  PropTypes.func,
    onDelete:  PropTypes.func,
    onOpen:    PropTypes.func,
    busy:      PropTypes.bool,
}
