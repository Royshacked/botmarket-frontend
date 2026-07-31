import PropTypes from 'prop-types'
import { formatCreatedAtFull, formatNum, formatPnl, summarizePositions } from './tradeIdea.utils.js'
import { useMarketStatuses } from '../../customHooks/useMarketStatus.js'
import { Modal } from '../Modal.jsx'
import './ClosePositionDialog.scss'

const BROKER_LABELS = { ctrader: 'cTrader', ibkr: 'IBKR' }

/**
 * Confirmation dialog for closing at market (full close) — either ONE position
 * (`position`) or a whole group (`positions` + `label`, e.g. every position in a
 * portfolio). Shown in place of a native window.confirm so the action is reviewed
 * against live details before anything fires to the broker.
 *
 * A close is a MARKET order, so it can't fill while the asset's market is closed —
 * the broker would just reject it. We gate the confirm on live market status
 * (class-aware via each position's stamped assetClass, symbol heuristic otherwise).
 * A group whose legs span several venues is only BLOCKED when every leg's market is
 * known-closed; a partly-closed group warns and still lets the open legs out (the
 * broker rejects the rest, and `error` reports which).
 */
export function ClosePositionDialog({ position, positions, label, closing, error, onConfirm, onCancel }) {
    const group = Array.isArray(positions) && positions.length > 0
    const list  = group ? positions : (position ? [position] : [])

    // One hook for both shapes — a single close is just a group of one.
    const { statuses, closedSymbols } = useMarketStatuses(list)

    if (!list.length) return null

    const symbols   = [...new Set(list.map(p => p.symbol).filter(Boolean))]
    // Known-closed only: an unresolved status never blocks the close.
    const allClosed = symbols.length > 0 && symbols.every(s => statuses[s]?.open === false)
    const someClosed = closedSymbols.length > 0
    const confirmDisabled = closing || allClosed

    const summary = summarizePositions(list)

    return (
        <Modal
            ns="close-position"
            busy={closing}
            onClose={onCancel}
            title={group ? 'Close all positions' : 'Close position'}
            asset={group ? (label ?? 'Group') : (position.symbol ?? '—')}
            direction={group ? undefined : position.direction}
            footer={<>
                <button
                    className="close-position__btn close-position__btn--cancel"
                    onClick={onCancel}
                    disabled={closing}
                >Cancel</button>
                <button
                    className="close-position__btn close-position__btn--confirm"
                    onClick={onConfirm}
                    disabled={confirmDisabled}
                    title={allClosed ? 'Market is closed' : undefined}
                >{closing
                    ? 'Closing…'
                    : allClosed ? 'Market closed'
                    : group ? `Close ${list.length} position${list.length === 1 ? '' : 's'}`
                    : 'Close position'}</button>
            </>}
        >
                    <p className="close-position__lead">
                        {group ? (<>
                            This closes <strong>all {list.length}</strong> open position{list.length === 1 ? '' : 's'}
                            {label ? <> in <strong>{label}</strong></> : null} at market — it can’t be undone.
                        </>) : (<>
                            This closes the <strong>full</strong> position at market — it can’t be undone.
                        </>)}
                    </p>

                    {someClosed && (
                        <p className="close-position__market-closed">
                            🔒 Market is closed{group ? ` for ${closedSymbols.join(', ')}` : ''} — a market close can’t fill right now.
                            {!group && statuses[position.symbol]?.nextOpenMs
                                ? ` Opens ${formatCreatedAtFull(statuses[position.symbol].nextOpenMs)}.`
                                : ''}
                            {' '}To manage risk meanwhile, set a resting stop/TP via Edit orders.
                        </p>
                    )}

                    {error && <p className="close-position__error">{error}</p>}

                    {group ? (<>
                        <ul className="close-position__list">
                            {list.map(p => (
                                <li className="close-position__list-item" key={`${p.broker}:${p.accountId ?? '—'}:${p.id}`}>
                                    <span className="close-position__list-asset">{p.symbol ?? '—'}</span>
                                    <span className={`close-position__direction direction--${p.direction}`}>{p.direction ?? '—'}</span>
                                    <span className="close-position__list-qty">{formatNum(p.volume)}</span>
                                    <span className={`close-position__list-pnl ${pnlClass(p.pnl)}`}>{formatPnl(p.pnl, p.currency)}</span>
                                </li>
                            ))}
                        </ul>
                        <dl className="close-position__details">
                            <div><dt>Positions</dt><dd>{list.length}</dd></div>
                            <div><dt>Total P&amp;L</dt><dd className={pnlClass(summary.pnl)}>{summary.pnl == null ? '—' : formatPnl(summary.pnl, summary.currency)}</dd></div>
                        </dl>
                    </>) : (
                        <dl className="close-position__details">
                            <div><dt>Broker</dt><dd>{BROKER_LABELS[position.broker] ?? position.broker ?? '—'}</dd></div>
                            <div><dt>Quantity</dt><dd>{formatNum(position.volume)}</dd></div>
                            <div><dt>Avg entry</dt><dd>{formatNum(position.entryPrice)}</dd></div>
                            <div><dt>Opened</dt><dd>{formatCreatedAtFull(position.openedAt) || '—'}</dd></div>
                            <div><dt>P&amp;L</dt><dd className={pnlClass(position.pnl)}>{formatPnl(position.pnl, position.currency)}</dd></div>
                        </dl>
                    )}
        </Modal>
    )
}

function pnlClass(value) {
    const n = Number(value)
    return isNaN(n) ? '' : n > 0 ? 'pnl--pos' : n < 0 ? 'pnl--neg' : ''
}

ClosePositionDialog.propTypes = {
    position:  PropTypes.object,
    positions: PropTypes.array,
    label:     PropTypes.string,
    closing:   PropTypes.bool,
    error:     PropTypes.string,
    onConfirm: PropTypes.func.isRequired,
    onCancel:  PropTypes.func.isRequired,
}
