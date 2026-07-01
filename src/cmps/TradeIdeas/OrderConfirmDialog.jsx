import PropTypes from 'prop-types'
import { formatCreatedAtFull } from './tradeIdea.utils.js'
import { useMarketStatus } from '../../customHooks/useMarketStatus.js'
import { ConvictionChip } from '../ConvictionChip/ConvictionChip.jsx'
import './OrderConfirmDialog.scss'

/**
 * Small confirmation dialog shown when an idea is 'hit' and has broker accounts
 * attached. The user reviews the order(s) about to be placed and confirms before
 * anything fires to the broker.
 */
export function OrderConfirmDialog({ idea, orders, placing, onConfirm, onDismiss, onReset }) {
    // Block placement while the market is known to be closed (crypto is 24/7).
    const { market, marketClosed } = useMarketStatus(idea?.asset, idea?.asset_class)

    if (!idea || !Array.isArray(orders) || orders.length === 0) return null

    const confirmDisabled = placing || marketClosed

    const handleDismiss = () => onDismiss(idea)
    const handleReset   = () => onReset(idea)

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

                    {idea.conviction?.level && (
                        <div className={`order-confirm__conviction order-confirm__conviction--${idea.conviction.level}`}>
                            <ConvictionChip conviction={idea.conviction} showRationale />
                        </div>
                    )}

                    {idea.triggeredWhileWaiting && (
                        <p className="order-confirm__while-waiting">
                            ⚠️ This condition was met at {formatCreatedAtFull(idea.triggerEventAt) || '—'},
                            before you activated monitoring. Verify it still holds before confirming.
                            <strong> Dismiss</strong> parks it back to waiting (re-activating will surface
                            this same event again); <strong>Reset window</strong> ignores this event and
                            watches only for new ones.
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
                        className="order-confirm__btn order-confirm__btn--reset"
                        onClick={handleReset}
                        disabled={placing}
                        title="Ignore this event and watch only for new ones"
                    >Reset window</button>
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
    onReset:   PropTypes.func.isRequired,
}
