import { useState, useEffect, useCallback, useMemo } from 'react'
import PropTypes from 'prop-types'
import { AccountSelector } from '../ChatPanel/AccountSelector.jsx'
// No extension — matches how the rest of the app (and its vi.mock calls) name this module.
import { marketService } from '../../services/market/market.service.remote'
import { useAutoRefresh } from '../../customHooks/useAutoRefresh.js'
import { useMarketStatus } from '../../customHooks/useMarketStatus.js'
import { formatPrice, formatPnl, matchPositionsForIdea } from '../TradeIdeas/tradeIdea.utils.js'
import {
    ORDER_TYPES, needsPrice, exitSide, quantityUnit, placementBlocker,
    entryTriggerWarning, exitLevelWarning, ticketPhase, referencePrice, legLevel,
} from './ticket.utils.js'
import './TradeTicket.scss'

const P = 'trade-ticket'

// The quote drives the price hints and the wrong-side warnings, so it has to be roughly current
// without being a tick feed — the same cadence the positions poll runs at.
const QUOTE_POLL_MS = 4000

function Field({ label, hint, children }) {
    return (
        <label className={`${P}__field`}>
            <span className={`${P}__field-label`}>
                {label}
                {hint && <span className={`${P}__field-hint`}>{hint}</span>}
            </span>
            {children}
        </label>
    )
}

/** A price box with its own Apply button — used for both protective legs. */
function ExitRow({ leg, label, direction, value, onChange, onApply, reference, disabled, resting }) {
    const price   = Number(value)
    const warning = exitLevelWarning({ leg, direction, price, reference })
    const dirty   = String(value ?? '') !== (resting != null ? String(resting) : '')

    return (
        <div className={`${P}__exit`}>
            <div className={`${P}__exit-head`}>
                <span className={`${P}__exit-label`}>{label}</span>
                {/* The user asked for this to be explicit, and it is the part of an order ticket
                    people get wrong: a protective order is always the opposite side. */}
                <span className={`${P}__exit-side ${P}__exit-side--${exitSide(direction)}`}>
                    {exitSide(direction)} {leg === 'stop' ? 'stop' : 'limit'}
                </span>
                {resting != null && (
                    <span className={`${P}__exit-resting`}>at broker: {formatPrice(resting)}</span>
                )}
            </div>
            <div className={`${P}__exit-row`}>
                <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    className={`${P}__input`}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder="price"
                    disabled={disabled}
                />
                <button
                    type="button"
                    className={`${P}__exit-apply`}
                    onClick={onApply}
                    disabled={disabled || !(price > 0) || !dirty}
                >
                    {resting != null ? 'Update' : 'Attach'}
                </button>
            </div>
            {warning && <p className={`${P}__warn`}>{warning}</p>}
        </div>
    )
}

/**
 * The immediate-trade ticket: a discretionary order pad that opens in place of the chat thread.
 *
 * It authors the SAME entity the chat's "Buy Market" does — an idea with `immediate` set, placed
 * through the ordinary order pipeline — so a ticket trade is monitored, lands in the Floor, reaches
 * the analytics ledger and is visible to the agents exactly like any other position. What the
 * ticket removes is the conversation, not the plumbing.
 *
 * Two phases, driven by the entity rather than by local state: compose the entry, then manage the
 * position. Protective levels can only be attached once there is something to protect, which is
 * why they are a second step rather than fields on the first.
 */
export function TradeTicket({
    accounts = [], selectedAccounts = [], onSelectAccounts, mainAccountId = null, onMainChange,
    ticket = null, positions = [], busy = false, error = null,
    onPlace, onAttachExits, onCancelResting, onClosePosition, onReset,
}) {
    const [symbol, setSymbol]       = useState('')
    const [quantity, setQuantity]   = useState('')
    const [orderType, setOrderType] = useState('market')
    const [price, setPrice]         = useState('')
    const [quote, setQuote]         = useState(null)
    const [stopPrice, setStopPrice] = useState('')
    const [tpPrice, setTpPrice]     = useState('')

    const phase     = ticketPhase(ticket)
    const composing = phase === 'compose'
    // Once placed, the ticker is the entity's — the form's is only the draft that made it.
    const activeSymbol = ticket?.asset ?? symbol

    // ── Live quote ───────────────────────────────────────────────────────────
    const loadQuote = useCallback(async () => {
        const s = String(activeSymbol ?? '').trim().toUpperCase()
        if (!s) { setQuote(null); return }
        try {
            const res = await marketService.getQuote(s)
            setQuote(Number.isFinite(Number(res?.price)) ? Number(res.price) : null)
        } catch {
            // A symbol we can't price is not an error the user has to act on — futures and
            // indices simply have no quote feed. The warnings just go quiet.
            setQuote(null)
        }
    }, [activeSymbol])

    useAutoRefresh(loadQuote, QUOTE_POLL_MS)

    // Reopening a live ticket shows the levels that are actually resting, not blanks.
    const restingStop = useMemo(() => legLevel(ticket?.stop_conditions), [ticket])
    const restingTp   = useMemo(() => legLevel(ticket?.tp_conditions),   [ticket])
    useEffect(() => { if (restingStop != null) setStopPrice(String(restingStop)) }, [restingStop])
    useEffect(() => { if (restingTp   != null) setTpPrice(String(restingTp))     }, [restingTp])

    const chosen    = accounts.filter(a => selectedAccounts.includes(a.id))
    const unit      = quantityUnit(chosen)
    const direction = ticket?.direction ?? 'long'
    const ticketPos = useMemo(() => matchPositionsForIdea(ticket, positions), [ticket, positions])
    const reference = referencePrice(ticket, ticketPos) ?? quote

    // The venue's session, from the one shared read every other order surface uses
    // (OrderConfirmDialog, ClosePositionDialog). A market order into a shut venue is not offered at
    // all — no entity is authored, nothing is deferred, nothing notifies; the user just gets told.
    // Normalised the same way the quote loader does — a lowercase entry must not be a different
    // symbol to the venue check than it is to the price feed.
    const { marketClosed } = useMarketStatus(String(activeSymbol ?? '').trim().toUpperCase() || undefined, ticket?.asset_class)

    const blocker = placementBlocker({ symbol, quantity, orderType, price, accountIds: selectedAccounts, marketClosed })

    // The trigger warning depends on WHICH side you're about to take, and the ticket doesn't know
    // that until you press a button — so both sides are evaluated and the one that's wrong is
    // shown. For any given type and price exactly one side can be wrong (a level above the market
    // is a valid stop-buy and a valid limit-sell, and nothing else), so this reads as one line
    // that also tells you which button the level IS valid for.
    const entryWarnings = ['long', 'short']
        .map(d => entryTriggerWarning({ orderType, direction: d, price: Number(price), quote }))
        .filter(Boolean)

    function handlePlace(dir) {
        if (blocker || busy) return
        onPlace?.({
            asset:     String(symbol).trim().toUpperCase(),
            direction: dir,
            quantity:  Number(quantity),
            orderType,
            price:     needsPrice(orderType) ? Number(price) : null,
        })
    }

    function handleReset() {
        setSymbol(''); setQuantity(''); setOrderType('market'); setPrice('')
        setStopPrice(''); setTpPrice(''); setQuote(null)
        onReset?.()
    }

    // The wrong-side warning depends on which button you're about to press, so it's shown per
    // button rather than once under the price — a stop buy and a stop sell disagree about it.
    const sideWarn = (dir) => entryTriggerWarning({ orderType, direction: dir, price: Number(price), quote })

    return (
        <div className={P}>
            <div className={`${P}__head`}>
                <span className={`${P}__head-title`}>immediate trade</span>
                {activeSymbol && (
                    <span className={`${P}__head-symbol`}>{String(activeSymbol).toUpperCase()}</span>
                )}
                {quote != null && <span className={`${P}__head-quote`}>{formatPrice(quote)}</span>}
                {!composing && (
                    <span className={`${P}__head-status ${P}__head-status--${phase}`}>{phase}</span>
                )}
            </div>

            {/* OUTSIDE the scrolling body on purpose: the selector's dropdown is absolutely
                positioned, and an `overflow: auto` ancestor clips it. Pinning the row here also
                keeps the account you're about to trade visible while the form scrolls. */}
            {composing && (
                <div className={`${P}__accounts`}>
                    <span className={`${P}__field-label`}>accounts</span>
                    <AccountSelector
                        accounts={accounts}
                        selectedIds={selectedAccounts}
                        onChange={onSelectAccounts}
                        mainAccountId={mainAccountId}
                        onMainChange={onMainChange}
                    />
                    <span className={`${P}__accounts-summary`}>
                        {chosen.length
                            ? chosen.map(a => a.name ?? `${a.broker} ${a.login}`).join(' · ')
                            : 'none selected'}
                    </span>
                </div>
            )}

            <div className={`${P}__body`}>
                {composing ? (
                    <>
                        <Field label="ticker">
                            <input
                                type="text"
                                className={`${P}__input ${P}__input--symbol`}
                                value={symbol}
                                onChange={e => setSymbol(e.target.value.toUpperCase())}
                                placeholder="select a ticker…"
                                autoComplete="off"
                                spellCheck="false"
                                disabled={busy}
                            />
                        </Field>

                        <Field label="quantity" hint={unit}>
                            <input
                                type="number"
                                step="any"
                                inputMode="decimal"
                                className={`${P}__input`}
                                value={quantity}
                                onChange={e => setQuantity(e.target.value)}
                                placeholder="0"
                                disabled={busy}
                            />
                        </Field>

                        <Field label="order type">
                            <div className={`${P}__types`}>
                                {ORDER_TYPES.map(t => (
                                    <button
                                        key={t}
                                        type="button"
                                        className={`${P}__type${orderType === t ? ' is-active' : ''}`}
                                        onClick={() => setOrderType(t)}
                                        disabled={busy}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </Field>

                        {needsPrice(orderType) && (
                            <Field label={`${orderType} price`} hint={quote != null ? `last ${formatPrice(quote)}` : undefined}>
                                <input
                                    type="number"
                                    step="any"
                                    inputMode="decimal"
                                    className={`${P}__input`}
                                    value={price}
                                    onChange={e => setPrice(e.target.value)}
                                    placeholder="0.00"
                                    disabled={busy}
                                />
                            </Field>
                        )}

                        {entryWarnings.map(w => <p key={w} className={`${P}__warn`}>{w}</p>)}

                        <div className={`${P}__sides`}>
                            <button
                                type="button"
                                className={`${P}__side ${P}__side--long`}
                                onClick={() => handlePlace('long')}
                                disabled={!!blocker || busy}
                                title={sideWarn('long') ?? blocker ?? undefined}
                            >
                                {orderType === 'market' ? 'Buy' : `Buy ${orderType}`}
                            </button>
                            <button
                                type="button"
                                className={`${P}__side ${P}__side--short`}
                                onClick={() => handlePlace('short')}
                                disabled={!!blocker || busy}
                                title={sideWarn('short') ?? blocker ?? undefined}
                            >
                                {orderType === 'market' ? 'Sell' : `Sell ${orderType}`}
                            </button>
                        </div>
                        {blocker && <p className={`${P}__blocker`}>{blocker}</p>}
                    </>
                ) : (
                    <>
                        <div className={`${P}__position`}>
                            <span className={`${P}__position-dir direction--${direction}`}>{direction}</span>
                            <span className={`${P}__position-qty`}>{ticket?.quantity ?? '—'}</span>
                            <span className={`${P}__position-sep`}>@</span>
                            <span className={`${P}__position-px`}>
                                {formatPrice(referencePrice(ticket, ticketPos))}
                            </span>
                            {ticketPos.length > 0 && (
                                <span className={`${P}__position-pnl`}>
                                    {formatPnl(
                                        ticketPos.reduce((s, p) => s + (Number(p.pnl) || 0), 0),
                                        ticketPos[0]?.currency,
                                    )}
                                </span>
                            )}
                        </div>

                        {phase === 'working' && (
                            <p className={`${P}__note`}>
                                A {ticket?.entryOrderType} entry is resting at the broker. Protective levels
                                can be attached once it fills.
                            </p>
                        )}

                        {phase === 'placing' && (
                            <p className={`${P}__note`}>Orders are away — waiting on the broker to confirm the fill.</p>
                        )}

                        {phase === 'live' && (
                            <>
                                <ExitRow
                                    leg="stop"
                                    label="stop loss"
                                    direction={direction}
                                    value={stopPrice}
                                    onChange={setStopPrice}
                                    onApply={() => onAttachExits?.({ stop: Number(stopPrice) })}
                                    reference={reference}
                                    resting={restingStop}
                                    disabled={busy}
                                />
                                <ExitRow
                                    leg="tp"
                                    label="take profit"
                                    direction={direction}
                                    value={tpPrice}
                                    onChange={setTpPrice}
                                    onApply={() => onAttachExits?.({ tp: Number(tpPrice) })}
                                    reference={reference}
                                    resting={restingTp}
                                    disabled={busy}
                                />
                            </>
                        )}

                        <div className={`${P}__manage`}>
                            {phase === 'working' && (
                                <button type="button" className={`${P}__manage-btn`} onClick={onCancelResting} disabled={busy}>
                                    Cancel order
                                </button>
                            )}
                            {phase === 'live' && (
                                <button type="button" className={`${P}__manage-btn ${P}__manage-btn--danger`} onClick={onClosePosition} disabled={busy}>
                                    Close position
                                </button>
                            )}
                            <button type="button" className={`${P}__manage-btn`} onClick={handleReset} disabled={busy}>
                                New ticket
                            </button>
                        </div>
                    </>
                )}

                {error && <p className={`${P}__error`}>{error}</p>}
            </div>
        </div>
    )
}

TradeTicket.propTypes = {
    accounts:         PropTypes.array,
    selectedAccounts: PropTypes.arrayOf(PropTypes.string),
    onSelectAccounts: PropTypes.func.isRequired,
    mainAccountId:    PropTypes.string,
    onMainChange:     PropTypes.func,
    ticket:           PropTypes.object,
    positions:        PropTypes.array,
    busy:             PropTypes.bool,
    error:            PropTypes.string,
    onPlace:          PropTypes.func.isRequired,
    onAttachExits:    PropTypes.func,
    onCancelResting:  PropTypes.func,
    onClosePosition:  PropTypes.func,
    onReset:          PropTypes.func,
}
