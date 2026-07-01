import PropTypes from 'prop-types'
import { StatusIcon } from '../StatusIcon.jsx'
import { ConvictionChip } from '../ConvictionChip/ConvictionChip.jsx'

const STATUSES = ['waiting', 'looking', 'closed']

export function TradeIdeaCard({ idea, onDelete, onStatusChange }) {
    const { id, asset, direction, timeframe, status, entry_conditions, notes, conviction } = idea

    function handleStatusChange(ev) {
        onStatusChange(id, ev.target.value)
    }

    return (
        <div className={`trade-idea-card status--${status}`}>
            <div className="trade-idea-card__header">
                <span className="trade-idea-card__asset">{asset || '—'}</span>
                {idea.broker === 'paper' && (
                    <span
                        className="trade-idea-card__paper"
                        title="Simulated (paper) trade"
                        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--color-teal)', background: 'rgba(38, 166, 154, 0.12)', border: '1px solid var(--color-teal)', borderRadius: 3, padding: '1px 5px' }}
                    >PAPER</span>
                )}
                <span className={`trade-idea-card__badge status--${status}`}><StatusIcon status={status} /></span>
                <button
                    className="trade-idea-card__delete"
                    onClick={() => onDelete(id)}
                    title="Delete idea"
                >
                    ×
                </button>
            </div>

            <div className="trade-idea-card__meta">
                <span className={`trade-idea-card__direction direction--${direction}`}>
                    {direction ?? '—'}
                </span>
                <span className="trade-idea-card__timeframe">{timeframe ?? '—'}</span>
                <ConvictionChip conviction={conviction} />
            </div>

            {entry_conditions?.length > 0 && (
                <p className="trade-idea-card__entry">
                    {entry_conditions[0]}
                </p>
            )}

            {notes && <p className="trade-idea-card__notes">{notes}</p>}

            <select
                className="trade-idea-card__status-select"
                value={status}
                onChange={handleStatusChange}
            >
                {STATUSES.map(s => (
                    <option key={s} value={s}>{s}</option>
                ))}
            </select>
        </div>
    )
}

TradeIdeaCard.propTypes = {
    idea:           PropTypes.object.isRequired,
    onDelete:       PropTypes.func.isRequired,
    onStatusChange: PropTypes.func.isRequired,
}
