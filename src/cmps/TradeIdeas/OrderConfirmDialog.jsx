import PropTypes from 'prop-types'
import { useMemo } from 'react'
import { formatCreatedAtFull, orderTypeLabel } from './tradeIdea.utils.js'
import { useMarketStatus } from '../../customHooks/useMarketStatus.js'
import { summarizeOrderRisk, describeAllocation, fmtPrice } from './orderRisk.util.js'
import { ConvictionChip } from '../ConvictionChip/ConvictionChip.jsx'
import { Modal } from '../Modal.jsx'
import './OrderConfirmDialog.scss'

/**
 * Small confirmation dialog shown when an idea is 'hit' and has broker accounts
 * attached. The user reviews the order(s) about to be placed and confirms before
 * anything fires to the broker.
 *
 * THE PLAN, not just the routing. This used to show broker / account / quantity / order-type and
 * nothing else — the four numbers that decide whether the trade is worth taking (entry, stop,
 * target, and what the stop costs) were all in hand and none of them reached the one screen where
 * the user says yes. `levels` comes from the caller's derive*Overlay, so the numbers here are the
 * same ones drawn on the chart; summarizeOrderRisk turns them into the risk read.
 */
// Below this, the plan was built in the same session and its age says nothing. Above it, the plan
// was priced before a close the user slept through — which is the whole point of surfacing it.
// Matches STALE_HOURS in monitoring/marketOpen.monitor.js, which decides when the CARD says so.
const STALE_PLAN_HOURS = 12

export function OrderConfirmDialog({ idea, orders, levels = [], placing, onConfirm, onDismiss, onReset }) {
    // Block placement while the market is known to be closed (crypto is 24/7).
    const { market, marketClosed } = useMarketStatus(idea?.asset, idea?.asset_class)

    // Before the early return, so the hook order is stable across renders.
    const risk = useMemo(() => summarizeOrderRisk({
        levels,
        orders:        orders ?? [],
        direction:     idea?.direction,
        assetClass:    idea?.asset_class,
        // A resting entry knows its trigger even with no entry CONDITION to parse.
        fallbackEntry: idea?.entryTriggerPrice ?? null,
    }), [levels, orders, idea?.direction, idea?.asset_class, idea?.entryTriggerPrice])

    // Why the per-account quantities differ. `mainAccountId` is the legacy idea's spelling and
    // `main_account_id` the entity one (call/setup) — toEnvelope absorbs the same pair server-side.
    const allocation = useMemo(
        () => describeAllocation(orders ?? [], idea?.mainAccountId ?? idea?.main_account_id ?? null),
        [orders, idea?.mainAccountId, idea?.main_account_id],
    )

    if (!idea || !Array.isArray(orders) || orders.length === 0) return null

    const confirmDisabled = placing || marketClosed

    // HOW OLD the plan is. An order that parked overnight at 'awaiting_market' is confirmed against
    // a price the desk never saw: the quantities below were sized before the close. We show the age
    // rather than rebuilding or expiring the plan — the plan is what the desk authored, and whether
    // it still stands is the user's call. Absent on legacy ideas with no `pendingOrder`.
    const builtAt   = idea.pendingOrder?.builtAt
    const planAgeHrs = Number.isFinite(builtAt) ? (Date.now() - builtAt) / 3_600_000 : null
    const planStale  = planAgeHrs != null && planAgeHrs >= STALE_PLAN_HOURS

    const handleDismiss = () => onDismiss(idea)
    const handleReset   = () => onReset?.(idea)

    return (
        <Modal
            ns="order-confirm"
            busy={placing}
            onClose={handleDismiss}
            title="Entry triggered"
            asset={idea.asset || '—'}
            direction={idea.direction}
            footer={<>
                <button
                    className="order-confirm__btn order-confirm__btn--dismiss"
                    onClick={handleDismiss}
                    disabled={placing}
                >Dismiss</button>
                {onReset && (
                    <button
                        className="order-confirm__btn order-confirm__btn--reset"
                        onClick={handleReset}
                        disabled={placing}
                        title="Ignore this event and watch only for new ones"
                    >Reset window</button>
                )}
                <button
                    className="order-confirm__btn order-confirm__btn--confirm"
                    onClick={() => onConfirm(idea, orders)}
                    disabled={confirmDisabled}
                    title={marketClosed ? 'Market is closed' : undefined}
                >{placing ? 'Placing…' : marketClosed ? 'Market closed' : 'Confirm & place'}</button>
            </>}
        >
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

                    {planStale && (
                        <p className="order-confirm__stale-plan">
                            ⏳ This order was priced {Math.round(planAgeHrs)}h ago
                            ({formatCreatedAtFull(builtAt) || '—'}), while the market was closed.
                            The quantities below were sized against that price — check the levels
                            still make sense before placing.
                        </p>
                    )}

                    {/* THE PLAN. Shown above the routing table on purpose: which account the order
                        goes to matters less than whether the trade is worth taking, and the eye
                        lands on the first block. */}
                    <div className="order-confirm__plan">
                        <div className="order-confirm__plan-row">
                            <span className="order-confirm__plan-label">Entry</span>
                            <span className="order-confirm__plan-value">
                                {risk.entry != null ? fmtPrice(risk.entry) : 'at market'}
                            </span>
                        </div>
                        <div className="order-confirm__plan-row">
                            <span className="order-confirm__plan-label">Stop</span>
                            <span className={`order-confirm__plan-value${risk.stop == null ? ' order-confirm__plan-value--missing' : ' order-confirm__plan-value--stop'}`}>
                                {risk.stop != null ? fmtPrice(risk.stop) : 'none'}
                                {risk.stopDistance > 0 && (
                                    <span className="order-confirm__plan-sub">
                                        &nbsp;· {fmtPrice(risk.stopDistance)} away
                                        {risk.stopPct != null ? ` (${risk.stopPct.toFixed(2)}%)` : ''}
                                    </span>
                                )}
                            </span>
                        </div>
                        <div className="order-confirm__plan-row">
                            <span className="order-confirm__plan-label">Target</span>
                            <span className={`order-confirm__plan-value${risk.targets.length ? ' order-confirm__plan-value--tp' : ' order-confirm__plan-value--missing'}`}>
                                {risk.targets.length ? risk.targets.map(fmtPrice).join(' · ') : 'none'}
                            </span>
                        </div>
                        {(risk.riskAmount != null || risk.rr != null) && (
                            <div className="order-confirm__plan-row order-confirm__plan-row--risk">
                                <span className="order-confirm__plan-label">Risk</span>
                                <span className="order-confirm__plan-value">
                                    {risk.riskAmount != null
                                        ? `${risk.riskIsCurrency ? '' : '≈ '}${fmtPrice(risk.riskAmount)}${risk.quantity != null ? ` (${fmtPrice(risk.stopDistance)} × ${risk.quantity})` : ''}`
                                        : '—'}
                                    {risk.rr != null && (
                                        <span className="order-confirm__plan-sub">&nbsp;· R:R {risk.rr}</span>
                                    )}
                                </span>
                            </div>
                        )}
                    </div>

                    {risk.warnings.length > 0 && (
                        <ul className="order-confirm__risk-warnings">
                            {risk.warnings.map(w => <li key={w}>{w}</li>)}
                        </ul>
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
                            {allocation.rows.map(o => (
                                <tr key={o.accountId}>
                                    <td>{o.broker ?? '—'}</td>
                                    <td>
                                        {o.accountNo}
                                        {o.isMain && <span className="order-confirm__main-tag">main</span>}
                                    </td>
                                    <td>
                                        {o.quantity}
                                        {/* The share is shown ONLY where it explains a difference —
                                            on the main row it would just say "100% of itself". */}
                                        {allocation.scaled && o.share != null && (
                                            <span className="order-confirm__qty-share">
                                                {Math.round(o.share * 100)}% of main
                                            </span>
                                        )}
                                    </td>
                                    {/* A raw backend plan (what a `setup` hands over) carries the
                                        execution `type`, not the rendered label the idea/call
                                        preview paths stamp — so the column was blank for every
                                        setup confirm. Same labeller either way. */}
                                    <td>{o.orderType ?? orderTypeLabel(idea.direction, o.type)}</td>
                                </tr>
                            ))}
                        </tbody>
                        {allocation.rows.length > 1 && (
                            <tfoot>
                                <tr>
                                    <td colSpan={2}>Total</td>
                                    <td>{allocation.total ?? '—'}</td>
                                    <td />
                                </tr>
                            </tfoot>
                        )}
                    </table>

                    {allocation.scaled && (
                        <p className="order-confirm__alloc-note">
                            The <strong>main</strong> account trades the size you set
                            {allocation.mainQuantity != null ? ` (${allocation.mainQuantity})` : ''};
                            the others are scaled to it by account balance, so each takes
                            proportionally the same risk.
                        </p>
                    )}
        </Modal>
    )
}

OrderConfirmDialog.propTypes = {
    idea:      PropTypes.object,
    orders:    PropTypes.array,
    // [{ kind:'entry'|'stop'|'tp'|…, price }] from the caller's derive*Overlay — the SAME
    // extraction the chart uses, so the approval screen and the chart cannot disagree.
    levels:    PropTypes.array,
    placing:   PropTypes.bool,
    onConfirm: PropTypes.func.isRequired,
    onDismiss: PropTypes.func.isRequired,
    onReset:   PropTypes.func,   // optional — a Kairos call has no waiting-window to reset
}
