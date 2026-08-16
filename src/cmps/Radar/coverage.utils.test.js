// Pure-function tests for the coverage reading helpers.
// Node's built-in harness:  node --test src/cmps/Radar/
import test from 'node:test'
import assert from 'node:assert/strict'
import { nextRevision } from './coverage.utils.js'

const NOW = Date.parse('2026-08-16T12:00:00.000Z')
const cov = (over = {}) => ({
    id: 'cov1', symbol: 'TSM', status: 'active',
    monitor: { next_remodel_at: '2026-11-03T00:00:00.000Z' },
    ...over,
})

// ── nextRevision ──────────────────────────────────────────────────────────────

test('a future stamp reads as a date, not as due', () => {
    const r = nextRevision(cov(), NOW)
    assert.equal(r.due, false)
    assert.equal(r.iso, '2026-11-03T00:00:00.000Z')
    assert.match(r.label, /3/)   // locale-agnostic: the day survives every format
})

test('the year is dropped inside this year and kept outside it', () => {
    const thisYear = nextRevision(cov(), NOW).label
    const nextYear = nextRevision(cov({ monitor: { next_remodel_at: '2027-02-01T00:00:00.000Z' } }), NOW).label
    assert.ok(!thisYear.includes('2026'), `expected no year in "${thisYear}"`)
    assert.ok(nextYear.includes('2027'), `expected a year in "${nextYear}"`)
})

test('a UTC-midnight stamp does not slip a day west of Greenwich', () => {
    // The schedule is UTC-anchored, so formatting it locally would render 2026-11-03T00:00Z as
    // "Nov 2" in New York — a day earlier than the re-model actually runs.
    const r = nextRevision(cov(), NOW)
    assert.match(r.label, /\b3\b/)
    assert.ok(!/\b2\b/.test(r.label), `expected no "2" (the western slip) in "${r.label}"`)
})

test('a stamp already passed says "due" rather than showing a stale date', () => {
    // The monitor may be holding it on the 14-day cooldown or the 3-per-tick cap — either way the
    // schedule says now, and printing a date from last month would read as a missed appointment.
    const r = nextRevision(cov({ monitor: { next_remodel_at: '2026-07-01T00:00:00.000Z' } }), NOW)
    assert.deepEqual(r, { iso: '2026-07-01T00:00:00.000Z', label: 'due', reason: null, due: true })
})

// ── the reason ────────────────────────────────────────────────────────────────
// Passed through from `monitor.next_remodel_reason`, never re-derived here.

test('the stamped reason rides along, on a scheduled row and a due one alike', () => {
    const monitor = { next_remodel_at: '2026-11-03T00:00:00.000Z', next_remodel_reason: 'Q3 earnings' }
    assert.equal(nextRevision(cov({ monitor }), NOW).reason, 'Q3 earnings')
    assert.equal(nextRevision(cov({ monitor }), Date.parse('2026-12-01T00:00:00Z')).reason, 'Q3 earnings')
})

test('a doc written before the monitor stamped reasons still renders — the date is what matters', () => {
    // The whole existing book is in this state until each name ticks once. A missing label must
    // degrade to no label, never to no row.
    const r = nextRevision(cov(), NOW)
    assert.ok(r)
    assert.equal(r.reason, null)
})

test('a blank or non-string reason is treated as absent', () => {
    for (const next_remodel_reason of ['', '   ', null, 7, { note: 'x' }, ['a']]) {
        const r = nextRevision(cov({ monitor: { next_remodel_at: '2026-11-03T00:00:00.000Z', next_remodel_reason } }), NOW)
        assert.equal(r.reason, null, `expected null for ${JSON.stringify(next_remodel_reason)}`)
    }
})

test('the boundary instant is due, not scheduled', () => {
    const r = nextRevision(cov({ monitor: { next_remodel_at: new Date(NOW).toISOString() } }), NOW)
    assert.equal(r.due, true)
})

test('a RETIRED thesis has no next revision — the monitor skips it', () => {
    // coverage.monitor selects `status: {$ne: retired}`, so a date here would promise a run that
    // never comes. This is the one status that stops the loop.
    assert.equal(nextRevision(cov({ status: 'retired' }), NOW), null)
})

test('a thesis that already hit its target KEEPS its schedule', () => {
    // Only retirement stops the research — target_hit is a verdict the user may still revise past.
    assert.ok(nextRevision(cov({ status: 'target_hit' }), NOW))
})

test('no stamp, no monitor subtree, and junk all render nothing', () => {
    for (const c of [
        cov({ monitor: { next_remodel_at: null } }),
        cov({ monitor: { next_remodel_at: '' } }),
        cov({ monitor: {} }),
        cov({ monitor: undefined }),
        cov({ monitor: { next_remodel_at: 'not a date' } }),
        cov({ monitor: { next_remodel_at: 12345 } }),
        undefined,
    ]) {
        assert.equal(nextRevision(c, NOW), null)
    }
})
