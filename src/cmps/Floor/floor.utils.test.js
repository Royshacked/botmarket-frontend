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

// ── the book tier inside an account ───────────────────────────────────────────
// An idea links to a position through brokerOrders (broker + accountId + positionId), which is the
// same join the rest of the app uses — so these fixtures have to carry all three.
const idea = (over = {}) => ({
    id: 'i1', portfolioId: 'pf1', portfolioName: 'Core',
    brokerOrders: [{ positionId: 'p1', broker: 'ctrader', accountId: 'A1' }],
    ...over,
})

test('a position whose idea is in a portfolio lands in a book, not loose', () => {
    const [g] = positionsByAccount([pos({ id: 'p1' })], [idea()])
    assert.equal(g.books.length, 1)
    assert.equal(g.books[0].name, 'Core')
    assert.equal(g.books[0].positions.length, 1)
    assert.equal(g.loose.length, 0)
})

test('a position with no portfolio stays loose beside the books', () => {
    const [g] = positionsByAccount([pos({ id: 'p1' }), pos({ id: 'p2' })], [idea()])
    assert.equal(g.books[0].positions.length, 1)
    assert.deepEqual(g.loose.map(p => p.id), ['p2'])
})

// The tier order is account → book → leg precisely because a book can span accounts: each account
// shows the book with only the legs IT holds, so neither row double-counts the other's money.
test('a book spanning two accounts becomes one row per account, split by account', () => {
    const groups = positionsByAccount(
        [pos({ id: 'p1' }), pos({ id: 'p2', accountId: 'A2', accountNo: '222' })],
        [idea({ brokerOrders: [
            { positionId: 'p1', broker: 'ctrader', accountId: 'A1' },
            { positionId: 'p2', broker: 'ctrader', accountId: 'A2' },
        ] })],
    )
    assert.deepEqual(groups.map(g => g.books.length), [1, 1])
    // Distinct keys, or expanding the book in one account would expand it in the other.
    assert.notEqual(groups[0].books[0].key, groups[1].books[0].key)
    assert.deepEqual(groups[0].books[0].positions.map(p => p.id), ['p1'])
    assert.deepEqual(groups[1].books[0].positions.map(p => p.id), ['p2'])
})

test('a book carries a summary of its own legs only', () => {
    const [g] = positionsByAccount(
        [pos({ id: 'p1', pnl: 10 }), pos({ id: 'p2', pnl: 99 })],
        [idea()],
    )
    assert.equal(g.books[0].summary.count, 1)
    assert.equal(g.books[0].summary.pnl, 10)
    // ...while the account still totals everything under it, book legs included.
    assert.equal(g.summary.pnl, 109)
})

// An unnamed book is still a book — the row must not render blank.
test('a portfolio with no name falls back to "Portfolio"', () => {
    const [g] = positionsByAccount([pos({ id: 'p1' })], [idea({ portfolioName: undefined })])
    assert.equal(g.books[0].name, 'Portfolio')
})

// The pre-tier behaviour, kept: with no ideas — or for an orphan broker position whose idea was
// deleted — every position renders flat under its account exactly as before.
test('with no ideas every position is loose and no book row appears', () => {
    const [g] = positionsByAccount([pos({ id: 'p1' }), pos({ id: 'p2' })])
    assert.deepEqual(g.books, [])
    assert.equal(g.loose.length, 2)
})

test('an idea with no portfolioId leaves its position loose', () => {
    const [g] = positionsByAccount([pos({ id: 'p1' })], [idea({ portfolioId: undefined })])
    assert.deepEqual(g.books, [])
    assert.equal(g.loose.length, 1)
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
