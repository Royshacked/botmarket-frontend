import PropTypes from 'prop-types'
import { conditionSummary } from './tradeIdea.utils.js'

const SYSTEM_STATUSES = new Set(['hit', 'long', 'short', 'closed'])
const BUILDING = 'building'

export function TradeIdeaRow({ idea, onDelete, onStatusChange, onOpen, onSymbolClick, onEdit }) {
    const { id, asset, direction, type, status } = idea
    const summary = conditionSummary(idea)

    const isBuilding = status === BUILDING

    function handleRowClick(ev) {
        if (isBuilding) return              // building row is not editable
        if (ev.target.closest('.idea-row__controls')) return
        onOpen(idea)
    }

    function handleStatusChange(ev) {
        ev.stopPropagation()
        onStatusChange(id, ev.target.value)
    }

    function handleDelete(ev) {
        ev.stopPropagation()
        onDelete(id)
    }

    return (
        <tr className={`idea-row idea-row--${status}`} onClick={handleRowClick}>
            <td
                className="idea-row__asset"
                onClick={e => { e.stopPropagation(); if (asset && onSymbolClick) onSymbolClick(asset) }}
                title={asset ? `View ${asset} chart` : undefined}
                style={{ cursor: asset ? 'pointer' : 'default' }}
            >{asset || '—'}</td>
            <td className={`idea-row__direction direction--${direction}`}>{direction ?? '—'}</td>
            <td className="idea-row__type">{type ?? '—'}</td>
            <td className="idea-row__notes">{summary || '—'}</td>

            <td className="idea-row__controls">
                {!isBuilding && onEdit && (
                    <button
                        className="idea-row__edit-btn"
                        onClick={e => { e.stopPropagation(); onEdit(idea) }}
                        title="Edit in chat"
                    >
                        <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <path d="M11.5 1.5L14.5 4.5L5.5 13.5H2.5V10.5L11.5 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                            <path d="M9.5 3.5L12.5 6.5" stroke="currentColor" strokeWidth="1.4"/>
                        </svg>
                    </button>
                )}
                {isBuilding ? (
                    <svg className="idea-row__building-bot" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" title="Building…" aria-hidden="true">
                        {/* Antenna */}
                        <line x1="10" y1="5" x2="10" y2="2"   stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        <circle cx="10" cy="1.5" r="1"         fill="currentColor"/>
                        {/* Head */}
                        <rect x="2" y="5" width="16" height="12" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                        {/* Eyes */}
                        <circle cx="7"  cy="10" r="1.8"        fill="currentColor"/>
                        <circle cx="13" cy="10" r="1.8"        fill="currentColor"/>
                        {/* Mouth */}
                        <rect x="6.5" y="13" width="7" height="1.5" rx="0.75" fill="currentColor"/>
                    </svg>
                ) : (
                    <>
                        {SYSTEM_STATUSES.has(status) ? (
                            <span className={`idea-row__status-badge status--${status}`}>
                                {status}
                            </span>
                        ) : (
                            <button
                                className={`idea-row__status-toggle status--${status}`}
                                onClick={e => { e.stopPropagation(); onStatusChange(id, status === 'looking' ? 'waiting' : 'looking') }}
                                title={`Switch to ${status === 'looking' ? 'waiting' : 'looking'}`}
                            >
                                {status}
                            </button>
                        )}
                    </>
                )}
            </td>
        </tr>
    )
}

TradeIdeaRow.propTypes = {
    idea:           PropTypes.object.isRequired,
    onDelete:       PropTypes.func.isRequired,
    onStatusChange: PropTypes.func.isRequired,
    onOpen:         PropTypes.func.isRequired,
    onSymbolClick:  PropTypes.func,
}
