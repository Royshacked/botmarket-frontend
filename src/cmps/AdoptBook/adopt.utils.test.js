import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    splitCode, groupProblems, problemLabel, warningLabel, exclusionLabel,
    canCommit, isAdoptedIdea, isAdoptedBook,
} from './adopt.utils.js'

// Turning the backend's reason codes into what a person reads, and into WHICH CELL lights up.
// The rule underneath: a problem must always point somewhere. A refusal a user can't act on is worse
// than no refusal — they retype the whole book hoping something changes.

test('a code splits into its reason and its target, once', () => {
    // Done here so no component does string surgery mid-render.
    assert.deepEqual(splitCode('bad_quantity:AAPL'), { code: 'bad_quantity', target: 'AAPL' })
    assert.deepEqual(splitCode('no_account_value'), { code: 'no_account_value', target: null })
    assert.deepEqual(splitCode(null), { code: '', target: null })
})

test('a row problem is routed to its row; an account problem is not', () => {
    const { bySymbol, book } = groupProblems([
        'bad_quantity:AAPL', 'bad_avg_cost:MSFT', 'no_account_value',
    ])
    assert.deepEqual([...bySymbol.keys()], ['AAPL', 'MSFT'])
    assert.deepEqual(bySymbol.get('AAPL'), ['bad_quantity'])
    assert.deepEqual(book, ['no_account_value'])
})

test('two problems on one row both stay on it', () => {
    const { bySymbol } = groupProblems(['bad_quantity:TSLA', 'bad_avg_cost:TSLA'])
    assert.deepEqual(bySymbol.get('TSLA'), ['bad_quantity', 'bad_avg_cost'])
})

test('a problem about a paste LINE is not pinned to a holding', () => {
    // `missing_symbol:line 4` names a line of text, not a name we know. Highlighting some unrelated
    // holding for it is how a user ends up editing the wrong row.
    const { bySymbol, book } = groupProblems(['missing_symbol:line 4'])
    assert.equal(bySymbol.size, 0)
    assert.deepEqual(book, ['missing_symbol:line 4'])
})

test('symbols match case-insensitively, because a paste is not tidy', () => {
    const { bySymbol } = groupProblems(['bad_quantity:aapl'])
    assert.ok(bySymbol.has('AAPL'))
})

test('every code a user can hit reads as a question or a statement, never as a code', () => {
    assert.equal(problemLabel('bad_quantity:AAPL'), 'How many shares?')
    assert.equal(problemLabel('no_account_value'), 'What does the bank say the account is worth?')
    assert.match(problemLabel('account_value_below_holdings'), /less than the holdings are worth/)
    assert.match(problemLabel('cash_not_derivable_excluded'), /holdings we are not adopting/)
    assert.match(problemLabel('cash_not_derivable_unpriced'), /no price/)
    assert.match(problemLabel('no_fx_rate'), /rate for that currency/)
})

test('an unknown code still says something actionable rather than vanishing', () => {
    // A new backend reason must never render as blank space.
    assert.equal(problemLabel('brand_new_reason:AAPL'), 'brand_new_reason (AAPL)')
    assert.equal(problemLabel('brand_new_reason'), 'brand_new_reason')
})

test('a warning names the row it assumed a column for', () => {
    assert.match(warningLabel('assumed_columns:AAPL'), /first two numbers as size and cost for AAPL/)
})

test('the two exclusion reasons read differently, because they need different actions', () => {
    const foreign = exclusionLabel('non_us_listing')
    const noPrice = exclusionLabel('no_price')
    assert.match(foreign, /Listed outside the US/)
    assert.match(foreign, /ADR/, 'the user is given the way to bring the position in')
    assert.match(noPrice, /usually a typo/i, 'this one is a question, not a verdict')
    assert.notEqual(foreign, noPrice)
})

// ─── The commit gate mirrors the backend, so the button cannot lie ───────────────

const READY = {
    holdings: [{ symbol: 'AAPL', quantity: 100, avgCost: 150 }],
    reconciliation: { problems: [], startingBalance: 25_000 },
}

test('a clean draft can commit', () => {
    assert.equal(canCommit(READY), true)
})

test('anything unresolved blocks the commit', () => {
    assert.equal(canCommit({ ...READY, reconciliation: { problems: ['no_account_value'], startingBalance: null } }), false)
    assert.equal(canCommit({ ...READY, holdings: [] }), false, 'an empty book is not a book')
    // No balance means the arithmetic was withheld — committing would open an account on a number
    // nobody trusts.
    assert.equal(canCommit({ ...READY, reconciliation: { problems: [], startingBalance: null } }), false)
    assert.equal(canCommit(null), false)
})

test('a warning alone does NOT block', () => {
    assert.equal(canCommit({ ...READY, warnings: ['assumed_columns:AAPL'] }), true)
})

// ─── Adopted books are already in position ──────────────────────────────────────

test('adopted is read from the server flag, never derived', () => {
    assert.equal(isAdoptedIdea({ adopted: true }), true)
    assert.equal(isAdoptedIdea({ adopted: false }), false)
    // A manual leg that happens to be long is NOT adopted — deriving it here is the drift that once
    // made this repo report legacy paper fills as live.
    assert.equal(isAdoptedIdea({ broker: 'manual', status: 'long', ordersPlacedAt: 1 }), false)
    assert.equal(isAdoptedIdea(null), false)
})

test('an adopted book is never offered an activate', () => {
    // The whole point: offering it invites the user to go buy what they already own.
    assert.equal(isAdoptedBook([{ adopted: true }, { adopted: true }]), true)
    assert.equal(isAdoptedBook([{ adopted: true }, { adopted: false }]), false, 'a mixed book is not an adopted one')
    assert.equal(isAdoptedBook([]), false, 'and an empty list is not a book at all')
})
