import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sharedAsk } from './sharedAsk.js'

// The turn a shared-setup card opens Mentor on. What is worth pinning: whose plan it says it is,
// that the sender's words ride in verbatim, that the price only appears when there was one, and
// what it deliberately does not ask for.

const BP = { asset: 'nvda', direction: 'long', from: { userId: 'u1', username: 'roy', fullname: 'Roy Shacked' } }

test('names the sender, the asset and the direction, and asks for a read then a size', () => {
    const ask = sharedAsk({ blueprint: BP, note: 'wait for the retest', drawnPrice: 187.5 })
    assert.match(ask, /^Roy Shacked shared this NVDA long plan with me/)
    assert.match(ask, /their note: "wait for the retest"/)
    assert.match(ask, /NVDA at 187\.5/)
    assert.match(ask, /Read it against the tape now/)
    assert.match(ask, /help me size it/)
})

test('falls back to the username, then to "Someone"', () => {
    assert.match(sharedAsk({ blueprint: { ...BP, from: { username: 'marce' } } }), /^marce shared/)
    assert.match(sharedAsk({ blueprint: { ...BP, from: null } }), /^Someone shared/)
})

// A blank note must not put an empty quotation in the user's mouth; a missing price must not
// invent one.
test('no note and no price → neither is mentioned', () => {
    const ask = sharedAsk({ blueprint: BP, note: '   ', drawnPrice: null })
    assert.doesNotMatch(ask, /their note/)
    assert.doesNotMatch(ask, /drawn with/)
    assert.doesNotMatch(ask, / {2}/, 'no double spaces where the optional parts were')
})

test('nothing to talk about → null, so the doorway opens silently rather than on nonsense', () => {
    assert.equal(sharedAsk({ blueprint: null }), null)
    assert.equal(sharedAsk({ blueprint: {} }), null)
    assert.equal(sharedAsk(), null)
})

// The plan is settled — the desk is asked to read and size it, not to rebuild it.
test('does not ask Mentor to re-interview or re-draw the plan', () => {
    const ask = sharedAsk({ blueprint: BP })
    assert.doesNotMatch(ask, /re-draw|interview|start over/i)
})
