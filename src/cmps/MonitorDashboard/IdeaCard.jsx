import PropTypes from 'prop-types'

// Normalise condition arrays — handles both legacy strings and { condition, type } objects
function conditionPreview(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return null
    const first = arr[0]
    const text  = typeof first === 'string' ? first : (first?.condition ?? '')
    if (!text) return null
    return text.length > 52 ? text.slice(0, 52) + '…' : text
}

function phaseInfo(idea) {
    if (idea.status === 'closed') {
        if (idea.closedReason === 'tp')   return { label: 'Target hit',   cls: 'tp',       dot: '✓' }
        if (idea.closedReason === 'stop') return { label: 'Stopped out',  cls: 'stop',     dot: '✗' }
        return                                   { label: 'Closed',       cls: 'closed',   dot: '·' }
    }
    if (idea.status === 'active') {
        if (idea.monitorPhase === 'position')
            return { label: 'In position',  cls: 'position', dot: '●' }
        return     { label: 'Entry watch',  cls: 'entry',    dot: '◎' }
    }
    return         { label: 'Pending',      cls: 'pending',  dot: '○' }
}

export function IdeaCard({ idea, onOpen }) {
    const { asset, direction, type, timeframe,
            entry_conditions, stop_conditions, tp_conditions } = idea

    const phase   = phaseInfo(idea)
    const entry   = conditionPreview(entry_conditions)
    const stop    = conditionPreview(stop_conditions)
    const tp      = conditionPreview(tp_conditions)

    return (
        <div className={`idea-card idea-card--${phase.cls}`} onClick={() => onOpen(idea)}>

            {/* ── Top row ── */}
            <div className="idea-card__top">
                <span className="idea-card__asset">{asset || '—'}</span>
                <span className={`idea-card__phase idea-card__phase--${phase.cls}`}>
                    <span className="idea-card__phase-dot">{phase.dot}</span>
                    {phase.label}
                </span>
            </div>

            {/* ── Meta row ── */}
            <div className="idea-card__meta">
                {direction && (
                    <span className={`idea-card__direction idea-card__direction--${direction}`}>
                        {direction === 'long' ? '↑' : '↓'} {direction}
                    </span>
                )}
                {type      && <span className="idea-card__tag">{type}</span>}
                {timeframe && <span className="idea-card__tag">{timeframe}</span>}
            </div>

            {/* ── Conditions ── */}
            {(entry || stop || tp) && (
                <div className="idea-card__conditions">
                    {entry && (
                        <div className="idea-card__condition-row">
                            <span className="idea-card__condition-label">Entry</span>
                            <span className="idea-card__condition-text">{entry}</span>
                        </div>
                    )}
                    {stop && (
                        <div className="idea-card__condition-row">
                            <span className="idea-card__condition-label">Stop</span>
                            <span className="idea-card__condition-text">{stop}</span>
                        </div>
                    )}
                    {tp && (
                        <div className="idea-card__condition-row">
                            <span className="idea-card__condition-label">TP</span>
                            <span className="idea-card__condition-text">{tp}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

IdeaCard.propTypes = {
    idea:   PropTypes.object.isRequired,
    onOpen: PropTypes.func.isRequired,
}
