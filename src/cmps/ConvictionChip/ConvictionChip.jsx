import PropTypes from 'prop-types'
import './ConvictionChip.scss'

// The agent's conviction in a setup / portfolio leg / scan candidate, rendered
// as a small color-coded bucket (low | medium | high). The `score` field on the
// conviction object is an internal calibration value and is intentionally never
// shown here. `rationale` rides along as a tooltip, and — when `showRationale`
// is set — as a caveat line beneath the chip (used at the order-confirm step,
// where the user is about to commit). Renders nothing when there's no level.
export function ConvictionChip({ conviction, showRationale = false }) {
    const level = conviction?.level
    if (!level) return null

    const rationale = conviction.rationale || null

    const chip = (
        <span className={`conviction-chip conviction-chip--${level}`} title={rationale || `${level} conviction`}>
            <span className="conviction-chip__dot" aria-hidden="true" />
            <span className="conviction-chip__label">{level}</span>
        </span>
    )

    if (!showRationale || !rationale) return chip

    return (
        <div className={`conviction conviction--${level}`}>
            {chip}
            <span className="conviction__why">{rationale}</span>
        </div>
    )
}

ConvictionChip.propTypes = {
    conviction:    PropTypes.shape({
        level:     PropTypes.oneOf(['low', 'medium', 'high']),
        score:     PropTypes.number,
        rationale: PropTypes.string,
    }),
    showRationale: PropTypes.bool,
}
