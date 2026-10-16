import PropTypes from 'prop-types'
import { conditionSummary, formatCreatedAt, formatCreatedAtFull, activationStatus, brokerSymbolLabel, brokerChildLabel, isDeleteLocked, isSystemStatus, formatPnl } from './tradeIdea.utils.js'
import { StatusIcon } from '../StatusIcon.jsx'
import { DeleteButton } from '../EntityCard/EntityCard.jsx'

export function TradeIdeaRow({ idea, onDelete, onStatusChange, onOpen, onSymbolClick, isPortfolioChild, isBrokerChild, showPnl = false, pnl = null }) {
    const { id, asset, direction, type, status, savedAt } = idea
    const summary = conditionSummary(idea)
    const createdAt = formatCreatedAt(savedAt)
    // Aliased broker symbol (NQ → US100). On a group child the broker is the point of
    // the row, so it leads the cell; otherwise it's a small badge beside the asset.
    const brokerSym = brokerSymbolLabel(idea)

    // Live on the broker ('hit'/'long'/'short') → deleting would orphan the position
    // or pending order, so the bin is disabled until it's closed.
    const deleteLocked = isDeleteLocked(idea)

    // A leaf idea with no broker account attached will only ever *alert* on a hit —
    // the monitor builds no order plan, so no confirm dialog appears. Flag it so the
    // user can spot it and attach an account. Broker-child forks are per-account by
    // definition; closed rows are moot.
    const noAccount = !isBrokerChild && status !== 'closed' &&
        (!Array.isArray(idea.accounts) || idea.accounts.length === 0)

    function handleRowClick(ev) {
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
                                title="No broker account attached — this idea will alert only (no order placed)."
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
                {isSystemStatus(status) ? (
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
                    {onDelete && (
                        <DeleteButton
                            onClick={() => onDelete(id)}
                            title="Delete idea"
                            lockedReason={deleteLocked ? 'Live on the broker — close the position first to delete' : null}
                        />
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
    isPortfolioChild: PropTypes.bool,
    isBrokerChild:   PropTypes.bool,
    showPnl:         PropTypes.bool,
    pnl:             PropTypes.object,
}
