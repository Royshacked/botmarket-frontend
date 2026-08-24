import { test } from 'node:test'
import assert from 'node:assert/strict'
import { redrawAsk } from './redrawAsk.js'

// The turn a re-draw card opens Mentor on. The contract is one sentence-pair, so what is worth
// pinning is the judgment inside it: which of Talos's two failures it reports, where the reason is
// read from, and what it deliberately refuses to say.

const BASE = { id: 'setup_AVGO_1', asset: 'AVGO' }
const drifted = (over = {}) => ({ ...BASE, invalidation_edge: 'time', ...over })

test('a drifted MAP asks for the levels, and carries the reason', () => {
    const ask = redrawAsk(drifted({ invalidation_reason: 'price has built a new shelf 6 points above the entry band' }))
    assert.match(ask, /the map on my AVGO setup has drifted/)
    assert.match(ask, /new shelf 6 points above the entry band/)
    assert.match(ask, /re-draw the levels/)
})

// A broken premise is not a stale map. Telling the user's own turn to "re-draw the levels" when the
// trade may simply be gone would put words in their mouth that pre-judge the answer.
test('a BROKEN premise leaves room for "there is no trade here"', () => {
    const ask = redrawAsk({ ...BASE, invalidation_edge: 'lower', invalidation_reason: 'closed at 241, past the lower edge — the premise is broken' })
    assert.match(ask, /my AVGO setup is no longer valid/)
    assert.match(ask, /closed at 241, past the lower edge/)
    assert.match(ask, /say so plainly if there is not/)
    assert.doesNotMatch(ask, /has drifted/)
})

// The DOCUMENT is the live source — Talos stamps it in the same patch that fires the card. The
// assessment behind it is only the fallback for a doc written before the reason was stamped.
test('falls back to the assessment, then to the read, then asks anyway', () => {
    assert.match(
        redrawAsk(drifted({ monitor_state: { last_assessment: { edit_proposal: { why: 'structure has moved up a full leg' } } } })),
        /structure has moved up a full leg/,
    )
    assert.match(
        redrawAsk(drifted({ monitor_state: { last_assessment: { read: 'The shelf I mapped is gone.' } } })),
        /The shelf I mapped is gone/,
    )
    // No reason anywhere is still a usable turn — just without the because.
    assert.match(redrawAsk(drifted()), /re-draw the levels/)
})

// Talos writes prose for a journal, not for someone's chat turn. A paragraph pasted in stops reading
// as something the user would have typed.
test('takes only the first sentence of a multi-sentence reason', () => {
    const ask = redrawAsk(drifted({ invalidation_reason: 'The 199 shelf is gone. Price is basing 6 points higher. I would move the band up.' }))
    assert.match(ask, /The 199 shelf is gone/)
    assert.doesNotMatch(ask, /Price is basing/)
})

// Never invent a reason, and never build an ask for something that isn't a setup — the doorway reads
// null as "fall back to the pencil's silence" rather than opening on a sentence about nothing.
test('returns null without a setup', () => {
    assert.equal(redrawAsk(null), null)
    assert.equal(redrawAsk({}), null)
})

// The proposal's `changes` are Talos's re-map. Handing them over as the ask would make Mentor a
// formatter for the monitor's opinion instead of the desk that owns the re-draw.
test('never carries the proposed changes into the turn', () => {
    const ask = redrawAsk(drifted({
        monitor_state: { last_assessment: { edit_proposal: { why: 'drifted', changes: { entry_zones: [{ lower: 205, upper: 207 }] } } } },
    }))
    assert.doesNotMatch(ask, /205/)
    assert.doesNotMatch(ask, /entry_zones/)
})
