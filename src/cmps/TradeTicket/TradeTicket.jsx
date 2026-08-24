import { useState, useEffect, useCallback, useMemo } from 'react'
import PropTypes from 'prop-types'
import { AccountSelector } from '../ChatPanel/AccountSelector.jsx'
// No extension — matches how the rest of the app (and its vi.mock calls) name this module.
import { marketService } from '../../services/market/market.service.remote'
import { useAutoRefresh } from '../../customHooks/useAutoRefresh.js'
import { useMarketStatus } from '../../customHooks/useMarketStatus.js'
import { formatPrice, formatPnl, matchPositionsForIdea } from '../TradeIdeas/tradeIdea.utils.js'
import {
    ORDER_TYPES, needsPrice, exitSide, quantityUnit, placementBlocker, legBlocker,
    exitLevelWarning, composeWarnings, composeReferencePrice, protectiveLevels,
    ticketPhase, referencePrice, legLevels, levelRows, blankRow, rowsAskedTotal,
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

/**
 * ONE protective leg — a ladder of price rungs, each able to name the slice it closes.
 *
 * The SAME editor in both phases, because it is the same statement either way: before the fill it
 * is what will be attached, after it is what is attached. Two editors would be two places for the
 * rules about a leg to drift, and the manage phase is where a wrong one costs real money.
 *
 * `onApply` is what distinguishes them: given, the leg sends itself (the manage phase, where the
 * position already exists); absent, the Buy/Sell buttons carry it out with the entry.
 */
function ExitLeg({
    leg, label, direction, rows, onChange, onApply, reference,
    resting = [], disabled, quantity, unit,
}) {
    const single  = rows.length === 1
    const blocked = legBlocker(leg, rows, quantity)
    // One line per distinct wrong-side rung; the same sentence twice is still one thing to fix.
    // Only once a side is KNOWN: before the fill the pad has a Buy button and a Sell button, and
    // the same level is right for one and wrong for the other — the form-level list evaluates both
    // and says so, where a guess here would quietly pick a side.
    const warnings = direction ? [...new Set(rows
        .map(r => exitLevelWarning({ leg, direction, price: Number(r.price) > 0 ? Number(r.price) : NaN, reference }))
        .filter(Boolean))] : []

    const set  = (i, field, v) => onChange(rows.map((r, j) => (j === i ? { ...r, [field]: v } : r)))
    const add  = () => onChange([...rows, blankRow()])
    // Never leave a leg with nowhere to type: removing the last rung clears it instead.
    const drop = (i) => onChange(rows.length > 1 ? rows.filter((_, j) => j !== i) : [blankRow()])

    // Against what is at the BROKER, not against the last render — the Apply button must go quiet
    // once the leg matches what is actually resting, however the two came to agree.
    const asRows = rs => JSON.stringify(rs.map(r => [String(r.price ?? ''), String(r.quantity ?? '')]))
    const dirty  = asRows(rows) !== asRows(levelRows(resting))
    const asked  = rowsAskedTotal(rows)

    return (
        <div className={`${P}__exit`}>
            <div className={`${P}__exit-head`}>
                <span className={`${P}__exit-label`}>{label}</span>
                {/* The user asked for this to be explicit, and it is the part of an order ticket
                    people get wrong: a protective order is always the opposite side. Shown only
                    once there IS a side — see the warnings above. */}
                {direction && (
                    <span className={`${P}__exit-side ${P}__exit-side--${exitSide(direction)}`}>
                        {exitSide(direction)} {leg === 'stop' ? 'stop' : 'limit'}
                    </span>
                )}
                {resting.length > 0 && (
                    <span className={`${P}__exit-resting`}>
                        at broker: {resting.map(l => formatPrice(l.price)).join(' · ')}
                    </span>
                )}
            </div>

            {rows.map((row, i) => (
                <div key={i} className={`${P}__exit-row`}>
                    <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        className={`${P}__input`}
                        value={row.price}
                        onChange={e => set(i, 'price', e.target.value)}
                        placeholder="price"
                        aria-label={`${label} price`}
                        disabled={disabled}
                    />
                    {/* Only once there is a ladder. With one rung the size IS the whole position,
                        and a box asking about it is a question with one possible answer. */}
                    {!single && (
                        <input
                            type="number"
                            step="any"
                            inputMode="decimal"
                            className={`${P}__input ${P}__input--qty`}
                            value={row.quantity}
                            onChange={e => set(i, 'quantity', e.target.value)}
                            placeholder="rest"
                            aria-label={`${label} size`}
                            disabled={disabled}
                        />
                    )}
                    {!single && (
                        <button
                            type="button"
                            className={`${P}__exit-drop`}
                            onClick={() => drop(i)}
                            disabled={disabled}
                            aria-label={`remove this ${label} level`}
                            title="remove this level"
                        >
                            &times;
                        </button>
                    )}
                </div>
            ))}

            <div className={`${P}__exit-foot`}>
                <button type="button" className={`${P}__exit-add`} onClick={add} disabled={disabled}>
                    + level
                </button>
                {!single && (
                    // What the rungs have claimed against what there is to claim — the guard's own
                    // arithmetic, shown while it still reads as arithmetic rather than a refusal.
                    <span className={`${P}__exit-tally`}>
                        {asked > 0
                            ? `${asked} of ${Number(quantity) > 0 ? quantity : '?'}${unit ? ` ${unit}` : ''}`
                            : 'split evenly'}
                    </span>
                )}
                {onApply && (
                    <button
                        type="button"
                        className={`${P}__exit-apply`}
                        onClick={onApply}
                        disabled={disabled || !!blocked || !dirty}
                        title={blocked ?? undefined}
                    >
                        {resting.length ? 'Update' : 'Attach'}
                    </button>
                )}
            </div>

            {warnings.map(w => <p key={w} className={`${P}__warn`}>{w}</p>)}
            {blocked && onApply && <p className={`${P}__blocker`}>{blocked}</p>}
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
 * position. The stop and the target appear in BOTH — stated up front they ride out with the entry
 * (the server expands each into a `touch` leg, and the execution layer rests it at the broker the
 * moment there is a position to close), and the manage phase is then where they are moved. The two
 * share one pair of state fields on purpose: what you typed before the fill is the level you are
 * looking at after it.
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
    // A leg is a LADDER of rungs, always at least one so there is somewhere to type.
    const [stops, setStops]         = useState([blankRow()])
    const [tps, setTps]             = useState([blankRow()])

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

    // Reopening a live ticket shows the whole ladder that is actually resting, not blanks — and
    // not just its first rung, which would read as a full-size stop when it is a partial one.
    const restingStops = useMemo(() => legLevels(ticket?.stop_conditions), [ticket])
    const restingTps   = useMemo(() => legLevels(ticket?.tp_conditions),   [ticket])
    // Keyed on the CONTENT, not the array: `legLevels` returns a new array every time the entity
    // object is replaced (every poll), and depending on that identity would stamp the broker's
    // levels back over whatever the user was mid-way through typing.
    const restingStopsKey = JSON.stringify(restingStops)
    const restingTpsKey   = JSON.stringify(restingTps)
    useEffect(() => { if (restingStops.length) setStops(levelRows(restingStops)) }, [restingStopsKey])   // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (restingTps.length)   setTps(levelRows(restingTps))     }, [restingTpsKey])     // eslint-disable-line react-hooks/exhaustive-deps

    const chosen    = accounts.filter(a => selectedAccounts.includes(a.id))
    const unit      = quantityUnit(chosen)
    const direction = ticket?.direction ?? 'long'
    const ticketPos = useMemo(() => matchPositionsForIdea(ticket, positions), [ticket, positions])
    // What a not-yet-filled entry is already carrying, read back off the entity — the levels the
    // compose form sent are legs on the document long before they are orders anywhere.
    const summarise = (levels, word) => (levels.length
        ? `${levels.length > 1 ? `${levels.length} ${word}s` : word} at ${levels.map(l => formatPrice(l.price)).join(' / ')}`
        : null)
    const armed = [summarise(restingStops, 'stop'), summarise(restingTps, 'target')].filter(Boolean)
    const reference = referencePrice(ticket, ticketPos) ?? quote

    // The venue's session, from the one shared read every other order surface uses
    // (OrderConfirmDialog, ClosePositionDialog). A market order into a shut venue is not offered at
    // all — no entity is authored, nothing is deferred, nothing notifies; the user just gets told.
    // Normalised the same way the quote loader does — a lowercase entry must not be a different
    // symbol to the venue check than it is to the price feed.
    const { marketClosed } = useMarketStatus(String(activeSymbol ?? '').trim().toUpperCase() || undefined, ticket?.asset_class)

    const blocker          = placementBlocker({ symbol, quantity, orderType, price, stops, tps, accountIds: selectedAccounts, marketClosed })
    const composeReference = composeReferencePrice({ orderType, price, quote })

    // Every warning depends on WHICH side you're about to take, and the ticket doesn't know that
    // until you press a button — so both sides are evaluated and whatever is wrong is shown. For
    // any given level exactly one side can be wrong (a level above the market is a valid stop-buy,
    // a valid limit-sell, a valid long target and a valid short stop, and nothing else), so this
    // reads as lines that also tell you which button the level IS valid for.
    const composeWarns = useMemo(() => {
        const seen = new Set()
        for (const d of ['long', 'short']) {
            for (const w of composeWarnings({ orderType, direction: d, price, quote, stops, tps })) seen.add(w)
        }
        return [...seen]
    }, [orderType, price, quote, stops, tps])

    function handlePlace(dir) {
        if (blocker || busy) return
        onPlace?.({
            asset:     String(symbol).trim().toUpperCase(),
            direction: dir,
            quantity:  Number(quantity),
            orderType,
            price:     needsPrice(orderType) ? Number(price) : null,
            // An untouched leg arrives as null — "no stop", never a price of 0. A ticket is a
            // CREATE, so there is no leg for the null to clear and the caller simply omits it; the
            // value is still stated rather than dropped here, because the pad is not the thing
            // that decides what an absent leg means.
            ...protectiveLevels({ stops, tps }),
        })
    }

    function handleReset() {
        setSymbol(''); setQuantity(''); setOrderType('market'); setPrice('')
        setStops([blankRow()]); setTps([blankRow()]); setQuote(null)
        onReset?.()
    }

    // The button's own tooltip names the first thing wrong with THAT side specifically — the list
    // above it is the union of both sides, so it can't say which button it is talking about.
    const sideWarn = (dir) => composeWarnings({ orderType, direction: dir, price, quote, stops, tps })[0] ?? null

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

                        {/* Optional, and stated as such: a ticket with no stop is a decision the
                            user is allowed to make, and a required field would be a lie about
                            that. Filled in, they go out WITH the entry rather than after it —
                            which is the whole point, since the gap between the two is exactly
                            when the position is naked. The direction is not known until a button
                            is pressed, so no side badge here — the warnings name the side instead. */}
                        <div className={`${P}__protect`}>
                            <ExitLeg
                                leg="stop"
                                label="stop loss"
                                direction={null}
                                rows={stops}
                                onChange={setStops}
                                reference={composeReference}
                                quantity={quantity}
                                unit={unit}
                                disabled={busy}
                            />
                            <ExitLeg
                                leg="tp"
                                label="take profit"
                                direction={null}
                                rows={tps}
                                onChange={setTps}
                                reference={composeReference}
                                quantity={quantity}
                                unit={unit}
                                disabled={busy}
                            />
                        </div>

                        {composeWarns.map(w => <p key={w} className={`${P}__warn`}>{w}</p>)}

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
                                A {ticket?.entryOrderType} entry is resting at the broker.{' '}
                                {armed.length
                                    // Held by the entity, not by the broker: there is no position to close
                                    // yet, so the closing orders go out on the fill (the reconciler places
                                    // them the moment the entry opens). Saying "at the broker" here would
                                    // claim a protection that isn't standing.
                                    ? `Its ${armed.join(' and ')} go out the moment it fills.`
                                    : 'Protective levels can be attached once it fills.'}
                            </p>
                        )}

                        {phase === 'placing' && (
                            <p className={`${P}__note`}>Orders are away — waiting on the broker to confirm the fill.</p>
                        )}

                        {phase === 'live' && (
                            <>
                                <ExitLeg
                                    leg="stop"
                                    label="stop loss"
                                    direction={direction}
                                    rows={stops}
                                    onChange={setStops}
                                    onApply={() => onAttachExits?.({ stop: protectiveLevels({ stops }).stop })}
                                    reference={reference}
                                    resting={restingStops}
                                    quantity={ticket?.quantity}
                                    unit={unit}
                                    disabled={busy}
                                />
                                <ExitLeg
                                    leg="tp"
                                    label="take profit"
                                    direction={direction}
                                    rows={tps}
                                    onChange={setTps}
                                    onApply={() => onAttachExits?.({ tp: protectiveLevels({ tps }).tp })}
                                    reference={reference}
                                    resting={restingTps}
                                    quantity={ticket?.quantity}
                                    unit={unit}
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
