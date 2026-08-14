import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ideaWorkspaceMode, isPaperIdea, isManualIdea } from './tradeIdea.utils.js'

// ─── SHARED CASE TABLE — keep in lockstep with the backend ─────────────────────
//
// The workspace rule ("is this real money?") lives on the backend in
// services/venue.resolve.resolveMode. The frontend derives it too, ONLY as a fallback for
// documents saved before `mode` was stamped — and two implementations of the same rule in two
// repos is exactly how the last bug happened (a broker-only variant recorded legacy paper fills
// as LIVE trades in the canonical ledger).
//
// These are the SAME cases asserted in backend tests/unit/venueResolve.test.js. Neither repo can
// import the other, so this table is the seam: change the rule on one side and this fails loudly.
// It goes away entirely once a backfill stamps `mode` on the old docs and the fallback is deleted.
const CASES = [
    // [ description,                          input,                                        expected ]
    ['stamped mode wins outright',             { mode: 'paper', broker: 'ctrader' },          'paper'],
    ['stamped live is honoured',               { mode: 'live', mainAccountId: 'paper-u1' },   'live'],
    ['broker paper',                           { broker: 'paper' },                           'paper'],
    ['broker manual',                          { broker: 'manual' },                          'manual'],
    ['broker ctrader',                         { broker: 'ctrader' },                         'live'],
    ['broker ibkr',                            { broker: 'ibkr' },                            'live'],
    ['legacy: no broker, paper account',       { accountId: 'paper-u1-abc' },                 'paper'],
    ['legacy: no broker, manual account',      { accountId: 'manual-u1-abc' },                'manual'],
    ['legacy: paper mainAccountId',            { mainAccountId: 'paper-u1' },                 'paper'],
    ['legacy: paper in accounts[]',            { accounts: ['paper-u1'] },                    'paper'],
    ['legacy: manual as { id } object',        { accounts: [{ id: 'manual-u1' }] },           'manual'],
    ['real broker account is not virtual',     { broker: 'ctrader', accountId: '12345678' },  'live'],
    ['"papertrade-" must not match "paper-"',  { accountId: 'papertrade-9' },                 'live'],
    ['unknown venue defaults to live',         { broker: 'nope', accountId: '12345678' },     'live'],
    ['empty object',                           {},                                            'live'],
]

test('workspace mode matches the backend case-for-case', () => {
    for (const [what, input, expected] of CASES) {
        assert.equal(ideaWorkspaceMode(input), expected, what)
    }
})

test('an unknown venue resolves to LIVE — never silently to paper', () => {
    // Over-warning is harmless; showing real money in the paper workspace is not.
    assert.equal(ideaWorkspaceMode(undefined), 'live')
    assert.equal(ideaWorkspaceMode(null), 'live')
    assert.equal(ideaWorkspaceMode({ accounts: [null, undefined, ''] }), 'live')
})

test('the stamped field is preferred over every derived signal', () => {
    // The whole point: once the server has answered, the client stops guessing.
    assert.equal(ideaWorkspaceMode({ mode: 'live', broker: 'paper', accounts: ['paper-u1'] }), 'live')
    assert.equal(ideaWorkspaceMode({ mode: 'paper', broker: 'ctrader', accounts: ['999'] }), 'paper')
})

test('a garbage mode value falls through to derivation rather than being trusted', () => {
    assert.equal(ideaWorkspaceMode({ mode: 'sandbox', broker: 'paper' }), 'paper')
    assert.equal(ideaWorkspaceMode({ mode: '', accountId: 'manual-u1' }), 'manual')
})

test('the boolean helpers agree with the mode they wrap', () => {
    for (const [what, input, expected] of CASES) {
        assert.equal(isPaperIdea(input),  expected === 'paper',  `isPaperIdea — ${what}`)
        assert.equal(isManualIdea(input), expected === 'manual', `isManualIdea — ${what}`)
    }
})

test('paper and manual are mutually exclusive', () => {
    for (const [what, input] of CASES) {
        assert.ok(!(isPaperIdea(input) && isManualIdea(input)), what)
    }
})

// ─── SCOPING EVERY KIND, not just ideas ───────────────────────────────────────
// THE BUG THIS SECTION EXISTS FOR: the workspace rule was written when `ideas` was the only kind,
// so when `call` and `setup` arrived, the lists that show them did not reuse it.
//
//   - SETUPS were not scoped AT ALL. Mentor is the trading desk now, so the setup is the main
//     execution entity — and every setup showed in every workspace, paper next to real money.
//   - CALLS were scoped by an inline expression, copied into two list sites:
//         (c.broker === 'ctrader' ? 'live' : c.broker === 'manual' ? 'manual' : 'paper')
//     which maps every OTHER broker to paper. IBKR is a live broker. A live IBKR call therefore
//     showed up in the PAPER workspace, and nothing but the broker field was consulted — the
//     account-id fallback that ideas have was simply absent.

import { entityWorkspace, inWorkspace } from './tradeIdea.utils.js'

test('a live IBKR call is live, not paper — the inline copy got this wrong', () => {
    assert.equal(entityWorkspace({ broker: 'ibkr' }), 'live')
})

test("a call's `mode` is its build LENS and must not be read as a workspace", () => {
    // The live collision: on an idea or a setup `mode` is the workspace, on a call it is the lens
    // (discretionary | smc | institutional). The lens values do not collide with the workspace
    // names, so the call falls through to `broker` — this pins that it still does.
    for (const lens of ['discretionary', 'smc', 'institutional']) {
        assert.equal(entityWorkspace({ mode: lens, broker: 'paper' }), 'paper', lens)
        assert.equal(entityWorkspace({ mode: lens, broker: 'ctrader' }), 'live', lens)
    }
})

test('a setup carries a real stamped workspace and is scoped by it', () => {
    // setups.service stamps `mode: resolveMode(...)` at save, so this is the primary signal.
    assert.equal(entityWorkspace({ mode: 'manual', broker: 'manual' }), 'manual')
    assert.equal(entityWorkspace({ mode: 'paper' }), 'paper')
})

test('inWorkspace keeps only the entities belonging to the book on screen', () => {
    const list = [
        { id: 'a', mode: 'paper' },
        { id: 'b', mode: 'live' },
        { id: 'c', broker: 'manual' },
        { id: 'd', broker: 'ibkr' },
        { id: 'e', accountId: 'paper-u1-xyz' },
    ]
    assert.deepEqual(inWorkspace(list, 'paper').map(x => x.id),  ['a', 'e'])
    assert.deepEqual(inWorkspace(list, 'live').map(x => x.id),   ['b', 'd'])
    assert.deepEqual(inWorkspace(list, 'manual').map(x => x.id), ['c'])
})

test('every entity lands in exactly one workspace — none hidden, none doubled', () => {
    // The property that makes the three lists a partition of the book. A kind that fell through all
    // three would vanish from the UI entirely, which is worse than showing in the wrong one: the
    // user would have no surface on which to notice it.
    const list = [{ mode: 'paper' }, { mode: 'live' }, { broker: 'manual' }, { broker: 'ibkr' }, {}]
    const total = ['paper', 'live', 'manual'].reduce((n, w) => n + inWorkspace(list, w).length, 0)
    assert.equal(total, list.length)
})

test('a list that has not loaded yet scopes to nothing rather than throwing', () => {
    assert.deepEqual(inWorkspace(undefined, 'paper'), [])
    assert.deepEqual(inWorkspace(null, 'live'), [])
})
