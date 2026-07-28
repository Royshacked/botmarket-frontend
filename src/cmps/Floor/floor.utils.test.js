// Pure-function tests for the Floor's shaping helpers.
// Node's built-in harness:  node --test src/cmps/Floor/
import test from 'node:test'
import assert from 'node:assert/strict'
import { positionsByAccount, groupByDay, tradeFloorItems } from './floor.utils.js'

const pos = (over = {}) => ({
    id: 'p1', broker: 'ctrader', accountId: 'A1', accountNo: '111',
    symbol: 'US100', direction: 'long', volume: 1, entryPrice: 100, pnl: 10, currency: 'USD',
    ...over,
})

// ── positionsByAccount ────────────────────────────────────────────────────────

test('positions collapse into one group per account', () => {
    const groups = positionsByAccount([
        pos({ id: 'p1' }), pos({ id: 'p2' }), pos({ id: 'p3', accountId: 'A2', accountNo: '222' }),
    ])
    assert.equal(groups.length, 2)
    assert.equal(groups[0].positions.length, 2)
    assert.equal(groups[1].positions.length, 1)
})

// The reason the key is broker+account and not account alone.
test('the same account number at two brokers stays two groups', () => {
    const groups = positionsByAccount([
        pos({ id: 'p1', broker: 'ctrader', accountId: '999', accountNo: '999' }),
        pos({ id: 'p2', broker: 'ibkr',    accountId: '999', accountNo: '999' }),
    ])
    assert.equal(groups.length, 2)
})

test('first-seen account order is preserved', () => {
    const groups = positionsByAccount([
        pos({ id: 'p1', accountId: 'B', accountNo: 'bbb' }),
        pos({ id: 'p2', accountId: 'A', accountNo: 'aaa' }),
    ])
    assert.deepEqual(groups.map(g => g.accountNo), ['bbb', 'aaa'])
})

test('each group carries a summary of its own positions only', () => {
    const groups = positionsByAccount([
        pos({ id: 'p1', pnl: 10 }), pos({ id: 'p2', pnl: 5 }),
        pos({ id: 'p3', accountId: 'A2', accountNo: '222', pnl: -3 }),
    ])
    assert.equal(groups[0].summary.pnl, 15)
    assert.equal(groups[1].summary.pnl, -3)
})

test('a paper position is tagged paper, not live', () => {
    const [g] = positionsByAccount([pos({ broker: 'paper', accountId: 'paper-u1' })])
    assert.equal(g.workspace, 'paper')
})

test('a missing accountNo falls back to the accountId rather than blank', () => {
    const [g] = positionsByAccount([pos({ accountNo: undefined, accountId: 'A9' })])
    assert.equal(g.accountNo, 'A9')
})

test('no positions yields no groups', () => {
    assert.deepEqual(positionsByAccount([]), [])
    assert.deepEqual(positionsByAccount(), [])
})

// ── groupByDay ────────────────────────────────────────────────────────────────

test('consecutive same-date items land in one day group', () => {
    const groups = groupByDay([
        { date: '2026-07-28', symbol: 'A' },
        { date: '2026-07-28', symbol: 'B' },
        { date: '2026-07-29', symbol: 'C' },
    ])
    assert.deepEqual(groups.map(g => g.date), ['2026-07-28', '2026-07-29'])
    assert.equal(groups[0].items.length, 2)
})

// It groups CONSECUTIVE runs — it does not sort. The feeds arrive sorted; if one ever stops
// being sorted this is the behaviour that shows it, rather than hiding it behind a re-sort.
test('a repeated date after a gap opens a new group', () => {
    const groups = groupByDay([
        { date: '2026-07-28' }, { date: '2026-07-29' }, { date: '2026-07-28' },
    ])
    assert.equal(groups.length, 3)
})

test('an empty feed yields no groups', () => {
    assert.deepEqual(groupByDay([]), [])
    assert.deepEqual(groupByDay(), [])
})

// ── tradeFloorItems ───────────────────────────────────────────────────────────

const call  = (over = {}) => ({ id: 'c1', asset: 'NVDA', direction: 'long',  status: 'looking', ...over })
const setup = (over = {}) => ({ id: 's1', asset: 'SPY',  direction: 'short', status: 'waiting', ...over })

test('calls and setups arrive on one list, each tagged with its kind', () => {
    const items = tradeFloorItems([call()], [setup()])
    assert.deepEqual(items.map(i => i.kind), ['call', 'setup'])
})

test('status rides through untouched so the shared bucketer can group both kinds', () => {
    const items = tradeFloorItems([call({ status: 'hit' })], [setup({ status: 'long' })])
    assert.deepEqual(items.map(i => i.status), ['hit', 'long'])
})

test('the entity is carried so a row click can open it without a re-fetch', () => {
    const c = call()
    const [item] = tradeFloorItems([c], [])
    assert.equal(item.entity, c)
})

// Kairos writes `asset`; older/other shapes carry `symbol`. Neither should render as blank.
test('ticker falls back from asset to symbol', () => {
    const [a] = tradeFloorItems([call({ asset: undefined, symbol: 'AAPL' })], [])
    assert.equal(a.ticker, 'AAPL')
})

test('an empty desk yields an empty list', () => {
    assert.deepEqual(tradeFloorItems([], []), [])
    assert.deepEqual(tradeFloorItems(), [])
})
