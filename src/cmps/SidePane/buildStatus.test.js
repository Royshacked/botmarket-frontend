import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildWords, lastStep, buildKeys, buildChanges } from './buildStatus.js'

// A build in the background, as the screen says it (modes-and-builders.md step 5b).

const b = (status) => ({ id: 'b1', status, title: 'NVDA trade', since: 1 })

test('each status in words', () => {
    assert.equal(buildWords('mentor', b('building')), 'The trader is building NVDA trade in the background. The chat is free meanwhile.')
    assert.equal(buildWords('mentor', b('ready')), 'NVDA trade is ready. Review it here, then Generate.')
    assert.match(buildWords('portfolio', b('awaiting')), /^The portfolio manager has a question on NVDA trade — answer it on the card/)
    assert.match(buildWords('mentor', b('queued')), /queued/)
    assert.equal(buildWords('mentor', null), null)
    // The TSLA prod build (2026-11-21): the analyst's PASS read "found no trade on coverage".
    const pass = { id: 'b2', status: 'declined', title: 'TSLA coverage', reason: "I can't defend a price target", since: 1 }
    assert.equal(buildWords('analyst', pass), "The analyst passed on TSLA coverage: I can't defend a price target")
    assert.match(buildWords('mentor', { ...b('declined'), reason: 'x' }), /^The trader found no trade on NVDA: x$/)
})

test("the latest step is the build's last reply", () => {
    const rows = [
        { seq: 1, agent: 'mentor', role: 'assistant', content: 'Reading the chart.', ref: { build: 'b1' } },
        { seq: 2, agent: 'axl', role: 'assistant', content: 'The market is closed.' },
        { seq: 3, agent: 'mentor', role: 'assistant', content: 'Levels drawn.', ref: { build: 'b1' } },
    ]
    assert.equal(lastStep(rows, 'mentor', b('building')), 'Levels drawn.')
})

test('a build that starts opens its desk; one that becomes ready is announced — each once', () => {
    const s1 = { mentor: { build: b('building') } }
    const k1 = buildKeys(s1)
    assert.deepEqual(buildChanges({}, k1, s1), { started: ['mentor'], ready: [] })
    assert.deepEqual(buildChanges(k1, k1, s1), { started: [], ready: [] }, 'no change, no news')
    const s2 = { mentor: { build: b('ready') } }
    assert.deepEqual(buildChanges(k1, buildKeys(s2), s2), { started: [], ready: ['mentor'] })
})
