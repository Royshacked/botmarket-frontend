// Pure-function tests for the positions helpers in tradeIdea.utils.js.
// The frontend has no test runner wired up, so these run on Node's built-in
// harness with zero extra dependencies:  node --test src/cmps/TradeIdeas/
import test from 'node:test'
import assert from 'node:assert/strict'
import {
    groupPositions, positionOwnerIdea, positionBelongsToIdea, positionOpenTarget, summarizePositions,
    positionPnlPct, positionWorkspace, formatPrice, formatPnlPct,
} from './tradeIdea.utils.js'

// A broker order link + matching position share broker + accountId + positionId.
const link = (positionId, broker = 'ctrader', accountId = 'A1') => ({ positionId, broker, accountId })
const pos  = (id, over = {}) => ({
    id, broker: 'ctrader', accountId: 'A1', symbol: 'US100',
    direction: 'long', entryPrice: 100, currentPrice: 103, pnl: 30, volume: 1, ...over,
})
const idea = (id, over = {}) => ({ id, brokerOrders: [link(id)], savedAt: 1000, ...over })

test('positionBelongsToIdea matches on broker + account + positionId', () => {
    const i = idea('p1')
    assert.equal(positionBelongsToIdea(pos('p1'), i), true)
    assert.equal(positionBelongsToIdea(pos('p1', { accountId: 'A2' }), i), false) // same id, other account
    assert.equal(positionBelongsToIdea(pos('p1', { broker: 'ibkr' }), i), false)  // same id, other broker
    assert.equal(positionBelongsToIdea(pos('other'), i), false)
})

test('positionOwnerIdea finds the linking idea, else null', () => {
    const ideas = [idea('p1'), idea('p2')]
    assert.equal(positionOwnerIdea(pos('p2'), ideas)?.id, 'p2')
    assert.equal(positionOwnerIdea(pos('ghost'), ideas), null) // orphan broker position
})

test('positionOpenTarget: a stamped callId routes to its Call (full object when loaded)', () => {
    const call = { id: 'call_1', asset: 'EXTR', status: 'long' }
    const p    = pos('px1', { callId: 'call_1' })
    const t    = positionOpenTarget(p, [], [call])
    assert.equal(t.kind, 'call')
    assert.equal(t.call, call)                        // loaded call → passed for instant render
})

test('positionOpenTarget: a stamped callId with the call not loaded falls back to the id', () => {
    const p = pos('px1', { callId: 'call_1' })
    const t = positionOpenTarget(p, [], [])           // call not in the list
    assert.deepEqual(t, { kind: 'call', call: 'call_1' })  // bare id → CallPage fetches it
})

test('positionOpenTarget: no callId routes to the owning idea, else null', () => {
    const ideas = [idea('p1')]
    assert.deepEqual(positionOpenTarget(pos('p1'), ideas, []), { kind: 'idea', idea: ideas[0] })
    assert.equal(positionOpenTarget(pos('orphan'), ideas, []), null)   // owner-less → no-op
})

test('positionOpenTarget: callId wins even when an idea also matches', () => {
    // A call position's execution idea is hidden from `ideas`, but guard the precedence anyway.
    const call  = { id: 'call_1' }
    const ideas = [idea('px1')]                        // would match by positionId
    const t     = positionOpenTarget(pos('px1', { callId: 'call_1' }), ideas, [call])
    assert.equal(t.kind, 'call')
})

test('groupPositions buckets portfolio positions and leaves the rest loose', () => {
    const ideas = [
        idea('p1', { portfolioId: 'PF', portfolioName: 'Tech', savedAt: 2000 }),
        idea('p2', { portfolioId: 'PF', portfolioName: 'Tech', savedAt: 2000 }),
        idea('s1'), // standalone idea (no portfolio)
    ]
    const positions = [pos('p1'), pos('p2'), pos('s1'), pos('orphan')]
    const { portfolios, loose } = groupPositions(positions, ideas)

    assert.equal(portfolios.length, 1)
    assert.equal(portfolios[0].portfolioId, 'PF')
    assert.equal(portfolios[0].name, 'Tech')
    assert.equal(portfolios[0].positions.length, 2)
    assert.equal(portfolios[0].ideas.length, 2)
    // Standalone idea's position + idea-less orphan both fall through to loose.
    assert.deepEqual(loose.map(p => p.id), ['s1', 'orphan'])
})

test('groupPositions keeps one idea+portfolio across N accounts as N rows', () => {
    // Same idea placed on two accounts → two positions, both under the portfolio.
    const i = idea('p1', {
        portfolioId: 'PF', portfolioName: 'Book',
        brokerOrders: [link('p1', 'ctrader', 'A1'), link('p1', 'ctrader', 'A2')],
    })
    const positions = [pos('p1', { accountId: 'A1' }), pos('p1', { accountId: 'A2' })]
    const { portfolios } = groupPositions(positions, [i])
    assert.equal(portfolios[0].positions.length, 2)
    assert.equal(portfolios[0].ideas.length, 1) // de-duped — one idea, two accounts
})

test('groupPositions splits each portfolio into per-account sub-groups', () => {
    const i1 = idea('p1', { portfolioId: 'PF', portfolioName: 'Book', brokerOrders: [link('p1', 'ctrader', 'A1')] })
    const i2 = idea('p2', { portfolioId: 'PF', portfolioName: 'Book', brokerOrders: [link('p2', 'ctrader', 'A2')] })
    const { portfolios } = groupPositions(
        [pos('p1', { accountId: 'A1', accountNo: '111' }), pos('p2', { accountId: 'A2', accountNo: '222' })],
        [i1, i2],
    )
    assert.equal(portfolios[0].accounts.length, 2)
    assert.deepEqual(portfolios[0].accounts.map(a => a.accountNo), ['111', '222'])
    // Single-account portfolio → one sub-group (renderer then skips the account layer).
    const single = groupPositions([pos('p1'), pos('p1', { id: 'p1' })], [idea('p1', { portfolioId: 'S' })])
    assert.equal(single.portfolios[0].accounts.length, 1)
})

test('summarizePositions aggregates count, P&L, return-on-cost %, entry time, uniformity', () => {
    const s = summarizePositions([
        { entryPrice: 100, volume: 2, pnl: 10, currency: 'USD', openedAt: 500, broker: 'ctrader', accountNo: '111' },
        { entryPrice: 50,  volume: 1, pnl: -5, currency: 'USD', openedAt: 300, broker: 'ctrader', accountNo: '111' },
    ])
    assert.equal(s.count, 2)
    assert.equal(s.pnl, 5)                 // 10 + (−5)
    assert.equal(s.pnlPct, 2)              // 5 / (100·2 + 50·1) × 100
    assert.equal(s.enteredAt, 300)         // earliest
    assert.equal(s.workspace, 'live')
    assert.equal(s.broker, 'ctrader')
    assert.equal(s.accountNo, '111')
})

test('summarizePositions nulls broker/account when mixed, and P&L when nothing is priced', () => {
    const mixed = summarizePositions([
        { entryPrice: 100, volume: 1, pnl: 1, broker: 'ctrader', accountNo: '111' },
        { entryPrice: 100, volume: 1, pnl: 1, broker: 'ibkr',    accountNo: '222' },
    ])
    assert.equal(mixed.broker, null)
    assert.equal(mixed.accountNo, null)

    const unpriced = summarizePositions([
        { entryPrice: 100, volume: 1, pnl: null },
        { entryPrice: 100, volume: 1, pnl: null },
    ])
    assert.equal(unpriced.pnl, null)       // no priced leg → '—', not 0
    assert.equal(unpriced.pnlPct, null)
    assert.deepEqual(summarizePositions([]), {
        count: 0, pnl: null, currency: null, pnlPct: null, enteredAt: null,
        workspace: 'live', broker: null, accountNo: null,
    })
})

test('groupPositions sorts portfolios by savedAt desc; empty inputs safe', () => {
    const ideas = [
        idea('a', { portfolioId: 'OLD', savedAt: 1000 }),
        idea('b', { portfolioId: 'NEW', savedAt: 5000 }),
    ]
    const { portfolios } = groupPositions([pos('a'), pos('b')], ideas)
    assert.deepEqual(portfolios.map(g => g.portfolioId), ['NEW', 'OLD'])
    assert.deepEqual(groupPositions([], []), { portfolios: [], loose: [] })
    assert.deepEqual(groupPositions([pos('x')], []).loose.map(p => p.id), ['x']) // no ideas → all loose
})

test('positionPnlPct is the direction-signed price move, null when unpriced', () => {
    assert.equal(positionPnlPct(pos('p', { entryPrice: 100, currentPrice: 103 })), 3)
    // short profits as price falls
    assert.equal(positionPnlPct(pos('p', { direction: 'short', entryPrice: 100, currentPrice: 90 })), 10)
    assert.equal(positionPnlPct(pos('p', { currentPrice: null })), null)       // no live mark yet
    assert.equal(positionPnlPct(pos('p', { currentPrice: 0 })), null)          // 0 = unpriced sentinel, not −100%
    assert.equal(positionPnlPct(pos('p', { entryPrice: 0, currentPrice: 5 })), null) // avoid /0
    assert.equal(positionPnlPct({}), null)
})

test('positionWorkspace derives from broker, falling back to the account-id prefix', () => {
    assert.equal(positionWorkspace({ broker: 'paper' }), 'paper')
    assert.equal(positionWorkspace({ broker: 'manual' }), 'manual')
    assert.equal(positionWorkspace({ broker: 'ctrader' }), 'live')
    assert.equal(positionWorkspace({ broker: 'ibkr' }), 'live')
    assert.equal(positionWorkspace({}), 'live')
    // broker field not the literal workspace name → resolve by virtual account id
    assert.equal(positionWorkspace({ broker: 'sim', accountId: 'paper-u1' }), 'paper')
    assert.equal(positionWorkspace({ broker: 'x',   accountId: 'manual-u1' }), 'manual')
    assert.equal(positionWorkspace({ broker: 'ctrader', accountId: '12345' }), 'live')
})

test('formatPrice keeps ≥2 decimals, up to 5 for sub-dollar/FX, em-dash for non-numbers', () => {
    assert.equal(formatPrice(100), '100.00')
    assert.equal(formatPrice(152.3), '152.30')
    assert.equal(formatPrice(1.08501), '1.08501')
    assert.equal(formatPrice(0.16234), '0.16234')
    assert.equal(formatPrice(null), '—')
    assert.equal(formatPrice(undefined), '—')
    assert.equal(formatPrice(NaN), '—')
})

test('formatPnlPct signs and suffixes, em-dash for null', () => {
    assert.equal(formatPnlPct(3), '+3.00%')
    assert.equal(formatPnlPct(-2.5), '-2.50%')
    assert.equal(formatPnlPct(0), '0.00%')
    assert.equal(formatPnlPct(null), '—')
})
