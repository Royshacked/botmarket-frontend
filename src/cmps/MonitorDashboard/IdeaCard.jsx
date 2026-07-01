import PropTypes from 'prop-types'
import { phaseSummary } from '../TradeIdeas/tradeIdea.utils.js'

// Truncate a phase summary for the compact card. phaseSummary reads the condition
// tree first (like the ideas row), so tree-format ideas no longer render blank here.
function conditionPreview(idea, phase) {
    const text = phaseSummary(idea, phase)
    if (!text) return null
    return text.length > 52 ? text.slice(0, 52) + '…' : text
}

function phaseInfo(idea) {
    if (idea.status === 'closed') {
        if (idea.closedReason === 'tp')   return { label: 'Target hit',      cls: 'tp',       dot: '✓' }
        if (idea.closedReason === 'stop') return { label: 'Stopped out',     cls: 'stop',     dot: '✗' }
        return                                   { label: 'Closed',          cls: 'closed',   dot: '·' }
    }
    if (idea.status === 'long' || idea.status === 'short')
        return { label: 'In position',   cls: 'position', dot: '●' }
    if (idea.status === 'hit')
        return { label: 'Entry triggered', cls: 'entry',  dot: '◎' }
    if (idea.status === 'looking')
        return { label: 'Watching',      cls: 'entry',    dot: '◎' }
    return     { label: 'Waiting',       cls: 'pending',  dot: '○' }
}

export function IdeaCard({ idea, onOpen }) {
    const { asset, direction, type, timeframe } = idea

    const phase   = phaseInfo(idea)
    const entry   = conditionPreview(idea, 'entry')
    const stop    = conditionPreview(idea, 'stop')
    const tp      = conditionPreview(idea, 'tp')

    return (
        <div className={`idea-card idea-card--${phase.cls}`} onClick={() => onOpen(idea)}>

            {/* ── Top row ── */}
            <div className="idea-card__top">
                <span className="idea-card__asset-group">
                    <span className="idea-card__asset">{asset || '—'}</span>
                    {idea.broker === 'paper' && (
                        <span className="idea-card__paper" title="Simulated (paper) trade">PAPER</span>
                    )}
                </span>
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
