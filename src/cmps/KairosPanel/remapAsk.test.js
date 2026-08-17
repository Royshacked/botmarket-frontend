import { test } from 'node:test'
import assert from 'node:assert/strict'
import { remapAsk } from './remapAsk.js'

// Kairos's twin of redrawAsk. What is worth pinning is the judgment: which of the thesis's two
// endings it reports, where the reason comes from, and that it stays the user's own turn.

const CALL = { id: 'call_1', asset: 'AAPL' }

test('an EXPIRING thesis asks for the re-map while there is still time', () => {
    const ask = remapAsk({ ...CALL, invalidation_reason: 'the 190 shelf has not held for three sessions' }, 'edit')
    assert.match(ask, /the thesis on my AAPL call is going stale/)
    assert.match(ask, /190 shelf has not held/)
    assert.match(ask, /re-map the levels/)
})

// A thesis that has RUN OUT is a different question — "is there still a trade" rather than "fix the
// levels". Reporting both the same way would ask the desk to re-map something already gone.
test('an EXPIRED thesis asks whether there is a trade left at all', () => {
    const ask = remapAsk({ ...CALL, invalidation_reason: 'the window closed without the setup ever printing' }, 'expired')
    assert.match(ask, /has expired/)
    assert.match(ask, /Is there still a trade here\?/)
    assert.doesNotMatch(ask, /going stale/)
})

test('falls back through the assessment to the read, and still asks with no reason', () => {
    assert.match(
        remapAsk({ ...CALL, monitor_state: { last_assessment: { edit_proposal: { why: 'structure has rolled over' } } } }, 'edit'),
        /structure has rolled over/,
    )
    assert.match(
        remapAsk({ ...CALL, monitor_state: { last_assessment: { read: 'The level I was watching is gone.' } } }, 'edit'),
        /The level I was watching is gone/,
    )
    assert.match(remapAsk(CALL, 'edit'), /re-map the levels/)
})

// The card's axis, not the call's status — an unknown/absent kind must fall to the non-terminal
// wording rather than telling the user their thesis is dead.
test('an absent kind reads as expiring, never as expired', () => {
    assert.match(remapAsk(CALL), /is going stale/)
    assert.match(remapAsk(CALL, null), /is going stale/)
})

test('returns null without a call', () => {
    assert.equal(remapAsk(null, 'edit'), null)
    assert.equal(remapAsk({}, 'edit'), null)
})
