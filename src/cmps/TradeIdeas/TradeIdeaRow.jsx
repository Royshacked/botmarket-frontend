import PropTypes from 'prop-types'
import { conditionSummary, formatCreatedAt, formatCreatedAtFull, needsExitConditions, activationStatus, brokerSymbolLabel, brokerChildLabel } from './tradeIdea.utils.js'
import { StatusIcon } from '../StatusIcon.jsx'

const SYSTEM_STATUSES = new Set(['hit', 'long', 'short', 'closed'])
const BUILDING = 'building'

export function TradeIdeaRow({ idea, onStatusChange, onOpen, onSymbolClick, onEdit, isPortfolioChild, isBrokerChild }) {
    const { id, asset, direction, type, status, savedAt } = idea
    const summary = conditionSummary(idea)
    const createdAt = formatCreatedAt(savedAt)
    const needsExits = needsExitConditions(idea)
    // Aliased broker symbol (NQ → US100). On a group child the broker is the point of
    // the row, so it leads the cell; otherwise it's a small badge beside the asset.
    const brokerSym = brokerSymbolLabel(idea)

    const isBuilding = status === BUILDING

    // A leaf idea with no broker account attached will only ever *alert* on a hit —
    // the monitor builds no order plan, so no confirm dialog appears. Flag it so the
    // user can spot it and attach an account. Broker-child forks are per-account by
    // definition; closed/building rows are moot.
    const noAccount = !isBrokerChild && !isBuilding && status !== 'closed' &&
        (!Array.isArray(idea.accounts) || idea.accounts.length === 0)

    function handleRowClick(ev) {
        if (isBuilding) return              // building row is not editable
        if (ev.target.closest('.idea-row__controls')) return
        onOpen(idea)
    }

    return (
        <tr className={`idea-row idea-row--${status}${isPortfolioChild ? ' idea-row--portfolio-child' : ''}${isBrokerChild ? ' idea-row--broker-child' : ''}`} onClick={handleRowClick}>
            <td
                className="idea-row__asset"
                onClick={e => { e.stopPropagation(); if (asset && onSymbolClick) onSymbolClick(asset) }}
                title={asset ? `View ${asset} chart` : undefined}
                style={{ cursor: asset ? 'pointer' : 'default' }}
            >
                {isBrokerChild ? (
                    <span className="idea-row__broker">{brokerChildLabel(idea)}</span>
                ) : (
                    <>
                        {asset || '—'}
                        {brokerSym && (
                            <span className="idea-row__broker-badge" title={`Trades as ${brokerSym} on the broker`}>{brokerSym}</span>
                        )}
                        {noAccount && (
                            <span
                                className="idea-row__no-account"
                                title="No broker account attached — this idea will alert only (no order placed). Edit to attach an account."
                            >⚠</span>
                        )}
                    </>
                )}
            </td>
            <td className={`idea-row__direction direction--${direction}`}>{direction ?? '—'}</td>
            <td className="idea-row__type">{type ?? '—'}</td>
            <td className="idea-row__created" title={formatCreatedAtFull(savedAt)}>{createdAt || '—'}</td>
            <td className="idea-row__notes">{summary || '—'}</td>

            <td className="idea-row__controls">
                {idea.orderState === 'awaiting_market' && (
                    <span className="idea-row__await-market" title="Order deferred until the market opens">⏳</span>
                )}
                {!isBuilding && onEdit && (
                    <button
                        className={`idea-row__edit-btn${needsExits ? ' idea-row__edit-btn--alert' : ''}`}
                        onClick={e => { e.stopPropagation(); onEdit(idea) }}
                        title={needsExits ? 'Missing stop / take profit — click to add' : 'Edit in chat'}
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
                                <StatusIcon status={status} />
                            </span>
                        ) : (
                            <button
                                className={`idea-row__status-toggle status--${status}`}
                                onClick={e => { e.stopPropagation(); onStatusChange(id, status === 'waiting' ? activationStatus(idea) : 'waiting') }}
                                title={status === 'waiting' ? `Activate (→ ${activationStatus(idea)})`
                                    : status === 'resting' ? 'Cancel resting order (→ waiting)'
                                    : 'Switch to waiting'}
                            >
                                <StatusIcon status={status} />
                            </button>
                        )}
                    </>
                )}
            </td>
        </tr>
    )
}

TradeIdeaRow.propTypes = {
    idea:            PropTypes.object.isRequired,
    onStatusChange:  PropTypes.func.isRequired,
    onOpen:          PropTypes.func.isRequired,
    onSymbolClick:   PropTypes.func,
    onEdit:          PropTypes.func,
    isPortfolioChild: PropTypes.bool,
    isBrokerChild:   PropTypes.bool,
}
