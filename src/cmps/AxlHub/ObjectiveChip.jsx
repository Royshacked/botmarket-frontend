import PropTypes from 'prop-types'
import { formatObjective } from './objectiveFormat.js'

// ── the goal, shown back to the user ───────────────────────────────────────────
// What Axl took down at intake — the target, the deadline, and what they said they'd risk. It sits
// above the composer for the whole conversation, because the only way someone can tell we
// understood them (or correct us) is to see it written down.
//
// The unstated-risk case is deliberately loud rather than hidden. A blank there is not cosmetic:
// it is the number every desk needs before it sizes anything, and leaving it silent is how a user
// arrives at a desk and gets asked a question they thought they had already answered.

export function ObjectiveChip({ objective, onClear }) {
    const parts = formatObjective(objective)
    if (!parts) return null

    return (
        <div className="axl-objective" role="status" aria-live="polite">
            <span className="axl-objective__label">Goal</span>
            <span className="axl-objective__goal">{parts.goal}</span>
            {parts.symbol && <span className="axl-objective__symbol">{parts.symbol}</span>}
            {parts.risk
                ? <span className="axl-objective__risk">{parts.risk}</span>
                : <span className="axl-objective__risk axl-objective__risk--unset">risk not set</span>
            }
            {onClear && (
                <button
                    type="button"
                    className="axl-objective__clear"
                    onClick={onClear}
                    aria-label="Dismiss this goal"
                    title="Dismiss"
                >
                    ×
                </button>
            )}
        </div>
    )
}

ObjectiveChip.propTypes = {
    objective: PropTypes.shape({
        id: PropTypes.string,
        target: PropTypes.object,
        horizon: PropTypes.object,
        risk: PropTypes.object,
        symbol: PropTypes.string,
    }),
    onClear: PropTypes.func,
}
