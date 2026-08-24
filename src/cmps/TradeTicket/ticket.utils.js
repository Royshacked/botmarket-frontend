// Pure shaping + validation for the immediate-trade ticket. Kept out of the component file so the
// rules can be tested without rendering, and so the component exports a component only (fast
// refresh) — the same split floor.utils.js and tradeIdea.utils.js already use.

/** Entry order types the ticket offers. `market` fills now; the other two rest at the broker. */
export const ORDER_TYPES = ['market', 'limit', 'stop']

/** A resting entry needs a price; a market entry must not carry one. */
export const needsPrice = (orderType) => orderType === 'limit' || orderType === 'stop'

/**
 * WHICH SIDE an exit order is. A protective order closes the position, so it is always the
 * opposite of the position it protects — a long is exited by selling, a short by buying. This is
 * the single statement of that rule on the client; the server states it once too
 * (exitOrders.service.js), because it is the server that actually sides the order.
 * @param {'long'|'short'} direction
 * @returns {'sell'|'buy'}
 */
export const exitSide = (direction) => (direction === 'short' ? 'buy' : 'sell')

/**
 * Where a resting ENTRY trigger has to sit relative to the current price for the broker to accept
 * it. A stop buys strength (trigger ABOVE the market) and a limit buys weakness (trigger BELOW);
 * both mirror for a short. Returns null when there's nothing to check — no quote yet, or a market
 * order, which has no trigger at all.
 *
 * Advisory, not a gate: the broker is the authority on its own order book, and a quote we polled
 * seconds ago is not. It exists so an order that WILL be rejected is questioned here, where the
 * user can still fix it, rather than coming back as an opaque broker error.
 *
 * @returns {string|null} the warning, or null when the trigger is on the right side
 */
export function entryTriggerWarning({ orderType, direction, price, quote }) {
    if (!needsPrice(orderType)) return null
    if (!Number.isFinite(price) || !Number.isFinite(quote)) return null

    const isLong = direction !== 'short'
    // A stop wants the trigger in the direction of travel; a limit wants it behind.
    const wantAbove = orderType === 'stop' ? isLong : !isLong
    if (wantAbove && price <= quote) return `A ${orderType} ${isLong ? 'buy' : 'sell'} triggers above the market — ${price} is at or below ${quote}.`
    if (!wantAbove && price >= quote) return `A ${orderType} ${isLong ? 'buy' : 'sell'} triggers below the market — ${price} is at or above ${quote}.`
    return null
}

/**
 * Whether a protective level is on the losing/winning side it claims to be. A long's stop belongs
 * BELOW the reference price and its target above; a short mirrors. Advisory for the same reason as
 * entryTriggerWarning — and doubly worth surfacing here, because a stop entered on the wrong side
 * of the market fills instantly and closes the position at once.
 *
 * @param {'stop'|'tp'} leg
 * @returns {string|null}
 */
export function exitLevelWarning({ leg, direction, price, reference }) {
    if (!Number.isFinite(price) || !Number.isFinite(reference)) return null
    const isLong  = direction !== 'short'
    // stop: below for a long. tp: above for a long. Both flip for a short.
    const wantBelow = leg === 'stop' ? isLong : !isLong
    if (wantBelow && price >= reference) return `A ${isLong ? 'long' : 'short'}'s ${leg === 'stop' ? 'stop' : 'target'} sits ${isLong ? 'below' : 'above'} ${reference} — this one would fill immediately.`
    if (!wantBelow && price <= reference) return `A ${isLong ? 'long' : 'short'}'s ${leg === 'stop' ? 'stop' : 'target'} sits ${isLong ? 'above' : 'below'} ${reference} — this one would fill immediately.`
    return null
}

/**
 * What the quantity field is counting. cTrader sizes in LOTS while the virtual venues size in
 * plain units, so the same "1" means two very different exposures — the label is the only thing
 * standing between the user and a 100× error after a workspace switch.
 * @param {object[]} accounts  the accounts this ticket would trade
 * @returns {string}
 */
export function quantityUnit(accounts = []) {
    const brokers = new Set(accounts.map(a => String(a?.broker ?? '').toLowerCase()))
    if (brokers.size === 1 && brokers.has('ctrader')) return 'lots'
    if (brokers.has('ctrader')) return 'lots / units'
    return 'units'
}

/**
 * Is the ticket complete enough to send? Returns the blocking reason, or null when it's ready.
 * Order matters: report what the user should fix FIRST, top of the form down.
 *
 * `marketClosed` blocks the MARKET type only, and it is a refusal rather than a deferral: a market
 * order into a shut venue is simply not offered. It sits second — as soon as a ticker is chosen the
 * user learns the venue is shut, before filling in a quantity they can't use. The other two types
 * are deliberately untouched: a limit/stop entry is left resting AT the broker, which is exactly
 * what you'd want overnight, so switching type clears this on its own.
 *
 * @param {boolean} [marketClosed]  true only once the venue's status is KNOWN to be closed —
 *   an unresolved status must never block (see useMarketStatus: the broker is the real gate).
 * @returns {string|null}
 */
export function placementBlocker({ symbol, quantity, orderType, price, stops = [], tps = [], accountIds = [], marketClosed = false }) {
    if (!String(symbol ?? '').trim())           return 'Choose a ticker'
    if (marketClosed && orderType === 'market') return 'Market orders cannot be placed while the market is closed'
    if (!(Number(quantity) > 0))                return 'Enter a quantity'
    if (needsPrice(orderType) && !(Number(price) > 0)) return `Enter the ${orderType} price`
    return legBlocker('stop', stops, quantity)
        ?? legBlocker('tp', tps, quantity)
        ?? (accountIds.length ? null : 'Select an account')
}

/** What a leg's rows say, or null when it is ready. See placementBlocker for why these BLOCK. */
export function legBlocker(leg, rows = [], quantity) {
    const name = leg === 'stop' ? 'stop' : 'target'

    for (const row of rows) {
        // A leg is OPTIONAL — an untouched row is a trade with no stop, which is the user's to
        // make. A row with something unusable in it is not: it would be dropped on the way out and
        // the trade would go on WITHOUT the protection the user believes they attached.
        if (_typedButUnusable(row?.price))    return `Enter a valid ${name} price, or clear it`
        if (_typedButUnusable(row?.quantity)) return `Enter a valid size for the ${name}, or leave it blank to split evenly`
        // A size with no level to come off at is the same silent drop by another route.
        if (_typed(row?.quantity) && !_typed(row?.price)) return `The ${name} size has no price to come off at`
    }

    // THE GUARD. Every rung of one leg closes part of the SAME position, so together they can ask
    // for the position at most — a 60 + 60 ladder behind 100 does not leave 20 unsold, it sends
    // 120 to the broker, and on a hedging account the extra 20 opens a position the other way.
    // The server caps this too (protectionPlan._assignSlotQuantities), because an agent can author
    // a leg as well; here it is a refusal the user can still fix, with both numbers named.
    const asked = rowsAskedTotal(rows)
    const total = Number(quantity)
    if (asked > total + EPS) return `The ${name} levels add up to ${round4(asked)} — more than the ${total} you're trading`
    return null
}

// Sizes are typed by hand and summed; 0.1 + 0.2 must not read as more than 0.3.
const EPS = 1e-9
const round4 = (n) => Math.round(n * 10000) / 10000

/** What a leg's rows explicitly ASK for. A blank size asks for nothing — it takes a share later. */
export function rowsAskedTotal(rows = []) {
    return rows.reduce((sum, r) => sum + (Number(r?.quantity) > 0 ? Number(r.quantity) : 0), 0)
}

const _typed = (v) => String(v ?? '').trim() !== ''
const _typedButUnusable = (v) => _typed(v) && !(Number(v) > 0)

/**
 * The ticket's phase, derived from the entity it created rather than tracked alongside it — so a
 * fill that lands while the tab was in the background moves the ticket on by itself.
 *
 *   compose  no entity yet — the form is live
 *   working  a resting entry sits at the broker, unfilled
 *   placing  orders are away but no position is confirmed back yet
 *   live     in a position — exits can be attached
 *   done     closed
 *
 * @param {object|null} ticket
 * @returns {'compose'|'working'|'placing'|'live'|'done'}
 */
export function ticketPhase(ticket) {
    if (!ticket)                    return 'compose'
    const s = ticket.status
    if (s === 'long' || s === 'short') return 'live'
    if (s === 'closed')             return 'done'
    if (s === 'resting')            return 'working'
    return 'placing'
}

/** The price an exit is measured against: the real fill if we have one, else the intended level. */
export function referencePrice(ticket, positions = []) {
    const pos = positions.find(p => Number.isFinite(Number(p?.entryPrice)))
    if (pos) return Number(pos.entryPrice)
    return Number.isFinite(Number(ticket?.entryTriggerPrice)) ? Number(ticket.entryTriggerPrice) : null
}

// The sentence a bare price level is written as (server: protectionPlan.touchLeaf). Anchored on
// BOTH ends: a loose trailing-number match reads "RSI closes below 30" as a price of 30.
const TOUCH_TEXT = /^price touches (-?\d+(?:\.\d+)?)$/i

/**
 * EVERY level a leg's `touch` conditions carry, in the order they were authored, so reopening a
 * ticket shows the whole ladder that is actually resting at the broker rather than an empty box —
 * or, worse, only its first rung, which reads as a full-size stop when it is a partial one.
 *
 * Gated on the leaf TYPE first, exactly as the server gates it: `touch` is what makes a leaf a
 * price the broker can hold, and everything else — an indicator compare, a news or time leaf —
 * lives on the monitor and has no price to show. Reading a number out of one of those would put
 * a figure in the stop box that is not a stop, which is worse than an empty box. Those leaves are
 * SKIPPED rather than dropping the leg, so a mixed leg still shows the rungs it does hold.
 *
 * @returns {{ price: number, quantity: number|null }[]}
 */
export function legLevels(conditions = []) {
    const out = []
    for (const c of conditions ?? []) {
        if (!c || typeof c === 'string' || c.type !== 'touch') continue
        const m = TOUCH_TEXT.exec(String(c.condition ?? '').trim())
        if (m) out.push({ price: Number(m[1]), quantity: Number(c.quantity) > 0 ? Number(c.quantity) : null })
    }
    return out
}

/** A leg's rows as the FORM holds them — strings, because that is what an input round-trips. */
export function levelRows(levels = []) {
    if (!levels.length) return [blankRow()]
    return levels.map(l => ({ price: String(l.price), quantity: l.quantity != null ? String(l.quantity) : '' }))
}

/** One empty rung. A leg always shows at least this, so there is somewhere to type. */
export const blankRow = () => ({ price: '', quantity: '' })

/**
 * The price a level composed BEFORE the fill is measured against.
 *
 * A market entry fills at the market, so the live quote is the reference. A limit/stop entry fills
 * at ITS OWN TRIGGER, and that — not where price happens to be now — is what its stop and target
 * sit around: a long limit at 95 with a stop at 98 is a stop above the entry, however far below
 * the market both levels are. Measuring a resting entry's exits against the quote passes exactly
 * that mistake through.
 *
 * @returns {number|null} null when there is nothing to measure against yet
 */
export function composeReferencePrice({ orderType, price, quote }) {
    const ref = optionalLevel(needsPrice(orderType) ? price : quote)
    return Number.isFinite(ref) ? ref : null
}

/**
 * A price box read as a level: blank means "nothing here", which must NOT come back as 0.
 * `Number('')` is 0, and 0 is below every reference — an untouched target box would otherwise
 * warn "this would fill immediately" on every long ticket, and an untouched entry-price box would
 * make 0 the reference the stop and target are judged against.
 */
const optionalLevel = (v) => (String(v ?? '').trim() === '' ? NaN : Number(v))

/**
 * Every advisory the compose form has about ONE side of the trade — the entry trigger first, then
 * the two protective levels — in the order the fields are read.
 *
 * The ticket has a Buy button and a Sell button, so it does not know the direction until one is
 * pressed; the caller evaluates both sides and shows the union, the way the entry warning alone
 * already did. For any given level exactly one side can be wrong, so the union reads as a line
 * that also says which button the level IS valid for.
 *
 * @returns {string[]}
 */
export function composeWarnings({ orderType, direction, price, quote, stops = [], tps = [] }) {
    const reference = composeReferencePrice({ orderType, price, quote })
    const rungs = (leg, rows) => rows.map(r => exitLevelWarning({ leg, direction, price: optionalLevel(r?.price), reference }))
    // Deduped: two rungs on the same wrong side produce the same sentence, and saying it twice
    // adds nothing — it is one thing to fix.
    return [...new Set([
        entryTriggerWarning({ orderType, direction, price: Number(price), quote }),
        ...rungs('stop', stops),
        ...rungs('tp', tps),
    ].filter(Boolean))]
}

/**
 * The protective legs as the ticket will SEND them: a ladder of `{ price, quantity }` for a leg
 * with rungs in it, and null for an empty one (`null` clears the leg on the server —
 * applyPriceLevels — which is also what an untouched leg means).
 *
 * A rung with no usable price is DROPPED rather than sent, because a level the server can't read
 * is a level that silently isn't there; placementBlocker refuses to place at all while one exists,
 * so by the time this runs the only rows being dropped are the blank ones. A blank SIZE is sent as
 * absent, not as 0 — absent means "share the rest of the position", which is a real instruction.
 *
 * @returns {{ stop: {price:number,quantity?:number}[]|null, tp: ...|null }}
 */
export function protectiveLevels({ stops = [], tps = [] }) {
    const leg = rows => {
        const out = rows
            .filter(r => Number(r?.price) > 0)
            .map(r => (Number(r?.quantity) > 0
                ? { price: Number(r.price), quantity: Number(r.quantity) }
                : { price: Number(r.price) }))
        return out.length ? out : null
    }
    return { stop: leg(stops), tp: leg(tps) }
}
