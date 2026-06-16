import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { formatCreatedAtFull } from './tradeIdea.utils.js'
import { marketService } from '../../services/market/market.service.remote'
import './OrderConfirmDialog.scss'

/**
 * Small confirmation dialog shown when an idea is 'hit' and has broker accounts
 * attached. The user reviews the order(s) about to be placed and confirms before
 * anything fires to the broker.
 */
export function OrderConfirmDialog({ idea, orders, placing, onConfirm, onDismiss }) {
    const [market, setMarket] = useState(null)

    useEffect(() => {
        if (!idea?.asset) { setMarket(null); return }
        let active = true
        marketService.getStatus(idea.asset)
            .then(s => { if (active) setMarket(s) })
            .catch(() => { if (active) setMarket(null) })
        return () => { active = false }
    }, [idea?.asset])

    if (!idea || !Array.isArray(orders) || orders.length === 0) return null

    // Block placement while the market is known to be closed (crypto is 24/7).
    const marketClosed   = market != null && market.open === false
    const confirmDisabled = placing || marketClosed

    const handleDismiss = () => onDismiss(idea)

    return (
        <div className="order-confirm__backdrop" onClick={placing ? undefined : handleDismiss}>
            <div className="order-confirm" onClick={e => e.stopPropagation()}>
                <div className="order-confirm__header">
                    <span className="order-confirm__title">
                        Entry triggered
                        <span className="order-confirm__asset">{idea.asset || '—'}</span>
                        <span className={`order-confirm__direction direction--${idea.direction}`}>
                            {idea.direction ?? ''}
                        </span>
                    </span>
                    <button className="order-confirm__close" onClick={handleDismiss} disabled={placing}>×</button>
                </div>

                <div className="order-confirm__body">
                    <p className="order-confirm__triggered">
                        Triggered at {formatCreatedAtFull(idea.entryTriggeredAt) || '—'}
                    </p>

                    {idea.triggeredWhileWaiting && (
                        <p className="order-confirm__while-waiting">
                            ⚠️ This condition was met at {formatCreatedAtFull(idea.triggerEventAt) || '—'},
                            before you activated monitoring. Verify it still holds before confirming —
                            otherwise dismiss to send this idea back to waiting.
                        </p>
                    )}

                    {marketClosed && (
                        <p className="order-confirm__market-closed">
                            🔒 Markets are closed — orders cannot be placed right now.
                            {market.nextOpenMs ? ` Opens ${formatCreatedAtFull(market.nextOpenMs)}.` : ''}
                        </p>
                    )}

                    <table className="order-confirm__table">
                        <thead>
                            <tr>
                                <th>Broker</th>
                                <th>Account</th>
                                <th>Qty</th>
                                <th>Order</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orders.map(o => (
                                <tr key={o.accountId}>
                                    <td>{o.broker ?? '—'}</td>
                                    <td>
                                        {o.accountNo}
                                        {o.isMain && <span className="order-confirm__main-tag">main</span>}
                                    </td>
                                    <td>{o.quantity}</td>
                                    <td>{o.orderType}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="order-confirm__footer">
                    <button
                        className="order-confirm__btn order-confirm__btn--dismiss"
                        onClick={handleDismiss}
                        disabled={placing}
                    >Dismiss</button>
                    <button
                        className="order-confirm__btn order-confirm__btn--confirm"
                        onClick={() => onConfirm(idea, orders)}
                        disabled={confirmDisabled}
                        title={marketClosed ? 'Market is closed' : undefined}
                    >{placing ? 'Placing…' : marketClosed ? 'Market closed' : 'Confirm & place'}</button>
                </div>
            </div>
        </div>
    )
}

OrderConfirmDialog.propTypes = {
    idea:      PropTypes.object,
    orders:    PropTypes.array,
    placing:   PropTypes.bool,
    onConfirm: PropTypes.func.isRequired,
    onDismiss: PropTypes.func.isRequired,
}
