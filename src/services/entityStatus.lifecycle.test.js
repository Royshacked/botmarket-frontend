// Pure-function tests for the lifecycle bucketing the Floor lists group by.
// Node's built-in harness:  node --test src/services/
import test from 'node:test'
import assert from 'node:assert/strict'
import {
    STATUS, BUCKET, BUCKET_ORDER, BUCKET_LABEL,
    lifecycleBucket, groupByLifecycle,
} from './entityStatus.js'

test('every status on the ladder lands in a bucket', () => {
    for (const status of Object.values(STATUS)) {
        const b = lifecycleBucket(status)
        assert.ok(BUCKET_ORDER.includes(b), `${status} → ${b} is not a known bucket`)
    }
})

test('each rung maps to the bucket that describes what it wants from you', () => {
    assert.equal(lifecycleBucket(STATUS.HIT),     BUCKET.READY)
    assert.equal(lifecycleBucket(STATUS.LONG),    BUCKET.IN_POSITION)
    assert.equal(lifecycleBucket(STATUS.SHORT),   BUCKET.IN_POSITION)
    assert.equal(lifecycleBucket(STATUS.LOOKING), BUCKET.LOOKING)
    assert.equal(lifecycleBucket(STATUS.WAITING), BUCKET.WAITING)
    assert.equal(lifecycleBucket(STATUS.CLOSED),  BUCKET.CLOSED)
})

test('resting rides with looking — both mean monitored, not yet in', () => {
    assert.equal(lifecycleBucket(STATUS.RESTING), lifecycleBucket(STATUS.LOOKING))
})

// The list must never silently swallow a row. An unknown status is a data problem; hiding it
// would turn that into an invisible one.
test('an unknown or missing status falls back to WAITING rather than vanishing', () => {
    assert.equal(lifecycleBucket('not_a_status'), BUCKET.WAITING)
    assert.equal(lifecycleBucket(undefined),      BUCKET.WAITING)
    assert.equal(lifecycleBucket(null),           BUCKET.WAITING)
})

test('ready outranks in position — it is the one that stops working if ignored', () => {
    assert.deepEqual(BUCKET_ORDER, [
        BUCKET.READY, BUCKET.IN_POSITION, BUCKET.LOOKING, BUCKET.WAITING, BUCKET.CLOSED,
    ])
})

test('every bucket has a label', () => {
    for (const b of BUCKET_ORDER) assert.equal(typeof BUCKET_LABEL[b], 'string')
})

// ── groupByLifecycle ──────────────────────────────────────────────────────────

const e = (id, status) => ({ id, status })

test('groups follow BUCKET_ORDER regardless of input order', () => {
    const groups = groupByLifecycle([
        e('a', STATUS.WAITING), e('b', STATUS.LONG), e('c', STATUS.HIT), e('d', STATUS.LOOKING),
    ])
    assert.deepEqual(groups.map(g => g.key), [
        BUCKET.READY, BUCKET.IN_POSITION, BUCKET.LOOKING, BUCKET.WAITING,
    ])
})

test('empty buckets are dropped, so a uniform list renders as one group', () => {
    const groups = groupByLifecycle([e('a', STATUS.LOOKING), e('b', STATUS.LOOKING)])
    assert.equal(groups.length, 1)
    assert.equal(groups[0].key, BUCKET.LOOKING)
    assert.equal(groups[0].items.length, 2)
})

test('input order is preserved inside a bucket — ordering within is the caller’s', () => {
    const groups = groupByLifecycle([e('x', STATUS.LOOKING), e('y', STATUS.LOOKING), e('z', STATUS.LOOKING)])
    assert.deepEqual(groups[0].items.map(i => i.id), ['x', 'y', 'z'])
})

test('no entity is lost across grouping', () => {
    const input = [
        e('a', STATUS.WAITING), e('b', STATUS.LONG),  e('c', STATUS.HIT),
        e('d', STATUS.LOOKING), e('e', STATUS.CLOSED), e('f', 'garbage'),
    ]
    const total = groupByLifecycle(input).reduce((n, g) => n + g.items.length, 0)
    assert.equal(total, input.length)
})

test('an empty list yields no groups', () => {
    assert.deepEqual(groupByLifecycle([]), [])
    assert.deepEqual(groupByLifecycle(), [])
})
