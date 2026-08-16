import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handoffDoors } from './doors.js'

// A hand-off is consumed by an EFFECT keyed on the artifact, and an effect with a changed dep runs
// on MOUNT too. So an artifact still sitting in the sender's state after its run is over replays
// itself the next time the receiving panel remounts — a conversation nobody asked for, off any
// pipeline, badging a desk the user never opened. That happened on a live run (2026-08-16, AVGO).
//
// The cause was a hand-written list: the walk home named three of the five doors. So the property
// these tests hold is not "the tables are right" — it is that CLEARING CANNOT BE PARTIAL.

const spy = () => { const f = (...a) => f.calls.push(a); f.calls = []; return f }
const bag = () => ({
    setScanInbox: spy(), setKairosInbox: spy(), setAnalystInbox: spy(), setMentorInbox: spy(),
    setScannerSeed: spy(), setPortfolioSeed: spy(), setMentorSeed: spy(), setAnalystSeed: spy(),
})

test('clear shuts EVERY door it was handed', () => {
    const setters = bag()
    handoffDoors(setters).clear()

    for (const [name, set] of Object.entries(setters)) {
        assert.deepEqual(set.calls, [[null]], `${name} was left open`)
    }
})

test('a door no routing table knows about is still cleared', () => {
    // The two that misfired were exactly these: Mentor's and Prometheus's seeds are reachable only
    // from OUTSIDE the conveyor (a calendar row, an Axl routing), so no hop table lists them. A
    // clear that walked the tables would leave them armed — as it did. Same for a door added later.
    const setters = { ...bag(), setSomeFutureDoor: spy() }
    const doors   = handoffDoors(setters)

    assert.equal(Object.values(doors.inbox).includes(setters.setMentorSeed), false)
    assert.equal(Object.values(doors.pipelineSeed).includes(setters.setMentorSeed), false)
    assert.equal(Object.values(doors.pipelineSeed).includes(setters.setAnalystSeed), false)

    doors.clear()
    assert.deepEqual(setters.setMentorSeed.calls, [[null]])
    assert.deepEqual(setters.setAnalystSeed.calls, [[null]])
    assert.deepEqual(setters.setSomeFutureDoor.calls, [[null]], 'a new door must not need a second edit')
})

test('the routing tables are keyed by AGENT — what a hop plan names', () => {
    const setters = bag()
    const doors   = handoffDoors(setters)

    assert.equal(doors.inbox.mentor, setters.setMentorInbox)
    assert.equal(doors.inbox.scanner, setters.setScanInbox)
    assert.equal(doors.inbox.kairos, setters.setKairosInbox)
    assert.equal(doors.inbox.analyst, setters.setAnalystInbox)
    assert.equal(doors.pipelineSeed.scanner, setters.setScannerSeed)
    assert.equal(doors.pipelineSeed.portfolio, setters.setPortfolioSeed)
})

test('a hop can never open Mentor’s or Prometheus’s seed door', () => {
    // Deliberate: those two open on a sentence a SURFACE wrote (a calendar card, Axl's routing).
    // A conveyor hop delivers to them whole, as an artifact — `deliver: 'whole'` in their contract.
    const doors = handoffDoors(bag())
    assert.equal(doors.pipelineSeed.mentor, undefined)
    assert.equal(doors.pipelineSeed.analyst, undefined)
})

test('an absent setter is not a crash — clear is called on the way out of a desk', () => {
    assert.doesNotThrow(() => handoffDoors({ setScanInbox: undefined }).clear())
    assert.doesNotThrow(() => handoffDoors().clear())
})
