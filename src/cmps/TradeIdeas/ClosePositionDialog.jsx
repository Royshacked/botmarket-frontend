import PropTypes from 'prop-types'
import { formatCreatedAtFull, formatNum, formatPnl } from './tradeIdea.utils.js'
import './ClosePositionDialog.scss'

const BROKER_LABELS = { ctrader: 'cTrader', ibkr: 'IBKR' }

/**
 * Confirmation dialog for closing an open position at market (full close).
 * Shown in place of a native window.confirm so the action is reviewed against
 * the position's live details before anything fires to the broker.
 */
export function ClosePositionDialog({ position, closing, onConfirm, onCancel }) {
    if (!position) return null

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
                        disabled={closing}
                    >{closing ? 'Closing…' : 'Close position'}</button>
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
