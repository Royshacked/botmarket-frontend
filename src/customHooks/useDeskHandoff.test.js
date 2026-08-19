import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    handoffReducer, blankHandoffState, setterName, HANDOFF_DESKS, HANDOFF_SLOTS,
} from './useDeskHandoff.js'

// WHAT IS WAITING AT EACH DESK — the storage behind every hand-off.
//
// It was eleven useState declarations scattered through a 3,000-line component with no test file,
// so none of this was verifiable: not the clear-on-exit, not what happens when a hop names a desk
// this build does not have, and not the setter NAMES — which services/pipeline/doors.js reads off a
// bag to build its routing tables. Renaming one slot silently made a door undefined and all 648
// tests still passed, because doors.test.js supplies its own fixture.

test('every desk starts with every slot empty', () => {
    const s = blankHandoffState()
    for (const desk of HANDOFF_DESKS) {
        for (const slot of HANDOFF_SLOTS) assert.equal(s[desk][slot], null, `${desk}.${slot}`)
    }
})

test('a set lands in one slot and touches nothing else', () => {
    const s = handoffReducer(blankHandoffState(), { type: 'set', desk: 'mentor', slot: 'seed', value: { key: 1 } })
    assert.deepEqual(s.mentor.seed, { key: 1 })
    assert.equal(s.mentor.inbox, null)
    assert.equal(s.scanner.seed, null, 'one desk being handed something must not disturb another')
})

test('clearAll drops everything in flight — leaving for the hub', () => {
    let s = blankHandoffState()
    s = handoffReducer(s, { type: 'set', desk: 'scanner', slot: 'inbox', value: { id: 'x' } })
    s = handoffReducer(s, { type: 'set', desk: 'mentor',  slot: 'chatRestore', value: { key: 2 } })
    s = handoffReducer(s, { type: 'clearAll' })
    assert.deepEqual(s, blankHandoffState())
})

// ── the answers that keep a page alive ───────────────────────────────────────

test('a hand-off for a desk this build does not have opens nothing, and breaks nothing', () => {
    // Hop plans and Axl routing tags name desks as strings. A tag for an archived or future desk
    // must not throw inside the component that received it — it should simply open nothing.
    const s = blankHandoffState()
    assert.equal(handoffReducer(s, { type: 'set', desk: 'kairos', slot: 'seed', value: { key: 1 } }), s)
    assert.equal(handoffReducer(s, { type: 'set', desk: 'mentor', slot: 'nonsense', value: 1 }), s)
    assert.equal(handoffReducer(s, { type: 'nonsense' }), s)
    assert.equal(handoffReducer(s, undefined), s)
})

test('a set that changes nothing returns the SAME state, so React skips the render', () => {
    // Not a micro-optimisation: every route away from a desk clears slots that are usually already
    // empty, and a fresh object each time would re-fire every effect keyed on these props.
    const s = blankHandoffState()
    assert.equal(handoffReducer(s, { type: 'set', desk: 'mentor', slot: 'seed', value: null }), s)
    assert.equal(handoffReducer(s, { type: 'clearAll' }), s, 'clearing an empty board changes nothing')

    const filled = handoffReducer(s, { type: 'set', desk: 'mentor', slot: 'seed', value: { key: 1 } })
    assert.notEqual(filled, s)
    assert.notEqual(handoffReducer(filled, { type: 'clearAll' }), filled)
})

// ── the names doors.js reads off the bag ─────────────────────────────────────

test('setter names match what the routing tables look for', () => {
    // doors.js does `setters.setScannerInbox` — by name, off a plain object. Nothing type-checks
    // that, and a mismatch makes a door undefined rather than failing: the hop just opens nothing.
    assert.equal(setterName('scanner', 'inbox'),      'setScannerInbox')
    assert.equal(setterName('mentor',  'seed'),       'setMentorSeed')
    assert.equal(setterName('portfolio', 'chatRestore'), 'setPortfolioChatRestore')
    assert.equal(setterName('analyst', 'seed'),       'setAnalystSeed')
})

test('every door doors.js asks for is a name this generates', () => {
    // The guard for the break that actually happened. These are the keys doors.js reads; if the
    // desk/slot tables ever stop producing one, this fails here instead of in a silent hand-off.
    const generated = new Set(HANDOFF_DESKS.flatMap(d => HANDOFF_SLOTS.map(s => setterName(d, s))))
    for (const needed of [
        'setScannerInbox', 'setAnalystInbox', 'setMentorInbox',
        'setScannerSeed', 'setPortfolioSeed', 'setMentorSeed', 'setAnalystSeed',
    ]) {
        assert.ok(generated.has(needed), `doors.js reads ${needed} and nothing generates it`)
    }
})

// ── deskProps: the shape a panel is handed ───────────────────────────────────

test('deskProps hands over every slot, including ones that desk does not read', () => {
    // Uniform on purpose. An undeclared prop is never destructured and no panel spreads its props
    // onto a DOM node, so the extras cost nothing — and handing the same shape every time is what
    // makes adding a desk free.
    const s = handoffReducer(blankHandoffState(), { type: 'set', desk: 'scanner', slot: 'seed', value: { key: 7 } })
    assert.deepEqual(Object.keys(s.scanner).sort(), ['chatRestore', 'inbox', 'seed'])
    assert.deepEqual(s.scanner.seed, { key: 7 })
})

test('the slot names ARE the prop names — the thing that had to be true first', () => {
    // ScannerPanel took its seed as `scanSeed`, so a uniform spread would have handed it a `seed`
    // it never reads and dropped every scan hand-off in silence. If a slot is ever renamed without
    // the panel following, this is the line that should look wrong.
    assert.deepEqual(HANDOFF_SLOTS, ['seed', 'inbox', 'chatRestore'])
})
