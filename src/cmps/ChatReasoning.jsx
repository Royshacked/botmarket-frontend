import PropTypes from 'prop-types'
import { toReasoningSegments } from '../services/reasoning.service.js'
import './ChatReasoning.scss'

// The thinking behind a turn, surfaced like other streamed actions. Open while it streams (before
// any answer text); collapses to a toggle once the reply begins. Shared by every chat so reasoning
// looks and behaves the same everywhere.
//
// TWO THINKERS, ONE BLOCK. A turn can contain the desk's own reasoning and the reasoning of the
// sidecar it consulted for one bounded decision (backend services/deepThink.service.js). They are
// rendered in the order they happened, styled apart — the desk in the mono voice the rest of the
// chat uses, the consult in a serif one, because it is a different party speaking and reads wrong
// if it looks like the desk changed its mind mid-sentence.
//
// The segment shape itself lives in services/reasoning.service.js — the hook that builds it and
// this view that renders it both depend on it, so neither owns it.

const SOURCE_LABEL = { consult: 'desk head' }

export function ChatReasoning({ reasoning, live = false, streaming = false }) {
    const segments = toReasoningSegments(reasoning)
    if (!segments.length) return null

    const consults = segments.filter(s => s.source === 'consult').length
    // Also open when the sidecar is the one currently speaking. Without this the whole point of
    // surfacing is lost mid-turn: a consult happens during a tool call, which is AFTER the desk has
    // usually written something — and any answer text has already collapsed the block, so the
    // second model would think for seconds behind a closed toggle.
    const open = live || (streaming && segments[segments.length - 1].source === 'consult')

    return (
        <details className="chat-reasoning" open={open}>
            <summary className="chat-reasoning__summary">
                Reasoning
                {consults > 0 && (
                    <span className="chat-reasoning__badge">
                        {consults === 1 ? 'consulted' : `${consults} consults`}
                    </span>
                )}
            </summary>
            <div className="chat-reasoning__body">
                {segments.map((seg, i) => (
                    <div key={i} className={`chat-reasoning__seg chat-reasoning__seg--${seg.source}`}>
                        {SOURCE_LABEL[seg.source] && (
                            <span className="chat-reasoning__who">{SOURCE_LABEL[seg.source]}</span>
                        )}
                        {seg.text}
                    </div>
                ))}
            </div>
        </details>
    )
}

ChatReasoning.propTypes = {
    reasoning: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.arrayOf(PropTypes.shape({
            source: PropTypes.string,
            text:   PropTypes.string,
        })),
    ]),
    // Open regardless — the turn has produced no answer text yet.
    live:      PropTypes.bool,
    // The turn is still running, so a consult tail is worth opening for.
    streaming: PropTypes.bool,
}
