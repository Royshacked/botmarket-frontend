import PropTypes from 'prop-types'
import { MODEL_OPTIONS, DEFAULT_MODEL } from './modelOptions.js'
import './ModelSelector.scss'

export function ModelSelector({ value = DEFAULT_MODEL, onChange, disabled = false }) {
    return (
        <select
            className="model-selector"
            value={value}
            onChange={e => onChange?.(e.target.value)}
            disabled={disabled}
            title="Model used for this chat"
            aria-label="Model"
        >
            {MODEL_OPTIONS.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
            ))}
        </select>
    )
}

ModelSelector.propTypes = {
    value:    PropTypes.string,
    onChange: PropTypes.func,
    disabled: PropTypes.bool,
}
