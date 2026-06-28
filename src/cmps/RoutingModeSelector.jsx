import PropTypes from 'prop-types'
import './ModelSelector.scss'

export const ROUTING_MODES = [
    { id: 'manual',     short: 'Manual',  title: 'You pick model and reasoning each turn' },
    { id: 'auto',       short: 'Auto',    title: 'Phase-based routing — cheapest model per phase, zero latency' },
    { id: 'classifier', short: 'AI',      title: 'Haiku reads each message and picks the right model' },
]

export const DEFAULT_ROUTING_MODE = 'manual'

export function readStoredRoutingMode(storageKey) {
    const stored = localStorage.getItem(storageKey)
    return ROUTING_MODES.some(m => m.id === stored) ? stored : DEFAULT_ROUTING_MODE
}

export function RoutingModeSelector({ value = DEFAULT_ROUTING_MODE, onChange, disabled = false }) {
    return (
        <div className="routing-mode-sel" title={ROUTING_MODES.find(m => m.id === value)?.title}>
            {ROUTING_MODES.map(m => (
                <button
                    key={m.id}
                    className={`routing-mode-sel__btn${value === m.id ? ' routing-mode-sel__btn--active' : ''}`}
                    onClick={() => value !== m.id && onChange?.(m.id)}
                    disabled={disabled}
                    title={m.title}
                    type="button"
                >
                    {m.short}
                </button>
            ))}
        </div>
    )
}

RoutingModeSelector.propTypes = {
    value:    PropTypes.string,
    onChange: PropTypes.func,
    disabled: PropTypes.bool,
}
