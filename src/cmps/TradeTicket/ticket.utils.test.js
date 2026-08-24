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
    exitSide, needsPrice, quantityUnit, placementBlocker, legBlocker,
    entryTriggerWarning, exitLevelWarning, ticketPhase, referencePrice, legLevels,
    composeReferencePrice, composeWarnings, protectiveLevels, levelRows, rowsAskedTotal,
} from './ticket.utils.js'

/** A leg's rows, the way the form holds them. */
const rows = (...rs) => rs.map(r => (typeof r === 'object' ? r : { price: String(r), quantity: '' }))

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
    assert.deepEqual(legLevels([{ condition: 'price touches 21500', type: 'touch' }]), [{ price: 21500, quantity: null }])
    assert.deepEqual(legLevels([{ condition: 'price touches 1.0852', type: 'touch' }]), [{ price: 1.0852, quantity: null }])
})

test('EVERY rung comes back, in order, with the slice each one closes', () => {
    // Reading only the first rung is the dangerous version: a 40-lot partial stop shown alone
    // reads as the whole position's stop, and the user believes they are covered when they are
    // covered for 40. An absent quantity stays null — it means "a share of the rest", not 0.
    assert.deepEqual(legLevels([
        { condition: 'price touches 185.5', type: 'touch', quantity: 60 },
        { condition: 'price touches 182',   type: 'touch' },
    ]), [{ price: 185.5, quantity: 60 }, { price: 182, quantity: null }])
})

test('an unreadable leg fails soft rather than guessing a price', () => {
    assert.deepEqual(legLevels([]), [])
    assert.deepEqual(legLevels(undefined), [])
})

test('a monitored condition is never mistaken for a price', () => {
    // The regression: a loose trailing-number match reads "RSI closes below 30" as a stop at 30,
    // putting a figure in the stop box that is not a stop. The leaf TYPE is the gate, as on the
    // server — only a `touch` is a level the broker holds.
    assert.deepEqual(legLevels([{ condition: 'RSI closes below 30', type: 'structured' }]), [])
    assert.deepEqual(legLevels([{ condition: 'price closes below 100', type: 'structured' }]), [])
    assert.deepEqual(legLevels(['price touches 100']), [], 'a bare string is structured, never a touch')
})

test('a mixed leg shows the rungs it does hold and skips the ones it cannot', () => {
    // Dropping the whole leg because one condition lives on the monitor would hide a real
    // resting order; showing the monitored one as a price would invent one.
    assert.deepEqual(legLevels([
        { condition: 'RSI closes below 30', type: 'structured' },
        { condition: 'price touches 185.5', type: 'touch' },
    ]), [{ price: 185.5, quantity: null }])
})

test('an empty leg still gives the form one row to type into', () => {
    assert.deepEqual(levelRows([]), [{ price: '', quantity: '' }])
    assert.deepEqual(levelRows([{ price: 185.5, quantity: null }]), [{ price: '185.5', quantity: '' }])
    assert.deepEqual(levelRows([{ price: 185.5, quantity: 60 }]),   [{ price: '185.5', quantity: '60' }])
})

// ── Protective levels stated WITH the entry ───────────────────────────────────
// The compose form now sends a stop and a target alongside the entry, and they are placed for
// real. That moves two silent failures onto this path: a level measured against the wrong
// reference (which clears a stop that is actually on the wrong side of the fill), and a level the
// user typed that the wire quietly drops (a trade that goes on believing it has a stop).

test('a resting entry measures its exits against its OWN trigger, not the market', () => {
    // Long limit at 95 while the market is 100. A stop at 98 is ABOVE the fill and must be
    // questioned, even though it is comfortably below the current price.
    assert.equal(composeReferencePrice({ orderType: 'limit', price: 95, quote: 100 }), 95)
    assert.equal(composeReferencePrice({ orderType: 'stop',  price: 105, quote: 100 }), 105)
})

test('a market entry measures its exits against the quote — there is no trigger to use', () => {
    assert.equal(composeReferencePrice({ orderType: 'market', price: '', quote: 100 }), 100)
    assert.equal(composeReferencePrice({ orderType: 'market', price: '', quote: null }), null)
    // A resting type with the price box still empty has nothing to measure against yet.
    assert.equal(composeReferencePrice({ orderType: 'limit', price: '', quote: 100 }), null)
})

test('the wrong-side stop a resting entry hides is caught', () => {
    const warns = composeWarnings({ orderType: 'limit', direction: 'long', price: 95, quote: 100, stops: rows(98) })
    assert.equal(warns.length, 1)
    assert.match(warns[0], /stop/)
    // Against the quote it would have looked fine — that is the bug this reference choice avoids.
    assert.equal(exitLevelWarning({ leg: 'stop', direction: 'long', price: 98, reference: 100 }), null)
})

test('an EMPTY protective box is not a price of zero', () => {
    // Number('') is 0, and 0 is below every reference — a blank target would otherwise warn
    // "would fill immediately" on every long ticket.
    assert.deepEqual(composeWarnings({ orderType: 'market', direction: 'long', price: '', quote: 100, stops: rows(''), tps: rows('') }), [])
    assert.deepEqual(composeWarnings({ orderType: 'market', direction: 'long', price: '', quote: 100 }), [])
})

test('a correctly-placed pair on either side is silent', () => {
    assert.deepEqual(composeWarnings({ orderType: 'market', direction: 'long',  price: '', quote: 100, stops: rows(95),  tps: rows(110) }), [])
    assert.deepEqual(composeWarnings({ orderType: 'market', direction: 'short', price: '', quote: 100, stops: rows(105), tps: rows(90) }), [])
})

test('a whole LADDER on the right side is silent, and one bad rung in it is not', () => {
    assert.deepEqual(composeWarnings({ orderType: 'market', direction: 'long', price: '', quote: 100, tps: rows(105, 110, 120) }), [])
    const warns = composeWarnings({ orderType: 'market', direction: 'long', price: '', quote: 100, tps: rows(105, 95, 120) })
    assert.equal(warns.length, 1, 'the rung below the market — the other two are fine')
    assert.match(warns[0], /target/)
})

test('two rungs wrong the same way say it once — it is one thing to fix', () => {
    const warns = composeWarnings({ orderType: 'market', direction: 'long', price: '', quote: 100, tps: rows(90, 95) })
    assert.equal(warns.length, 1)
})

test('both legs on the wrong side produce one warning each, in field order', () => {
    const warns = composeWarnings({ orderType: 'market', direction: 'long', price: '', quote: 100, stops: rows(110), tps: rows(90) })
    assert.equal(warns.length, 2)
    assert.match(warns[0], /stop/)
    assert.match(warns[1], /target/)
})

test('the entry trigger is still reported first, ahead of the exits', () => {
    const warns = composeWarnings({ orderType: 'stop', direction: 'long', price: 95, quote: 100, stops: rows(99) })
    assert.match(warns[0], /above the market/)   // the trigger — read the form top-down
})

// ── What actually goes on the wire ────────────────────────────────────────────

test('a filled leg becomes a ladder, an untouched one becomes null', () => {
    assert.deepEqual(protectiveLevels({ stops: rows('95.5'), tps: rows('110') }), { stop: [{ price: 95.5 }], tp: [{ price: 110 }] })
    assert.deepEqual(protectiveLevels({ stops: rows(''), tps: rows('') }), { stop: null, tp: null })
    assert.deepEqual(protectiveLevels({}), { stop: null, tp: null })
})

test('a rung that names its slice carries it; one that does not stays silent about size', () => {
    // An ABSENT quantity is the instruction "share the rest of the position" — sending 0 would
    // ask the broker for nothing, which is a different and much quieter failure.
    assert.deepEqual(
        protectiveLevels({ tps: rows({ price: '110', quantity: '60' }, { price: '120', quantity: '' }) }).tp,
        [{ price: 110, quantity: 60 }, { price: 120 }],
    )
})

test('blank rungs are dropped without collapsing the ones around them', () => {
    // The form always keeps a spare row to type into; it must not reach the wire.
    assert.deepEqual(
        protectiveLevels({ stops: rows('95', '', '92') }).stop,
        [{ price: 95 }, { price: 92 }],
    )
    // Nothing unusable is ever sent — placementBlocker refuses it first, and this is the second
    // line: a 0 or a negative is a missing rung, never a price of 0.
    assert.deepEqual(protectiveLevels({ stops: rows('0', '-5') }), { stop: null, tp: null })
})

// ── The quantity guard ────────────────────────────────────────────────────────
// Every rung of one leg closes part of the SAME position. A 60 + 60 ladder behind 100 does not
// leave 20 unsold — it sends 120, and on a hedging account the extra 20 OPENS a position the
// other way. The server caps it too (an agent can author a leg as well); this is the refusal the
// user can still fix, with both numbers named.

test('a leg may claim the whole position, and not one unit more', () => {
    assert.equal(legBlocker('stop', rows({ price: '95', quantity: '100' }), 100), null)
    assert.equal(legBlocker('tp', rows({ price: '110', quantity: '40' }, { price: '120', quantity: '60' }), 100), null)
    assert.match(legBlocker('tp', rows({ price: '110', quantity: '60' }, { price: '120', quantity: '60' }), 100), /120.*more than the 100/)
})

test('the refusal names both numbers, because that is what makes it fixable', () => {
    const msg = legBlocker('stop', rows({ price: '95', quantity: '7' }), 5)
    assert.match(msg, /stop/)
    assert.match(msg, /\b7\b/)
    assert.match(msg, /\b5\b/)
})

test('blank sizes ask for nothing — an unsized ladder is always allowed', () => {
    // Blank means "share what is left", which the server then splits. It can never over-ask.
    assert.equal(legBlocker('tp', rows(110, 120, 130), 1), null)
    assert.equal(rowsAskedTotal(rows(110, 120)), 0)
    assert.equal(rowsAskedTotal(rows({ price: '110', quantity: '40' }, { price: '120', quantity: '' })), 40)
})

test('hand-typed sizes that sum by floating point are not refused', () => {
    // 0.1 + 0.2 is 0.30000000000000004. A lot-sized ladder must not be rejected for that.
    assert.equal(legBlocker('tp', rows({ price: '110', quantity: '0.1' }, { price: '120', quantity: '0.2' }), 0.3), null)
})

test('a size with no price to come off at is refused, not dropped', () => {
    assert.match(legBlocker('stop', rows({ price: '', quantity: '50' }), 100), /no price/)
})

test('a typed-but-unusable protective level BLOCKS rather than being dropped', () => {
    const base = { symbol: 'AAPL', quantity: 1, orderType: 'market', price: '', accountIds: ['a1'] }
    assert.equal(placementBlocker(base), null)
    assert.equal(placementBlocker({ ...base, stops: rows(''), tps: rows('') }), null, 'blank is a legitimate no-stop ticket')
    assert.match(placementBlocker({ ...base, stops: rows('0') }), /stop/)
    assert.match(placementBlocker({ ...base, stops: rows('abc') }), /stop/)
    assert.match(placementBlocker({ ...base, tps: rows('-2') }), /target/)
    assert.match(placementBlocker({ ...base, tps: rows({ price: '110', quantity: 'abc' }) }), /size for the target/)
})

test('the protective check sits AFTER the entry fields and BEFORE the account', () => {
    // Order is the whole contract of this function: report what to fix first, top of the form down.
    const bad = rows('0')
    assert.match(placementBlocker({ symbol: '', quantity: 0, orderType: 'market', stops: bad, accountIds: [] }), /ticker/)
    assert.match(placementBlocker({ symbol: 'AAPL', quantity: 0, orderType: 'market', stops: bad, accountIds: [] }), /quantity/)
    assert.match(placementBlocker({ symbol: 'AAPL', quantity: 1, orderType: 'limit', price: 0, stops: bad, accountIds: [] }), /limit price/)
    assert.match(placementBlocker({ symbol: 'AAPL', quantity: 1, orderType: 'market', stops: bad, accountIds: [] }), /stop/)
    // And the stop is reported before the target, top-down again.
    assert.match(placementBlocker({ symbol: 'AAPL', quantity: 1, orderType: 'market', stops: bad, tps: bad, accountIds: [] }), /stop/)
})
