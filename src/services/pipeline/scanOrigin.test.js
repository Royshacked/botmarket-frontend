// The three Argus modes and the one rule that separates them.
// Node's built-in harness:  node --test src/services/pipeline/
import test from 'node:test'
import assert from 'node:assert/strict'
import { ORIGIN, scanOrigin, savesToScansList } from './scanOrigin.js'

test('an empty inbox is the user — nobody handed Argus a brief', () => {
    assert.equal(scanOrigin({ sleeveRunActive: false, handoffActive: false }), ORIGIN.USER)
    assert.equal(scanOrigin({}), ORIGIN.USER)
    assert.equal(scanOrigin(), ORIGIN.USER)
})

test('a sleeve run is the portfolio desk; a discovery hand-off is Kairos', () => {
    assert.equal(scanOrigin({ sleeveRunActive: true }),  ORIGIN.PORTFOLIO)
    assert.equal(scanOrigin({ handoffActive:   true }),  ORIGIN.KAIROS)
})

test('both flags set attributes to the sleeve run — the one that spans several scans', () => {
    assert.equal(scanOrigin({ sleeveRunActive: true, handoffActive: true }), ORIGIN.PORTFOLIO)
})

// The rule itself. Screening three sleeves for one book must not leave three sector lists in the
// user's saved lists; a discovery scan Kairos asked for is equally not a list the user keeps.
test('only a user scan is saved to the Scans tab', () => {
    assert.equal(savesToScansList(ORIGIN.USER),      true)
    assert.equal(savesToScansList(ORIGIN.PORTFOLIO), false)
    assert.equal(savesToScansList(ORIGIN.KAIROS),    false)
})

// Stated as the invariant rather than three cases, because this is what the pipeline envelope
// leans on: a scan carries a `ref` exactly when the step that produced it had an empty inbox.
test('saved ⟺ the inbox was empty', () => {
    for (const sleeveRunActive of [false, true]) {
        for (const handoffActive of [false, true]) {
            const empty = !sleeveRunActive && !handoffActive
            assert.equal(
                savesToScansList(scanOrigin({ sleeveRunActive, handoffActive })), empty,
                `sleeveRun=${sleeveRunActive} handoff=${handoffActive}`,
            )
        }
    }
})

test('an unknown origin never saves — a new mode must opt in, not inherit', () => {
    assert.equal(savesToScansList('something-new'), false)
    assert.equal(savesToScansList(undefined),       false)
})
