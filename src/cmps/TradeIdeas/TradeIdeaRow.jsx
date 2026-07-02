import PropTypes from 'prop-types'
import { conditionSummary, formatCreatedAt, formatCreatedAtFull, needsExitConditions, activationStatus, brokerSymbolLabel, brokerChildLabel, isDeleteLocked, isSystemStatus, formatPnl } from './tradeIdea.utils.js'
import { StatusIcon } from '../StatusIcon.jsx'

const BUILDING = 'building'

export function TradeIdeaRow({ idea, onDelete, onStatusChange, onOpen, onSymbolClick, onEdit, isPortfolioChild, isBrokerChild, showPnl = false, pnl = null }) {
    const { id, asset, direction, type, status, savedAt } = idea
    const summary = conditionSummary(idea)
    const createdAt = formatCreatedAt(savedAt)
    const needsExits = needsExitConditions(idea)
    // Aliased broker symbol (NQ → US100). On a group child the broker is the point of
    // the row, so it leads the cell; otherwise it's a small badge beside the asset.
    const brokerSym = brokerSymbolLabel(idea)

    const isBuilding = status === BUILDING
    // Live on the broker ('hit'/'long'/'short') → deleting would orphan the position
    // or pending order, so the bin is disabled until it's closed.
    const deleteLocked = isDeleteLocked(idea)

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
                        <span className="idea-row__sym">{asset || '—'}</span>
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

            {showPnl && (
                <td className={`idea-row__pnl${pnl ? (pnl.pnl > 0 ? ' pnl--pos' : pnl.pnl < 0 ? ' pnl--neg' : '') : ''}`}>
                    {pnl ? formatPnl(pnl.pnl, pnl.currency) : '—'}
                </td>
            )}

            <td className="idea-row__controls">
                {idea.orderState === 'awaiting_market' && (
                    <span className="idea-row__await-market" title="Order deferred until the market opens">⏳</span>
                )}
                {isBuilding ? (
                    <svg className="idea-row__building-bot" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" title="Building…" aria-hidden="true">
                        {/* hammer — building in progress */}
                        <path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9"/>
                        <path d="m18 15 4-4"/>
                        <path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586z"/>
                    </svg>
                ) : isSystemStatus(status) ? (
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

                <span className="idea-row__actions">
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
                    {!isBuilding && onDelete && (
                        <button
                            className="idea-row__delete idea-row__delete--bin"
                            onClick={e => { e.stopPropagation(); if (!deleteLocked) onDelete(id) }}
                            disabled={deleteLocked}
                            title={deleteLocked ? 'Live on the broker — close the position first to delete' : 'Delete idea'}
                        >
                            <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                <path d="M2.5 4H13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                                <path d="M6.5 4V2.8C6.5 2.36 6.86 2 7.3 2H8.7C9.14 2 9.5 2.36 9.5 2.8V4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                                <path d="M3.7 4L4.3 13C4.34 13.56 4.8 14 5.36 14H10.64C11.2 14 11.66 13.56 11.7 13L12.3 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M6.5 6.5V11.5M9.5 6.5V11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                            </svg>
                        </button>
                    )}
                </span>
            </td>
        </tr>
    )
}

TradeIdeaRow.propTypes = {
    idea:            PropTypes.object.isRequired,
    onDelete:        PropTypes.func,
    onStatusChange:  PropTypes.func.isRequired,
    onOpen:          PropTypes.func.isRequired,
    onSymbolClick:   PropTypes.func,
    onEdit:          PropTypes.func,
    isPortfolioChild: PropTypes.bool,
    isBrokerChild:   PropTypes.bool,
    showPnl:         PropTypes.bool,
    pnl:             PropTypes.object,
}
