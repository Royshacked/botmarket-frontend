import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeOrderRisk, describeAllocation, fmtPrice } from './orderRisk.util.js'

// What the approval screen is allowed to claim. The convention under test is the PESSIMISTIC one
// ported from computeRR (backend services/setup.schema.js): worst entry, furthest stop, nearest
// target — because an order-confirm dialog is the last place a trade should be flattered.

const lvl = (kind, price) => ({ kind, price, label: kind })
const ORDERS = [{ quantity: 10 }, { quantity: 5 }]

// ── Leg selection ─────────────────────────────────────────────────────────────

test('a long takes the worst entry, the furthest stop and the nearest target', () => {
    const r = summarizeOrderRisk({
        direction: 'long', orders: ORDERS, assetClass: 'stock',
        levels: [lvl('entry', 100), lvl('entry', 102), lvl('stop', 95), lvl('stop', 97), lvl('tp', 110), lvl('tp', 120)],
    })
    assert.equal(r.entry, 102, 'the entry you paid up for')
    assert.equal(r.stop, 95, 'the failsafe at the far side = the most the plan admits')
    assert.deepEqual(r.targets, [110, 120], 'ordered by which is reached first')
    assert.equal(r.stopDistance, 7)
    assert.equal(r.rr, 1.14, 'reward measured to the NEAREST target: (110-102)/7')
})

test('a short mirrors every leg', () => {
    const r = summarizeOrderRisk({
        direction: 'short', orders: ORDERS, assetClass: 'stock',
        levels: [lvl('entry', 100), lvl('entry', 102), lvl('stop', 105), lvl('stop', 107), lvl('tp', 90), lvl('tp', 80)],
    })
    assert.equal(r.entry, 100, 'the worst short fill is the LOWEST')
    assert.equal(r.stop, 107)
    assert.deepEqual(r.targets, [90, 80])
    assert.equal(r.stopDistance, 7)
    assert.equal(r.rr, 1.43)   // (100-90)/7
})

test('legs are picked by PRICE, never by array position', () => {
    // Levels arrive in derivation order, so a furthest-first list must not win the rr.
    const r = summarizeOrderRisk({
        direction: 'long', orders: [{ quantity: 1 }], assetClass: 'stock',
        levels: [lvl('tp', 130), lvl('tp', 105), lvl('entry', 100), lvl('stop', 95)],
    })
    assert.equal(r.rr, 1, 'nearest target 105, not 130')
})

// ── Risk arithmetic ───────────────────────────────────────────────────────────

test('risk is stop distance times the WHOLE plan, not one leg', () => {
    const r = summarizeOrderRisk({
        direction: 'long', orders: ORDERS, assetClass: 'stock',
        levels: [lvl('entry', 100), lvl('stop', 96), lvl('tp', 110)],
    })
    assert.equal(r.quantity, 15, 'both order legs')
    assert.equal(r.riskAmount, 60)
    assert.equal(r.riskIsCurrency, true)
    assert.equal(r.stopPct, 4)
})

test('a futures order reports risk but refuses to call it cash', () => {
    const r = summarizeOrderRisk({
        direction: 'long', orders: [{ quantity: 2 }], assetClass: 'futures',
        levels: [lvl('entry', 20000), lvl('stop', 19950), lvl('tp', 20200)],
    })
    assert.equal(r.riskAmount, 100)
    assert.equal(r.riskIsCurrency, false, 'a contract multiplier we do not have would change this')
    assert.match(r.warnings.join(' '), /contract or lot multiplier/)
})

// ── The warnings, which are the point ─────────────────────────────────────────

test('NO STOP is called out — the failure this dialog existed to hide', () => {
    const r = summarizeOrderRisk({
        direction: 'long', orders: ORDERS, assetClass: 'stock',
        levels: [lvl('entry', 100), lvl('tp', 110)],
    })
    assert.equal(r.stop, null)
    assert.equal(r.riskAmount, null, 'no stop → no honest risk number')
    assert.equal(r.rr, null)
    assert.match(r.warnings.join(' '), /No stop on this order/)
})

test('a missing target is stated, not silently omitted', () => {
    const r = summarizeOrderRisk({
        direction: 'long', orders: ORDERS, assetClass: 'stock',
        levels: [lvl('entry', 100), lvl('stop', 95)],
    })
    assert.deepEqual(r.targets, [])
    assert.equal(r.rr, null)
    assert.match(r.warnings.join(' '), /No take-profit/)
})

test('a stop on the wrong side is a broken plan, not a positive risk number', () => {
    // Math.abs here would quietly turn an impossible plan into a plausible one.
    const r = summarizeOrderRisk({
        direction: 'long', orders: ORDERS, assetClass: 'stock',
        levels: [lvl('entry', 100), lvl('stop', 105), lvl('tp', 110)],
    })
    assert.equal(r.stopDistance, -5, 'reported signed')
    assert.equal(r.riskAmount, null, 'no risk figure is offered for an impossible plan')
    assert.equal(r.rr, null)
    assert.match(r.warnings.join(' '), /cannot lose the way it is written/)
})

test('a target on the losing side is called out', () => {
    const r = summarizeOrderRisk({
        direction: 'long', orders: ORDERS, assetClass: 'stock',
        levels: [lvl('entry', 100), lvl('stop', 95), lvl('tp', 90)],
    })
    assert.equal(r.rr, null)
    assert.match(r.warnings.join(' '), /losing side/)
})

// ── Market orders and empty input ─────────────────────────────────────────────

test('no entry level → entry is unknown, and nothing is invented from it', () => {
    const r = summarizeOrderRisk({
        direction: 'long', orders: ORDERS, assetClass: 'stock',
        levels: [lvl('stop', 95), lvl('tp', 110)],
    })
    assert.equal(r.entry, null, 'a market order has no authored entry')
    assert.equal(r.stop, 95, 'the levels it DOES have are still shown')
    assert.equal(r.stopDistance, null)
    assert.equal(r.rr, null)
})

test('a resting entry falls back to its trigger price', () => {
    const r = summarizeOrderRisk({
        direction: 'long', orders: [{ quantity: 1 }], assetClass: 'stock',
        levels: [lvl('stop', 95), lvl('tp', 110)], fallbackEntry: 100,
    })
    assert.equal(r.entry, 100)
    assert.equal(r.stopDistance, 5)
    assert.equal(r.rr, 2)
})

test('an entry LEVEL beats the fallback', () => {
    const r = summarizeOrderRisk({
        direction: 'long', orders: [{ quantity: 1 }],
        levels: [lvl('entry', 101), lvl('stop', 95)], fallbackEntry: 100,
    })
    assert.equal(r.entry, 101)
})

test('nothing at all degrades to a coherent, empty answer', () => {
    const r = summarizeOrderRisk({})
    assert.equal(r.entry, null)
    assert.equal(r.stop, null)
    assert.deepEqual(r.targets, [])
    assert.equal(r.quantity, null)
    assert.equal(r.riskAmount, null)
    assert.ok(r.warnings.length, 'silence about a plan with no stop would be the bug')
})

test('junk levels and quantities are dropped, not propagated as NaN', () => {
    const r = summarizeOrderRisk({
        direction: 'long', assetClass: 'stock',
        orders: [{ quantity: 10 }, { quantity: null }, { quantity: 'x' }],
        levels: [lvl('entry', 100), lvl('stop', null), lvl('stop', 0), lvl('stop', 95), { kind: 'tp' }, lvl('tp', 110)],
    })
    assert.equal(r.quantity, 10)
    assert.equal(r.stop, 95, 'null and 0 are not prices')
    assert.deepEqual(r.targets, [110])
    assert.ok(Number.isFinite(r.riskAmount))
})

test('invalidation levels never leak into the trade legs', () => {
    const r = summarizeOrderRisk({
        direction: 'long', orders: [{ quantity: 1 }],
        levels: [lvl('entry', 100), lvl('stop', 95), lvl('invalidation', 80), lvl('zone', 99), lvl('ref', 120)],
    })
    assert.equal(r.stop, 95, 'an invalidation band is not a stop')
    assert.deepEqual(r.targets, [], 'a reference level is not a target')
})

// ── Formatting ────────────────────────────────────────────────────────────────

test('prices keep precision where the instrument needs it', () => {
    assert.equal(fmtPrice(1.23456), '1.23456', 'an FX rate keeps its pips')
    assert.equal(fmtPrice(250.5), '250.5')
    assert.equal(fmtPrice(20000), '20000')
    assert.equal(fmtPrice(null), '—')
    assert.equal(fmtPrice('nope'), '—')
})

// ── describeAllocation ────────────────────────────────────────────────────────
// The rule being explained: the MAIN account trades the size you set, every other account scales
// by its balance ratio to it. Mirrors buildOrderPlan (backend) / buildOrderPreview (legacy idea).

test('the share is the ratio actually applied, and the main row has none', () => {
    const a = describeAllocation([
        { accountId: 'A', quantity: 10, isMain: true },
        { accountId: 'B', quantity: 4.2 },
    ], 'A')
    assert.equal(a.mainQuantity, 10)
    assert.equal(a.rows[0].share, null, 'the main row IS the base — it has no share of anything')
    assert.equal(a.rows[1].share, 0.42)
    assert.equal(a.total, 14.2)
    assert.equal(a.scaled, true)
})

test('a raw backend plan has no isMain flag — it is derived from the id', () => {
    // This is what a `setup` hands over: buildOrderPlan stamps no isMain.
    const a = describeAllocation([
        { accountId: 'A', quantity: 5 },
        { accountId: 'B', quantity: 10 },
    ], 'B')
    assert.equal(a.rows[1].isMain, true)
    assert.equal(a.rows[0].isMain, false)
    assert.equal(a.mainQuantity, 10)
    assert.equal(a.rows[0].share, 0.5)
})

test('equal balances scale to nothing, so nothing is explained', () => {
    // Narrating a rule that visibly did nothing is noise on the screen that should be quiet.
    const a = describeAllocation([
        { accountId: 'A', quantity: 10, isMain: true },
        { accountId: 'B', quantity: 10 },
    ], 'A')
    assert.equal(a.scaled, false)
    assert.equal(a.total, 20, 'the total is still worth showing')
})

test('a single account is never "scaled"', () => {
    const a = describeAllocation([{ accountId: 'A', quantity: 10 }], 'A')
    assert.equal(a.scaled, false)
    assert.equal(a.rows[0].isMain, true)
    assert.equal(a.total, 10)
})

test('an unresolvable main account falls back to the first row, as both builders do', () => {
    const a = describeAllocation([{ accountId: 'A', quantity: 8 }, { accountId: 'B', quantity: 4 }], null)
    assert.equal(a.rows[0].isMain, true)
    assert.equal(a.rows[1].share, 0.5)
})

test('a main account id that matches no row still yields exactly one main', () => {
    const a = describeAllocation([{ accountId: 'A', quantity: 8 }, { accountId: 'B', quantity: 4 }], 'GONE')
    assert.equal(a.rows.filter(r => r.isMain).length, 1)
})

test('ids are compared as strings — a numeric account id still matches', () => {
    const a = describeAllocation([{ accountId: 123, quantity: 5 }, { accountId: 456, quantity: 10 }], 456)
    assert.equal(a.rows[1].isMain, true)
})

test('a zero-quantity main yields no share rather than a division by zero', () => {
    const a = describeAllocation([{ accountId: 'A', quantity: 0, isMain: true }, { accountId: 'B', quantity: 5 }], 'A')
    assert.equal(a.rows[1].share, null, 'Infinity is not an explanation')
    assert.equal(a.scaled, false)
    assert.equal(a.total, 5)
})

test('the original order fields survive — this annotates, it does not replace', () => {
    const a = describeAllocation([{ accountId: 'A', quantity: 10, broker: 'ctrader', accountNo: '77', type: 'market' }], 'A')
    assert.equal(a.rows[0].broker, 'ctrader')
    assert.equal(a.rows[0].accountNo, '77')
    assert.equal(a.rows[0].type, 'market')
})

test('an empty plan is a coherent empty answer', () => {
    assert.deepEqual(describeAllocation([], 'A'), { rows: [], total: null, mainQuantity: null, scaled: false })
    assert.deepEqual(describeAllocation(null, null), { rows: [], total: null, mainQuantity: null, scaled: false })
})
