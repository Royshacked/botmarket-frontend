import { test } from 'node:test'
import assert from 'node:assert/strict'

import { blendLegs, foldHoldingLegs } from './tradeIdea.utils.js'

// A holding can sit behind more than one broker position: a book placed across two accounts, or a
// scale-in on a HEDGING venue (cTrader/MT5), which cannot grow a position and opens a sibling
// instead. Listed one row per position, the book showed the same ticker twice at two prices —
// neither of them the size the user owns. These fold into the holding they really are.

const leg = (over = {}) => ({
    id: 'p1', broker: 'paper', accountId: 'a1', accountNo: '5001', symbol: 'MU', direction: 'long',
    volume: 10, entryPrice: 987.2367, currentPrice: 1000, pnl: 127.63, currency: 'USD',
    openedAt: 1_000, ...over,
})

const holding = (over = {}) => ({
    id: 'h1', asset: 'MU', portfolioId: 'pf1', portfolioName: 'AI Capex',
    brokerOrders: [{ broker: 'paper', accountId: 'a1', positionId: 'p1' }],
    ...over,
})

// ── blendLegs ─────────────────────────────────────────────────────────────────────────────────────

test('the blended price is SIZE-weighted, not the mean of the legs', () => {
    // The MU case: 10 @ 987.2367 and 3 @ 1018.4118.
    const b = blendLegs([leg(), leg({ id: 'p2', volume: 3, entryPrice: 1018.4118, openedAt: 2_000 })])
    assert.equal(b.volume, 13)
    assert.equal(Number(b.entryPrice.toFixed(2)), 994.43)
    // The mean would say 1002.82 — the number the unfolded rows implied between them.
    assert.notEqual(Number(b.entryPrice.toFixed(2)), 1002.82)
})

test('money P&L sums and the earliest entry wins', () => {
    const b = blendLegs([
        leg({ pnl: 100, openedAt: 5_000 }),
        leg({ id: 'p2', volume: 3, pnl: -20, openedAt: 2_000 }),
    ])
    assert.equal(b.pnl, 80)
    assert.equal(b.openedAt, 2_000, 'the holding has been on since its FIRST leg')
})

test('an unpriced leg cannot drag the blended mark into a fake loss', () => {
    // A leg the mark loop has not reached yet: it contributes its ENTRY, not a zero.
    const b = blendLegs([
        leg({ volume: 10, entryPrice: 100, currentPrice: 110 }),
        leg({ id: 'p2', volume: 10, entryPrice: 100, currentPrice: null }),
    ])
    assert.equal(b.currentPrice, 105, '(110×10 + 100×10) / 20 — not (110×10 + 0) / 20')
})

test('P&L stays null when nothing in the holding is priced — never a fabricated 0', () => {
    const b = blendLegs([leg({ pnl: null }), leg({ id: 'p2', pnl: null })])
    assert.equal(b.pnl, null)
})

test('a holding spread across accounts names no single account', () => {
    const one  = blendLegs([leg(), leg({ id: 'p2' })])
    const many = blendLegs([leg(), leg({ id: 'p2', accountId: 'a2', accountNo: '5002' })])
    assert.equal(one.accountNo, '5001', 'uniform — the normal case, a scale-in lands on the same account')
    assert.equal(many.accountNo, null)
})

test('the blended row carries its legs and is marked folded', () => {
    const b = blendLegs([leg(), leg({ id: 'p2' })])
    assert.equal(b.folded, true)
    assert.equal(b.legs.length, 2)
})

// ── foldHoldingLegs ───────────────────────────────────────────────────────────────────────────────

test('two positions of one holding fold into a single row', () => {
    const positions = [leg(), leg({ id: 'p2', volume: 3, entryPrice: 1018.4118 })]
    const ideas     = [holding({ brokerOrders: [
        { broker: 'paper', accountId: 'a1', positionId: 'p1' },
        { broker: 'paper', accountId: 'a1', positionId: 'p2' },
    ] })]

    const rows = foldHoldingLegs(positions, ideas)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].ownerId, 'h1')
    assert.equal(rows[0].legs.length, 2)
    assert.equal(rows[0].position.volume, 13)
})

test('a single-position holding passes straight through — the same object, untouched', () => {
    const p    = leg()
    const rows = foldHoldingLegs([p], [holding()])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].position, p, 'not a copy: the common case must render exactly as before')
    assert.equal(rows[0].position.folded, undefined)
})

test('two DIFFERENT holdings on the same ticker stay apart', () => {
    // A portfolio holding and a Mentor setup can both be long MU. They are not one position.
    const positions = [leg(), leg({ id: 'p2' })]
    const ideas     = [
        holding({ id: 'h1', brokerOrders: [{ broker: 'paper', accountId: 'a1', positionId: 'p1' }] }),
        holding({ id: 'h2', brokerOrders: [{ broker: 'paper', accountId: 'a1', positionId: 'p2' }] }),
    ]
    assert.equal(foldHoldingLegs(positions, ideas).length, 2)
})

test('with no ideas — the read-only dialog — every position is its own row', () => {
    const rows = foldHoldingLegs([leg(), leg({ id: 'p2' })], [])
    assert.equal(rows.length, 2)
    assert.ok(rows.every(r => r.ownerId === null && r.legs.length === 1))
})

test('an orphan position keeps its row rather than joining anyone', () => {
    const rows = foldHoldingLegs([leg(), leg({ id: 'pX' })], [holding()])
    assert.equal(rows.length, 2)
    assert.equal(rows.find(r => r.ownerId === null).position.id, 'pX')
})

test('order is first-seen, so folding never reshuffles the book', () => {
    const positions = [
        leg({ id: 'pA', symbol: 'AVGO' }),
        leg({ id: 'p1' }),
        leg({ id: 'p2' }),
        leg({ id: 'pZ', symbol: 'XLU' }),
    ]
    const ideas = [holding({ brokerOrders: [
        { broker: 'paper', accountId: 'a1', positionId: 'p1' },
        { broker: 'paper', accountId: 'a1', positionId: 'p2' },
    ] })]
    assert.deepEqual(foldHoldingLegs(positions, ideas).map(r => r.position.symbol), ['AVGO', 'MU', 'XLU'])
})

test('an empty book folds to nothing', () => {
    assert.deepEqual(foldHoldingLegs([], []), [])
    assert.deepEqual(foldHoldingLegs(), [])
})
