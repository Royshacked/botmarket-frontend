// Pure-function tests for the immediate-trade ticket's rules.
// Node's built-in harness:  node --test src/cmps/TradeTicket/
//
// The ticket places real orders with two clicks and no conversation in between, so these rules are
// the only thing standing between a slip and a live position. They cover the mistakes that are
// wrong SILENTLY — a side inverted, a trigger on the wrong side of the market, a quantity in the
// wrong unit — rather than the ones that throw.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
    exitSide, needsPrice, quantityUnit, placementBlocker,
    entryTriggerWarning, exitLevelWarning, ticketPhase, referencePrice, legLevel,
} from './ticket.utils.js'

// ── Exit side ─────────────────────────────────────────────────────────────────

test('an exit inverts the position: a long is sold, a short is bought', () => {
    assert.equal(exitSide('long'), 'sell')
    assert.equal(exitSide('short'), 'buy')
})

test('anything that is not short is treated as long — the ticket defaults that way too', () => {
    assert.equal(exitSide(undefined), 'sell')
    assert.equal(exitSide(null), 'sell')
})

// ── Order type ────────────────────────────────────────────────────────────────

test('a price is asked for only when the order rests', () => {
    assert.equal(needsPrice('market'), false)
    assert.equal(needsPrice('limit'), true)
    assert.equal(needsPrice('stop'), true)
})

// ── Entry trigger side ────────────────────────────────────────────────────────
// A stop buys strength (trigger above), a limit buys weakness (trigger below). Getting this
// backwards is the most common way a resting order comes back rejected by the broker.

test('a stop BUY is questioned when its trigger sits at or below the market', () => {
    assert.match(entryTriggerWarning({ orderType: 'stop', direction: 'long', price: 99, quote: 100 }), /above the market/)
    assert.ok(entryTriggerWarning({ orderType: 'stop', direction: 'long', price: 100, quote: 100 }), 'equal is not beyond')
    assert.equal(entryTriggerWarning({ orderType: 'stop', direction: 'long', price: 101, quote: 100 }), null)
})

test('a limit BUY is questioned when its trigger sits at or above the market', () => {
    assert.match(entryTriggerWarning({ orderType: 'limit', direction: 'long', price: 101, quote: 100 }), /below the market/)
    assert.equal(entryTriggerWarning({ orderType: 'limit', direction: 'long', price: 99, quote: 100 }), null)
})

test('the trigger rule mirrors for a short', () => {
    // A stop SELL triggers below the market; a limit SELL triggers above.
    assert.equal(entryTriggerWarning({ orderType: 'stop', direction: 'short', price: 99, quote: 100 }), null)
    assert.ok(entryTriggerWarning({ orderType: 'stop', direction: 'short', price: 101, quote: 100 }))
    assert.equal(entryTriggerWarning({ orderType: 'limit', direction: 'short', price: 101, quote: 100 }), null)
    assert.ok(entryTriggerWarning({ orderType: 'limit', direction: 'short', price: 99, quote: 100 }))
})

test('the trigger warning is advice, not a gate — no quote, no opinion', () => {
    // Futures and indices have no quote feed. The ticket must still place on them.
    assert.equal(entryTriggerWarning({ orderType: 'stop', direction: 'long', price: 99, quote: null }), null)
    assert.equal(entryTriggerWarning({ orderType: 'market', direction: 'long', price: 99, quote: 100 }), null)
})

// ── Exit level side ───────────────────────────────────────────────────────────

test("a long's stop above the entry is caught — it would fill instantly", () => {
    assert.ok(exitLevelWarning({ leg: 'stop', direction: 'long', price: 105, reference: 100 }))
    assert.equal(exitLevelWarning({ leg: 'stop', direction: 'long', price: 95, reference: 100 }), null)
})

test("a long's target below the entry is caught", () => {
    assert.ok(exitLevelWarning({ leg: 'tp', direction: 'long', price: 95, reference: 100 }))
    assert.equal(exitLevelWarning({ leg: 'tp', direction: 'long', price: 105, reference: 100 }), null)
})

test('the exit rule mirrors for a short — stop above, target below', () => {
    assert.equal(exitLevelWarning({ leg: 'stop', direction: 'short', price: 105, reference: 100 }), null)
    assert.ok(exitLevelWarning({ leg: 'stop', direction: 'short', price: 95, reference: 100 }))
    assert.equal(exitLevelWarning({ leg: 'tp', direction: 'short', price: 95, reference: 100 }), null)
    assert.ok(exitLevelWarning({ leg: 'tp', direction: 'short', price: 105, reference: 100 }))
})

test('no reference price, no exit opinion', () => {
    assert.equal(exitLevelWarning({ leg: 'stop', direction: 'long', price: 95, reference: null }), null)
})

// ── Quantity unit ─────────────────────────────────────────────────────────────
// cTrader sizes in LOTS, the virtual venues in plain units. The same "1" is two very different
// exposures, and this label is the only warning the user gets after a workspace switch.

test('quantity is labelled lots for cTrader and units for the virtual venues', () => {
    assert.equal(quantityUnit([{ broker: 'ctrader' }]), 'lots')
    assert.equal(quantityUnit([{ broker: 'paper' }]), 'units')
    assert.equal(quantityUnit([{ broker: 'manual' }]), 'units')
})

test('a mixed selection is flagged rather than resolved to one side', () => {
    assert.equal(quantityUnit([{ broker: 'ctrader' }, { broker: 'paper' }]), 'lots / units')
    assert.equal(quantityUnit([]), 'units')
})

// ── Placement gate ────────────────────────────────────────────────────────────

const READY = { symbol: 'AAPL', quantity: 10, orderType: 'market', price: null, accountIds: ['a1'] }

test('a complete market ticket has nothing blocking it', () => {
    assert.equal(placementBlocker(READY), null)
})

test('the blocker reports what to fix, top of the form down', () => {
    assert.match(placementBlocker({ ...READY, symbol: '  ' }), /ticker/)
    assert.match(placementBlocker({ ...READY, quantity: 0 }), /quantity/)
    assert.match(placementBlocker({ ...READY, accountIds: [] }), /account/)
})

test('a price is demanded only for a resting order', () => {
    assert.match(placementBlocker({ ...READY, orderType: 'limit' }), /limit price/)
    assert.equal(placementBlocker({ ...READY, orderType: 'limit', price: 150 }), null)
})

// ── Closed venue ──────────────────────────────────────────────────────────────
// A market order into a shut venue is REFUSED, not deferred: nothing is authored, nothing parks at
// `awaiting_market`, nothing notifies. The user is told and that is the whole interaction.

test('a shut venue blocks a market order', () => {
    assert.match(placementBlocker({ ...READY, marketClosed: true }), /cannot be placed while the market is closed/)
})

test('a shut venue leaves resting orders alone — that is what they are for', () => {
    // A limit/stop entry is left AT the broker to wait, so an overnight ticket is the normal case,
    // not an error. Switching the type is the user's way out of the block above.
    assert.equal(placementBlocker({ ...READY, orderType: 'limit', price: 150, marketClosed: true }), null)
    assert.equal(placementBlocker({ ...READY, orderType: 'stop', price: 150, marketClosed: true }), null)
})

test('an unresolved venue never blocks — the broker is the real gate', () => {
    // useMarketStatus reports closed only once the status is KNOWN. Defaulting the flag off means a
    // failed status fetch degrades to "let them try", never to a ticket that cannot be sent at all.
    assert.equal(placementBlocker(READY), null)
    assert.equal(placementBlocker({ ...READY, marketClosed: undefined }), null)
})

test('choosing a ticker still outranks the closed-venue notice', () => {
    // The venue is unknowable without a symbol, so "Choose a ticker" has to come first.
    assert.match(placementBlocker({ ...READY, symbol: '  ', marketClosed: true }), /ticker/)
})

test('a negative quantity is blocked, not just a missing one', () => {
    assert.match(placementBlocker({ ...READY, quantity: -5 }), /quantity/)
})

// ── Phase ─────────────────────────────────────────────────────────────────────

test('the phase is read off the entity, so a background fill moves the ticket on', () => {
    assert.equal(ticketPhase(null), 'compose')
    assert.equal(ticketPhase({ status: 'resting' }), 'working')
    assert.equal(ticketPhase({ status: 'hit' }), 'placing')
    assert.equal(ticketPhase({ status: 'long' }), 'live')
    assert.equal(ticketPhase({ status: 'short' }), 'live')
    assert.equal(ticketPhase({ status: 'closed' }), 'done')
})

// ── Reference price ───────────────────────────────────────────────────────────

test('the real fill outranks the intended level', () => {
    assert.equal(referencePrice({ entryTriggerPrice: 100 }, [{ entryPrice: 101.4 }]), 101.4)
})

test('the intended trigger stands in while the order is still resting', () => {
    assert.equal(referencePrice({ entryTriggerPrice: 100 }, []), 100)
    assert.equal(referencePrice({}, []), null)
})

// ── Reading a resting level back ──────────────────────────────────────────────
// Reopening a live ticket must show the stop that is actually at the broker, not a blank box.

test('a resting level is recovered from the condition the server wrote', () => {
    assert.equal(legLevel([{ condition: 'price touches 21500', type: 'touch' }]), 21500)
    assert.equal(legLevel([{ condition: 'price touches 1.0852', type: 'touch' }]), 1.0852)
})

test('an unreadable leg fails soft rather than guessing a price', () => {
    assert.equal(legLevel([]), null)
    assert.equal(legLevel(undefined), null)
})

test('a monitored condition is never mistaken for a price', () => {
    // The regression: a loose trailing-number match reads "RSI closes below 30" as a stop at 30,
    // putting a figure in the stop box that is not a stop. The leaf TYPE is the gate, as on the
    // server — only a `touch` is a level the broker holds.
    assert.equal(legLevel([{ condition: 'RSI closes below 30', type: 'structured' }]), null)
    assert.equal(legLevel([{ condition: 'price closes below 100', type: 'structured' }]), null)
    assert.equal(legLevel(['price touches 100']), null, 'a bare string is structured, never a touch')
})

test('the first touch wins when a leg mixes rested and monitored conditions', () => {
    assert.equal(legLevel([
        { condition: 'RSI closes below 30', type: 'structured' },
        { condition: 'price touches 185.5', type: 'touch' },
    ]), 185.5)
})
