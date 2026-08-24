import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextResetKeys } from './deskReset.js'

// Walking home to Axl remounts Argus and Atlas so re-entering them starts a new conversation — but a
// desk MID-TURN must survive it. The server keeps the turn running when the socket closes, so the
// answer is still coming; remounting throws away the panel that was going to receive it.

test('an idle desk gets a fresh slate', () => {
    assert.deepEqual(nextResetKeys({ scanner: 0, portfolio: 0 }, {}), { scanner: 1, portfolio: 1 })
})

test('a desk mid-turn is left exactly where it is', () => {
    assert.deepEqual(nextResetKeys({ scanner: 3, portfolio: 1 }, { scanner: true }), { scanner: 3, portfolio: 2 })
})

test('per desk — one busy desk does not hold the others back', () => {
    const next = nextResetKeys({ scanner: 5, portfolio: 5 }, { portfolio: true })
    assert.equal(next.scanner, 6)
    assert.equal(next.portfolio, 5)
})

test('a busy desk with no key here invents none', () => {
    // Mentor / Prometheus / Pythia are never remounted (display:none), so they have nothing to bump.
    assert.deepEqual(nextResetKeys({ scanner: 0 }, { mentor: true }), { scanner: 1 })
})

test('a missing value or a missing busy map is not a crash', () => {
    assert.deepEqual(nextResetKeys({ scanner: undefined }, undefined), { scanner: 1 })
    assert.deepEqual(nextResetKeys(), {})
})
