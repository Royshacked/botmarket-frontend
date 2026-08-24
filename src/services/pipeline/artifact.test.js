// The envelope every hand-off travels in.
// Node's built-in harness:  node --test src/services/pipeline/artifact.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { KIND, STATUS, makeArtifact, resolveArtifact, firstItem } from './artifact.js'

test('an unknown kind is refused at the door', () => {
    assert.throws(() => makeArtifact({ kind: 'vibes' }), /unknown kind/)
    assert.throws(() => makeArtifact({}), /unknown kind/)
})

test('status is inferred from the payload, and empty is a real answer', () => {
    assert.equal(makeArtifact({ kind: KIND.CANDIDATE_LIST, items: [{ ticker: 'NVDA' }] }).status, STATUS.FILLED)
    assert.equal(makeArtifact({ kind: KIND.CANDIDATE_LIST, items: [] }).status, STATUS.EMPTY)
    assert.equal(makeArtifact({ kind: KIND.CANDIDATE_LIST }).status, STATUS.EMPTY)
})

// `partial` is never inferred — only the emitter knows it fell short of what was asked for.
test('a stated status is never overridden', () => {
    const a = makeArtifact({ kind: KIND.CANDIDATE_LIST, items: [{ ticker: 'AAPL' }], status: STATUS.PARTIAL, note: 'two sleeves came back short' })
    assert.equal(a.status, STATUS.PARTIAL)
    assert.equal(a.note, 'two sleeves came back short')
})

test('ref and items both travel; consumers read one shape either way', () => {
    const inline = makeArtifact({ kind: KIND.CANDIDATE_LIST, items: [{ ticker: 'NVDA' }] })
    const saved  = makeArtifact({ kind: KIND.CANDIDATE_LIST, ref: { entityKind: 'scan', id: 's1' } })

    assert.deepEqual(resolveArtifact(inline).items, [{ ticker: 'NVDA' }])
    assert.equal(resolveArtifact(inline).ref, null)
    assert.deepEqual(resolveArtifact(saved).items, [])
    assert.deepEqual(resolveArtifact(saved).ref, { entityKind: 'scan', id: 's1' })
    // Not empty: it has a ref, which is addressable even with nothing inline.
    assert.equal(resolveArtifact(saved).isEmpty, false)
    assert.equal(resolveArtifact(makeArtifact({ kind: KIND.MANDATE })).isEmpty, true)
})

test('items win over ref — inline is what the emitter just produced', () => {
    const both = makeArtifact({ kind: KIND.CANDIDATE_LIST, items: [{ ticker: 'MSFT' }], ref: { entityKind: 'scan', id: 's1' } })
    assert.deepEqual(resolveArtifact(both).items, [{ ticker: 'MSFT' }])
    assert.equal(firstItem(both).ticker, 'MSFT')
})

test('firstItem is null rather than a crash when nothing is inline', () => {
    assert.equal(firstItem(makeArtifact({ kind: KIND.SCAN_REQUEST })), null)
    assert.equal(firstItem(null), null)
})

// Panels seed on a key, not a value: the same ticker handed over twice is two hand-offs, and two
// hops planned in one tick must not collide.
test('every artifact gets its own delivery key', () => {
    const keys = new Set()
    for (let i = 0; i < 50; i++) keys.add(makeArtifact({ kind: KIND.SCAN_REQUEST }).key)
    assert.equal(keys.size, 50)
})

test('an artifact cannot be edited in flight', () => {
    const a = makeArtifact({ kind: KIND.SCAN_REQUEST, context: { direction: 'long' } })
    assert.throws(() => { a.kind = KIND.MANDATE }, TypeError)
})
