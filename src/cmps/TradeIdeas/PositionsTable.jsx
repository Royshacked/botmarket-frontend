import PropTypes from 'prop-types'
import { formatCreatedAt, formatNum, formatPnl } from './tradeIdea.utils.js'

const BROKER_LABELS = { ctrader: 'cTrader', ibkr: 'IBKR' }

// A position's id is only unique within its account, so a position is identified by
// broker + account + id — never by id alone (two accounts can share a positionId).
// eslint-disable-next-line react-refresh/only-export-components -- tiny key helper colocated with its only consumers
export const posKey = p => `${p.broker}:${p.accountId ?? '—'}:${p.id}`

export function PositionRow({ position, closing, onClose, onEditOrders }) {
    const pnl       = Number(position.pnl)
    const pnlClass  = isNaN(pnl) ? '' : pnl > 0 ? 'pnl--pos' : pnl < 0 ? 'pnl--neg' : ''
    const brokerLbl = BROKER_LABELS[position.broker] ?? position.broker ?? '—'
    const showControls = !!(onClose || onEditOrders)

    return (
        <tr className="position-row">
            <td className="position-row__asset">{position.symbol ?? '—'}</td>
            <td className={`position-row__dir direction--${position.direction}`}>{position.direction ?? '—'}</td>
            <td className="position-row__broker">{brokerLbl}</td>
            <td className="position-row__account">{position.accountNo ?? '—'}</td>
            <td className="position-row__entered">{formatCreatedAt(position.openedAt) || '—'}</td>
            <td className="position-row__qty">{formatNum(position.volume)}</td>
            <td className="position-row__price">{formatNum(position.entryPrice)}</td>
            <td className={`position-row__pnl ${pnlClass}`}>{formatPnl(position.pnl, position.currency)}</td>
            {showControls && (
                <td className="position-row__controls">
                    {onEditOrders && (
                        <button
                            className="position-row__edit"
                            disabled={closing}
                            onClick={() => onEditOrders(position)}
                            title="Open working orders (stop / TP) for this position"
                        >
                            <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                <circle cx="3.5" cy="4"  r="1" fill="currentColor"/>
                                <circle cx="3.5" cy="8"  r="1" fill="currentColor"/>
                                <circle cx="3.5" cy="12" r="1" fill="currentColor"/>
                                <path d="M6.5 4H13.5M6.5 8H13.5M6.5 12H13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                            </svg>
                        </button>
                    )}
                    {onClose && (
                        <button
                            className="position-row__close"
                            disabled={closing}
                            onClick={() => onClose(position)}
                            title="Close this position at market"
                        >{closing ? '…' : 'Close'}</button>
                    )}
                </td>
            )}
        </tr>
    )
}

PositionRow.propTypes = {
    position:     PropTypes.object.isRequired,
    closing:      PropTypes.bool,
    onClose:      PropTypes.func,
    onEditOrders: PropTypes.func,
}

// The open-positions table. When neither onClose nor onEditOrders is given it
// renders read-only (no controls column) — used inside the trade-idea dialog.
export function PositionsTable({ positions = [], closingId, onClose, onEditOrders }) {
    const showControls = !!(onClose || onEditOrders)

    return (
        <table className="positions-table">
            <thead>
                <tr>
                    <th className="col-pos-asset">Asset</th>
                    <th className="col-pos-dir">Dir</th>
                    <th className="col-pos-broker">Broker</th>
                    <th className="col-pos-account">Account</th>
                    <th className="col-pos-entered">Entered</th>
                    <th className="col-pos-qty">Qty</th>
                    <th className="col-pos-price">Avg Px</th>
                    <th className="col-pos-pnl">P&amp;L</th>
                    {showControls && <th className="col-pos-close" />}
                </tr>
            </thead>
            <tbody>
                {positions.map(position => (
                    <PositionRow
                        key={posKey(position)}
                        position={position}
                        closing={closingId === posKey(position)}
                        onClose={onClose}
                        onEditOrders={onEditOrders}
                    />
                ))}
            </tbody>
        </table>
    )
}

PositionsTable.propTypes = {
    positions:    PropTypes.array,
    closingId:    PropTypes.string,
    onClose:      PropTypes.func,
    onEditOrders: PropTypes.func,
}
