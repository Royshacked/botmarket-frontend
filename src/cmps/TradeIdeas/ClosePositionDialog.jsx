import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { formatCreatedAtFull, formatNum, formatPnl } from './tradeIdea.utils.js'
import { marketService } from '../../services/market/market.service.remote'
import './ClosePositionDialog.scss'

const BROKER_LABELS = { ctrader: 'cTrader', ibkr: 'IBKR' }

/**
 * Confirmation dialog for closing an open position at market (full close).
 * Shown in place of a native window.confirm so the action is reviewed against
 * the position's live details before anything fires to the broker.
 *
 * A close is a MARKET order, so it can't fill while the asset's market is closed —
 * the broker would just reject it. We gate the confirm on live market status
 * (class-aware via the position's stamped assetClass, symbol heuristic otherwise).
 */
export function ClosePositionDialog({ position, closing, onConfirm, onCancel }) {
    const [market, setMarket] = useState(null)

    const symbol     = position?.symbol
    const assetClass = position?.assetClass
    useEffect(() => {
        if (!symbol) { setMarket(null); return }
        let active = true
        marketService.getStatus(symbol, assetClass)
            .then(s => { if (active) setMarket(s) })
            .catch(() => { if (active) setMarket(null) })
        return () => { active = false }
    }, [symbol, assetClass])

    if (!position) return null

    // Block the close while the market is known to be closed (crypto is 24/7 → never).
    const marketClosed   = market != null && market.open === false
    const confirmDisabled = closing || marketClosed

    const pnl       = Number(position.pnl)
    const pnlClass  = isNaN(pnl) ? '' : pnl > 0 ? 'pnl--pos' : pnl < 0 ? 'pnl--neg' : ''
    const brokerLbl = BROKER_LABELS[position.broker] ?? position.broker ?? '—'

    return (
        <div className="close-position__backdrop" onClick={closing ? undefined : onCancel}>
            <div className="close-position" onClick={e => e.stopPropagation()}>
                <div className="close-position__header">
                    <span className="close-position__title">
                        Close position
                        <span className="close-position__asset">{position.symbol ?? '—'}</span>
                        <span className={`close-position__direction direction--${position.direction}`}>
                            {position.direction ?? ''}
                        </span>
                    </span>
                    <button className="close-position__close" onClick={onCancel} disabled={closing}>×</button>
                </div>

                <div className="close-position__body">
                    <p className="close-position__lead">
                        This closes the <strong>full</strong> position at market — it can’t be undone.
                    </p>

                    {marketClosed && (
                        <p className="close-position__market-closed">
                            🔒 Market is closed — a market close can’t fill right now.
                            {market.nextOpenMs ? ` Opens ${formatCreatedAtFull(market.nextOpenMs)}.` : ''}
                            {' '}To manage risk meanwhile, set a resting stop/TP via Edit orders.
                        </p>
                    )}

                    <dl className="close-position__details">
                        <div><dt>Broker</dt><dd>{brokerLbl}</dd></div>
                        <div><dt>Quantity</dt><dd>{formatNum(position.volume)}</dd></div>
                        <div><dt>Avg entry</dt><dd>{formatNum(position.entryPrice)}</dd></div>
                        <div><dt>Opened</dt><dd>{formatCreatedAtFull(position.openedAt) || '—'}</dd></div>
                        <div><dt>P&amp;L</dt><dd className={pnlClass}>{formatPnl(position.pnl, position.currency)}</dd></div>
                    </dl>
                </div>

                <div className="close-position__footer">
                    <button
                        className="close-position__btn close-position__btn--cancel"
                        onClick={onCancel}
                        disabled={closing}
                    >Cancel</button>
                    <button
                        className="close-position__btn close-position__btn--confirm"
                        onClick={onConfirm}
                        disabled={confirmDisabled}
                        title={marketClosed ? 'Market is closed' : undefined}
                    >{closing ? 'Closing…' : marketClosed ? 'Market closed' : 'Close position'}</button>
                </div>
            </div>
        </div>
    )
}

ClosePositionDialog.propTypes = {
    position:  PropTypes.object,
    closing:   PropTypes.bool,
    onConfirm: PropTypes.func.isRequired,
    onCancel:  PropTypes.func.isRequired,
}
