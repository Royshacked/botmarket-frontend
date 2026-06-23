import PropTypes from 'prop-types'
import './ToolStatusChip.scss'

// A "what the agent is doing right now" indicator, driven by the backend
// `status` SSE event (tool-call start). Styled to match the chat panels'
// "thinking…" indicator (bold accent text, slow opacity pulse). Renders nothing
// when there's no active status. Shared by the trade, portfolio, and scanner
// chat panels.
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
