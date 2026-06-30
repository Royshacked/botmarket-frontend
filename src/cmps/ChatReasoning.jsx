import PropTypes from 'prop-types'
import './ChatReasoning.scss'

// The model's live reasoning (extended thinking), surfaced like other streamed
// actions. Open while it streams (before any answer text); collapses to a toggle
// once the reply begins. Shared by every chat so reasoning looks/behaves the same.
// Only renders when the model actually reasoned (reasoning-effort low/high).
export function ChatReasoning({ text, live }) {
    if (!text) return null
    return (
        <details className="chat-reasoning" open={live}>
            <summary className="chat-reasoning__summary">Reasoning</summary>
            <div className="chat-reasoning__body">{text}</div>
        </details>
    )
}

ChatReasoning.propTypes = {
    text: PropTypes.string,
    live: PropTypes.bool,
}
