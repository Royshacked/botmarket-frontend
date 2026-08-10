import PropTypes from 'prop-types'
import { StatusIcon } from '../StatusIcon.jsx'
import { ConvictionChip } from '../ConvictionChip/ConvictionChip.jsx'
import { isAdoptedIdea } from '../AdoptBook/adopt.utils.js'

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
                        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.61rem', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--color-teal)', background: 'rgba(38, 166, 154, 0.12)', border: '1px solid var(--color-teal)', borderRadius: 3, padding: '1px 5px' }}
                    >PAPER</span>
                )}
                {idea.broker === 'manual' && (
                    <span
                        className="trade-idea-card__paper"
                        title="Manual (broker-less real-money) trade"
                        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.61rem', fontWeight: 700, letterSpacing: '0.12em', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid #f59e0b', borderRadius: 3, padding: '1px 5px' }}
                    >MANUAL</span>
                )}
                {/* ADOPTED sits BESIDE the venue badge rather than replacing it: the venue says where
                    this is held, adopted says we never chose it. Both facts matter, and conflating them
                    would hide the one that keeps the track record honest. */}
                {isAdoptedIdea(idea) && (
                    <span
                        className="trade-idea-card__paper"
                        title="Adopted — you already held this at your bank; we recorded it, we didn't choose it"
                        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.61rem', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--color-text-dim)', background: 'rgba(148, 163, 184, 0.12)', border: '1px solid var(--color-text-dim)', borderRadius: 3, padding: '1px 5px' }}
                    >ADOPTED</span>
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
