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
