import PropTypes from 'prop-types'
import './ToolStatusChip.scss'

// The ONE "what the agent is doing right now" mark, rendered once per thread (below it, never
// inside a bubble) by every chat. What it says comes from waitingLabel.js — a live tool status from
// the backend `status` SSE event, else the desk's own waiting word. Nothing when there's nothing
// to say.
//
// `pulse` (0-1, or null) is live REASONING activity, measured off the thinking deltas as they arrive
// (reasoningPulse.js). It answers what the label cannot: a flat "thinking…" looks identical whether
// the model is deep in a chain of thought or stalled on a slow tool, and those are very different
// things to sit through. When it beats, reasoning is genuinely streaming, at the rate it arrives.
//
// A live tool status still wins the WORDS — "fetching candles…" is more useful than "reasoning" —
// but the beat rides along with it, because a model can think while a tool is in flight.
export function ToolStatusChip({ label, pulse = null }) {
    const reasoning = typeof pulse === 'number'
    if (!label && !reasoning) return null

    // Faster reasoning → shorter cycle. Handed to CSS as a variable so animating is the browser's
    // job: driving it from React would put a render between every frame.
    const style = reasoning ? { '--pulse-ms': `${Math.round(1100 - pulse * 700)}ms` } : undefined

    return (
        <span
            className={`tool-status-chip${reasoning ? ' tool-status-chip--reasoning' : ''}`}
            style={style}
            role="status"
            aria-live="polite"
        >
            {reasoning && (
                <span className="tool-status-chip__pulse" aria-hidden="true">
                    <i /><i /><i />
                </span>
            )}
            {label || 'reasoning'}
        </span>
    )
}

ToolStatusChip.propTypes = {
    label: PropTypes.string,
    pulse: PropTypes.number,
}
