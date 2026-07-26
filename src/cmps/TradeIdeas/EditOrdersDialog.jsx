import { useState, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { Modal } from '../Modal.jsx'
import { brokerService } from '../../services/broker/broker.service.remote.js'
import { formatNum } from './tradeIdea.utils.js'
import './EditOrdersDialog.scss'

const BROKER_LABELS = { ctrader: 'cTrader', ibkr: 'IBKR' }

/**
 * Manage the working orders ("orders in the air") for an open position: see each
 * resting LIMIT/STOP order, change its price, cancel it, or add a new TP/stop level.
 * Operates directly on the broker in broker-symbol / broker-price terms (the same
 * values cTrader shows), scoped to the position's account + symbol.
 */
export function EditOrdersDialog({ position, onClose, onChanged }) {
    const [orders, setOrders] = useState([])
    const [loading, setLoading] = useState(false)
    const [busy, setBusy]       = useState(false)
    const [error, setError]     = useState(null)
    const [prices, setPrices]   = useState({})            // orderId → edited price string
    const [addKind, setAddKind] = useState('tp')          // 'tp' | 'stop'
    const [addPrice, setAddPrice] = useState('')
    const [addQty, setAddQty]   = useState('')

    const { broker, accountId, symbol, direction, volume, currency } = position ?? {}
    const brokerLbl = BROKER_LABELS[broker] ?? broker ?? '—'
    const closeSide = direction === 'long' ? 'short' : 'long'   // an exit nets the position down

    const load = useCallback(async () => {
        if (!broker) return
        setLoading(true); setError(null)
        try {
            const rows = await brokerService.listOrders(broker, accountId)
            // Only orders on this position's symbol (netting → one position per symbol).
            setOrders(rows.filter(o => o.symbol === symbol))
        } catch (err) {
            setError(err?.response?.data?.error ?? err.message ?? 'Failed to load orders')
            setOrders([])
        } finally {
            setLoading(false)
        }
    }, [broker, accountId, symbol])

    useEffect(() => { load() }, [load])
    useEffect(() => { if (volume != null && addQty === '') setAddQty(String(volume)) }, [volume]) // eslint-disable-line react-hooks/exhaustive-deps

    if (!position) return null

    const run = async (fn) => {
        setBusy(true); setError(null)
        try {
            await fn()
            await load()
            onChanged?.()
        } catch (err) {
            setError(err?.response?.data?.error ?? err.message ?? 'Action failed')
        } finally {
            setBusy(false)
        }
    }

    const savePrice = (order) => {
        const raw = prices[order.orderId]
        const price = Number(raw)
        if (!Number.isFinite(price) || price <= 0) { setError('Enter a valid price'); return }
        const fields = { accountId, ...(order.type === 'limit' ? { limitPrice: price } : { stopPrice: price }) }
        run(() => brokerService.amendOrder(broker, order.orderId, fields))
    }

    const cancel = (order) => run(() => brokerService.cancelOrder(broker, order.orderId, accountId))

    const addLevel = () => {
        const price = Number(addPrice)
        const qty   = Number(addQty)
        if (!Number.isFinite(price) || price <= 0) { setError('Enter a valid price'); return }
        if (!Number.isFinite(qty) || qty <= 0)     { setError('Enter a valid quantity'); return }
        const type = addKind === 'tp' ? 'limit' : 'stop'
        const order = {
            accountId, symbol, direction: closeSide, type, quantity: qty,
            positionId: position.id,   // make it a CLOSING order for this position (safe on hedging)
            ...(type === 'limit' ? { limitPrice: price } : { stopPrice: price }),
        }
        run(async () => { await brokerService.placeOrder(broker, order); setAddPrice('') })
    }

    return (
        <Modal
            ns="edit-orders"
            busy={busy}
            onClose={onClose}
            title="Edit orders"
            asset={symbol ?? '—'}
            direction={direction}
            footer={
                <button className="edit-orders__btn edit-orders__btn--done" onClick={onClose} disabled={busy}>Done</button>
            }
        >
                    <p className="edit-orders__meta">
                        {brokerLbl} · position size {formatNum(volume)}{currency ? '' : ''}
                    </p>

                    {error && <p className="edit-orders__error">{error}</p>}

                    <table className="edit-orders__table">
                        <thead>
                            <tr><th>Type</th><th>Side</th><th>Qty</th><th>Price</th><th></th></tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={5} className="edit-orders__empty">Loading…</td></tr>
                            ) : orders.length === 0 ? (
                                <tr><td colSpan={5} className="edit-orders__empty">No working orders</td></tr>
                            ) : orders.map(o => (
                                <tr key={o.orderId}>
                                    <td className={`edit-orders__type edit-orders__type--${o.type}`}>{o.type === 'limit' ? 'TP (limit)' : 'Stop'}</td>
                                    <td>{o.side}</td>
                                    <td>{formatNum(o.quantity)}</td>
                                    <td>
                                        <input
                                            className="edit-orders__price-input"
                                            type="number" step="any"
                                            defaultValue={o.price ?? ''}
                                            onChange={e => setPrices(p => ({ ...p, [o.orderId]: e.target.value }))}
                                            disabled={busy}
                                        />
                                    </td>
                                    <td className="edit-orders__row-actions">
                                        <button className="edit-orders__btn edit-orders__btn--save"
                                            onClick={() => savePrice(o)}
                                            disabled={busy || prices[o.orderId] == null || Number(prices[o.orderId]) === o.price}
                                            title="Update price">Save</button>
                                        <button className="edit-orders__btn edit-orders__btn--cancel"
                                            onClick={() => cancel(o)} disabled={busy} title="Cancel order">✕</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="edit-orders__add">
                        <span className="edit-orders__add-title">Add level</span>
                        <div className="edit-orders__add-row">
                            <select value={addKind} onChange={e => setAddKind(e.target.value)} disabled={busy}>
                                <option value="tp">Take profit (limit)</option>
                                <option value="stop">Stop (stop-market)</option>
                            </select>
                            <input className="edit-orders__price-input" type="number" step="any" placeholder="price"
                                value={addPrice} onChange={e => setAddPrice(e.target.value)} disabled={busy} />
                            <input className="edit-orders__price-input" type="number" step="any" placeholder="qty"
                                value={addQty} onChange={e => setAddQty(e.target.value)} disabled={busy} />
                            <button className="edit-orders__btn edit-orders__btn--add" onClick={addLevel} disabled={busy}>Add</button>
                        </div>
                        <p className="edit-orders__hint">
                            Closes as a {closeSide === 'short' ? 'sell' : 'buy'} order. A TP must be {direction === 'long' ? 'above' : 'below'} and a stop {direction === 'long' ? 'below' : 'above'} the current price.
                        </p>
                        <p className="edit-orders__hint">
                            Resting orders can be set while the market is closed — they only trigger once it reopens, and a gap can fill a stop beyond your price.
                        </p>
                    </div>
        </Modal>
    )
}

EditOrdersDialog.propTypes = {
    position:  PropTypes.object,
    onClose:   PropTypes.func.isRequired,
    onChanged: PropTypes.func,
}
