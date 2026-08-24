import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planAccountRebind } from './tradeIdea.utils.js'

// The rule this file guards was written from a real loss of state: a user standing in the PAPER
// workspace opened a book whose holdings are bound to a cTrader account. The account selector could
// not list a broker account from inside paper, so the marked selection resolved to nothing — and
// "Update plan" wrote `accounts: []` over five live holdings, the field their exits route by.

const book = (...ideas) => ideas.map((i, n) => ({ id: `i${n}`, ...i }))

test('an empty selection is refused — it is not an instruction to unbind the book', () => {
    assert.equal(planAccountRebind(book({ status: 'long' }, { status: 'waiting' }), []), null)
    assert.equal(planAccountRebind(book({ status: 'waiting' }), null), null)
    assert.equal(planAccountRebind(book({ status: 'waiting' }), [null, '']), null)
})

test('THE REPORTED CASE: a paper selection that resolved to nothing cannot reach live holdings', () => {
    // What MainPage passes when the workspace on screen cannot list the book's own accounts.
    const live = book({ status: 'long' }, { status: 'long' }, { status: 'long' })
    assert.equal(planAccountRebind(live, [], null), null)
})

test('a post-order leg is never re-pointed — its order already exists at an account', () => {
    const mixed = book(
        { status: 'long' },     // in position
        { status: 'short' },    // in position
        { status: 'hit' },      // order placed, awaiting confirm
        { status: 'waiting' },  // not placed — free to re-bind
    )
    const plan = planAccountRebind(mixed, ['46115894'])
    assert.deepEqual(plan.targets.map(i => i.status), ['waiting'])
    assert.deepEqual(plan.accounts, ['46115894'])
})

test('a book with nothing re-bindable is refused outright', () => {
    assert.equal(planAccountRebind(book({ status: 'long' }, { status: 'hit' }), ['46115894']), null)
})

test('main must be one of the marked accounts, else nobody is starred', () => {
    const ideas = book({ status: 'waiting' })
    assert.equal(planAccountRebind(ideas, ['a', 'b'], 'b').mainAccountId, 'b')
    // A main left over from another workspace would scale quantities off a balance
    // this book is not trading.
    assert.equal(planAccountRebind(ideas, ['a', 'b'], 'paper-u1-x').mainAccountId, null)
    assert.equal(planAccountRebind(ideas, ['a'], null).mainAccountId, null)
})

test('a missing or non-array book is a refusal, not a throw', () => {
    assert.equal(planAccountRebind(undefined, ['a']), null)
    assert.equal(planAccountRebind(null, ['a']), null)
    assert.equal(planAccountRebind([null, undefined], ['a']), null)
})
