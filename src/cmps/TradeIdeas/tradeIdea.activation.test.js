import { test } from 'node:test'
import assert from 'node:assert/strict'

import { activatePortfolio, activationStatus } from './tradeIdea.utils.js'

// What "activate this book" MEANS, in the one place three surfaces now read it from (the ideas
// table, the cards, and the Floor's portfolio list). The copies were identical until they weren't
// going to be — a fourth caller is what turned the duplication into a rule.

const leg = (over = {}) => ({ id: 'i1', status: 'waiting', ...over })

test('every waiting leg moves to its own activation status', () => {
    const calls = []
    const book = [
        leg({ id: 'a' }),                                     // no conditions → fires now
        leg({ id: 'b', entryOrderType: 'stop' }),             // broker holds a working order
    ]

    activatePortfolio(book, { onStatusChange: (id, status) => calls.push([id, status]) })

    assert.deepEqual(calls, [['a', activationStatus(book[0])], ['b', 'resting']])
})

// Activating a book is not a re-entry for the parts of it already working.
test('legs that are not waiting are left alone', () => {
    const calls = []
    const book = [leg({ id: 'a', status: 'long' }), leg({ id: 'b', status: 'looking' }), leg({ id: 'c' })]

    activatePortfolio(book, { onStatusChange: (id, s) => calls.push([id, s]) })

    assert.deepEqual(calls.map(c => c[0]), ['c'])
})

// The one that would hurt: in manual there is no broker to tell, so flipping statuses would claim
// positions nobody opened. The entry card goes out instead and the user reports the real fills.
test('manual posts the entry card and touches no status', () => {
    const calls = []
    let carded = 0

    activatePortfolio([leg(), leg({ id: 'i2' })], {
        isManual: true,
        onStatusChange: (id, s) => calls.push([id, s]),
        onManualEntry: () => { carded++ },
    })

    assert.equal(carded, 1, 'one card for the whole book, not one per leg')
    assert.deepEqual(calls, [], 'no status may move without a broker fill behind it')
})

test('an empty or absent book is a no-op, not a throw', () => {
    assert.doesNotThrow(() => activatePortfolio([], { onStatusChange: () => { throw new Error('called') } }))
    assert.doesNotThrow(() => activatePortfolio(undefined, {}))
    assert.doesNotThrow(() => activatePortfolio([leg()]))          // no handlers at all
    assert.doesNotThrow(() => activatePortfolio([leg()], { isManual: true }))
})
