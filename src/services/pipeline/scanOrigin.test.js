// The four Argus modes and the one rule that separates them.
// Node's built-in harness:  node --test src/services/pipeline/
import test from 'node:test'
import assert from 'node:assert/strict'
import { ORIGIN, scanOrigin, savesToScansList, scanSourceFor } from './scanOrigin.js'

test('an empty inbox is the user — nobody handed Argus a brief', () => {
    assert.equal(scanOrigin({ sleeveRunActive: false, handoffActive: false }), ORIGIN.USER)
    assert.equal(scanOrigin({}), ORIGIN.USER)
    assert.equal(scanOrigin(), ORIGIN.USER)
})

test('a sleeve run is the portfolio desk; a discovery hand-off is Kairos; a board is Aether', () => {
    assert.equal(scanOrigin({ sleeveRunActive: true }),  ORIGIN.PORTFOLIO)
    assert.equal(scanOrigin({ handoffActive:   true }),  ORIGIN.KAIROS)
    assert.equal(scanOrigin({ radarActive:     true }),  ORIGIN.AETHER)
})

test('both flags set attributes to the sleeve run — the one that spans several scans', () => {
    assert.equal(scanOrigin({ sleeveRunActive: true, handoffActive: true }), ORIGIN.PORTFOLIO)
})

// A radar board is the LAST to win, so a cut that somehow started inside a sleeve run or a
// discovery hand-off is attributed to the run that spans it, exactly as those two already are.
test('a board yields to a sleeve run and to a hand-off', () => {
    assert.equal(scanOrigin({ radarActive: true, sleeveRunActive: true }), ORIGIN.PORTFOLIO)
    assert.equal(scanOrigin({ radarActive: true, handoffActive:   true }), ORIGIN.KAIROS)
})

// The rule itself. Screening three sleeves for one book must not leave three sector lists in the
// user's saved lists; a discovery scan Kairos asked for is equally not a list the user keeps.
//
// AETHER IS THE EXCEPTION AND BREAKS THE OLD SHAPE OF THIS RULE. It is mid-pipeline traffic by
// every earlier test — Argus did not screen for those names, the radar handed them over — and yet
// the list it produces is the artifact the user pressed the button for, and the only record that
// the cut happened. It saves, and it is the reason "saved ⟺ nobody handed Argus anything" is no
// longer the invariant.
test('a user scan and a radar cut are saved; mid-pipeline screening is not', () => {
    assert.equal(savesToScansList(ORIGIN.USER),      true)
    assert.equal(savesToScansList(ORIGIN.AETHER),    true)
    assert.equal(savesToScansList(ORIGIN.PORTFOLIO), false)
    assert.equal(savesToScansList(ORIGIN.KAIROS),    false)
})

// The stamp is what tomorrow's board reads to know which names it already took. Only a radar cut
// carries one: a hand-written list of the same tickers is not the same artifact.
test('only a radar cut is stamped with a source', () => {
    assert.equal(scanSourceFor(ORIGIN.AETHER),    'aether')
    assert.equal(scanSourceFor(ORIGIN.USER),      null)
    assert.equal(scanSourceFor(ORIGIN.PORTFOLIO), null)
    assert.equal(scanSourceFor(ORIGIN.KAIROS),    null)
    assert.equal(scanSourceFor(undefined),        null)
})

// Stated as the invariant rather than case by case, because this is what the pipeline envelope
// leans on: a scan carries a `ref` exactly when it is a list somebody keeps. That used to be the
// same thing as "the inbox was empty" and is not any more — a radar cut has an inbox and is kept.
test('saved ⟺ nothing is mid-run, board or not', () => {
    for (const sleeveRunActive of [false, true]) {
        for (const handoffActive of [false, true]) {
            for (const radarActive of [false, true]) {
                const kept = !sleeveRunActive && !handoffActive
                assert.equal(
                    savesToScansList(scanOrigin({ sleeveRunActive, handoffActive, radarActive })), kept,
                    `sleeveRun=${sleeveRunActive} handoff=${handoffActive} radar=${radarActive}`,
                )
            }
        }
    }
})

test('an unknown origin never saves — a new mode must opt in, not inherit', () => {
    assert.equal(savesToScansList('something-new'), false)
    assert.equal(savesToScansList(undefined),       false)
})
