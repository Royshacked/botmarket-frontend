import PropTypes from 'prop-types'
import './ToolStatusChip.scss'

// The ONE "what the agent is doing right now" mark, rendered once per thread (below it, never
// inside a bubble) by every chat. What it says comes from waitingLabel.js — a live tool status from
// the backend `status` SSE event, else the desk's own waiting word. Nothing when there's nothing
// to say.
export function ToolStatusChip({ label }) {
    if (!label) return null
    return (
        <span className="tool-status-chip" role="status" aria-live="polite">
            {label}
        </span>
    )
}

ToolStatusChip.propTypes = {
    label: PropTypes.string,
}
