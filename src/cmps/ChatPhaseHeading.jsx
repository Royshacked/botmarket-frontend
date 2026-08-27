import PropTypes from 'prop-types'
import './ChatPhaseHeading.scss'

// Phase marker rendered as an in-flow bold heading (not a chip) — reads like a
// section title in the conversation: "Phase 3 — Architecture". Shared by every
// chat (idea / scanner / portfolio) so phases look identical across them.
export function ChatPhaseHeading({ phase, label, total }) {
    if (!label) return null
    return (
        <div className="chat-phase-heading" title={total ? `Phase ${phase} of ${total}` : undefined}>
            <strong>Phase {phase} — {label}</strong>
        </div>
    )
}

ChatPhaseHeading.propTypes = {
    phase: PropTypes.number,
    label: PropTypes.string,
    total: PropTypes.number,
}
