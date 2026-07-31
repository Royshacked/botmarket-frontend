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
 * @returns {string|null}
 */
export function placementBlocker({ symbol, quantity, orderType, price, accountIds = [] }) {
    if (!String(symbol ?? '').trim())           return 'Choose a ticker'
    if (!(Number(quantity) > 0))                return 'Enter a quantity'
    if (needsPrice(orderType) && !(Number(price) > 0)) return `Enter the ${orderType} price`
    if (!accountIds.length)                     return 'Select an account'
    return null
}

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
 * The level a leg's `touch` condition already carries, so reopening a ticket shows the stop that
 * is actually resting at the broker rather than an empty box.
 *
 * Gated on the leaf TYPE first, exactly as the server gates it: `touch` is what makes a leaf a
 * price the broker can hold, and everything else — an indicator compare, a news or time leaf —
 * lives on the monitor and has no price to show. Reading a number out of one of those would put
 * a figure in the stop box that is not a stop, which is worse than an empty box.
 *
 * @returns {number|null}
 */
export function legLevel(conditions = []) {
    for (const c of conditions ?? []) {
        if (!c || typeof c === 'string' || c.type !== 'touch') continue
        const m = TOUCH_TEXT.exec(String(c.condition ?? '').trim())
        if (m) return Number(m[1])
    }
    return null
}
