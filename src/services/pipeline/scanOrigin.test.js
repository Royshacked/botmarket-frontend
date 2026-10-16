// The two Argus origins and the one rule that separates them.
// Node's built-in harness:  node --test src/services/pipeline/
import test from 'node:test'
import assert from 'node:assert/strict'
import { ORIGIN, scanOrigin, savesToScansList, scanSourceFor } from './scanOrigin.js'

test('no board is the user — nobody handed Argus anything', () => {
    assert.equal(scanOrigin({ radarActive: false }), ORIGIN.USER)
    assert.equal(scanOrigin({}), ORIGIN.USER)
    assert.equal(scanOrigin(), ORIGIN.USER)
})

test('a board in force is a radar cut', () => {
    assert.equal(scanOrigin({ radarActive: true }), ORIGIN.AETHER)
})

// A radar cut is mid-pipeline traffic — Argus did not screen for those names, the radar handed them
// over — and yet the list it produces is the artifact the user pressed the button for, and the only
// record that the cut happened. So it saves, like the user's own list.
test('a user scan and a radar cut are both saved', () => {
    assert.equal(savesToScansList(ORIGIN.USER),   true)
    assert.equal(savesToScansList(ORIGIN.AETHER), true)
})

// The stamp is what tomorrow's board reads to know which names it already took. Only a radar cut
// carries one: a hand-written list of the same tickers is not the same artifact.
test('only a radar cut is stamped with a source', () => {
    assert.equal(scanSourceFor(ORIGIN.AETHER), 'aether')
    assert.equal(scanSourceFor(ORIGIN.USER),   null)
    assert.equal(scanSourceFor(undefined),     null)
})

test('an unknown origin never saves — a new mode must opt in, not inherit', () => {
    assert.equal(savesToScansList('something-new'), false)
    assert.equal(savesToScansList('portfolio'),     false)
    assert.equal(savesToScansList(undefined),       false)
})
