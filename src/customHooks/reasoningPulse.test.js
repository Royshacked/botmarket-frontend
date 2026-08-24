// Pure-function tests for the live reasoning beat.
// Node's built-in harness:  node --test src/customHooks/reasoningPulse.test.js
//
// The point of the pulse is to tell two states apart that look identical from outside: a model deep
// in a chain of thought, and a model stalled on a slow tool. Both showed a flat "thinking…". So the
// cases that matter are the boundaries — when it must go quiet, and when it must stay visibly alive.
import test from 'node:test'
import assert from 'node:assert/strict'
import { reasoningPulse, pruneSamples } from './reasoningPulse.js'

const NOW = 1_700_000_000_000
const at = (msAgo, n) => ({ t: NOW - msAgo, n })

test('no samples → not reasoning', () => {
    assert.equal(reasoningPulse([], NOW), null)
})

test('a gap longer than the idle window means reasoning STOPPED', () => {
    // The model moved on to a tool call or to the visible reply — the beat must go quiet rather
    // than hold at its last value, or it claims thinking that finished seconds ago.
    assert.equal(reasoningPulse([at(3000, 40)], NOW), null)
})

test('a live trickle stays visibly alive rather than reading as stopped', () => {
    // One small delta just now: slow, but genuinely thinking — often the hardest part of a problem.
    const p = reasoningPulse([at(100, 3)], NOW)
    assert.ok(p !== null && p >= 0.12, `expected a floor, got ${p}`)
})

test('faster arrival reads as a stronger pulse', () => {
    const slow = reasoningPulse([at(900, 10), at(400, 10)], NOW)
    const fast = reasoningPulse([at(900, 200), at(400, 200)], NOW)
    assert.ok(fast > slow, `${fast} should exceed ${slow}`)
})

test('it never exceeds 1, however hard the model is going', () => {
    assert.equal(reasoningPulse([at(500, 100_000)], NOW), 1)
})

test('a burst is not under-reported by the width of the window', () => {
    // Measured against elapsed span, not a fixed 2s: 300ms into a fast burst, dividing by the full
    // window would report a fraction of the true rate and the beat would look sluggish.
    assert.ok(reasoningPulse([at(300, 60)], NOW) > 0.5)
})

test('pruning drops what has fallen out of the window and keeps the rest', () => {
    const samples = [at(5000, 10), at(1500, 10), at(200, 10)]
    assert.equal(pruneSamples(samples, NOW).length, 2)
})
