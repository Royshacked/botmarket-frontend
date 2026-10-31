// Pure-function tests for the Floor's sort.
// Node's built-in harness:  node --test src/cmps/Floor/
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { DESK_SORTS, sortOption, sortRows } from './floor.sort.js'

const syms = rows => rows.map(r => r.symbol ?? r.asset)

describe('sortRows', () => {
    // The trade desk carries the mechanism cases now — the research queue that did went on 2026-10-31 (and the
    // coverage desk before it, 2026-10-14).
    const queue = [
        { symbol: 'MSFT', savedAt: '2026-09-01T00:00:00Z' },
        { symbol: 'aapl', savedAt: '2026-10-01T00:00:00Z' },
        { symbol: 'NVDA', savedAt: '2026-09-15T00:00:00Z' },
        { symbol: 'AMD',  savedAt: null },
    ]

    it('returns the rows untouched on default, a missing sort, or an unknown key', () => {
        assert.equal(sortRows(queue, 'trade', null), queue)
        assert.equal(sortRows(queue, 'trade', { key: 'default' }), queue)
        assert.equal(sortRows(queue, 'trade', { key: 'gone' }), queue)
        assert.equal(sortRows(queue, 'nope', { key: 'symbol' }), queue)
    })

    it('never mutates the input', () => {
        const before = [...queue]
        sortRows(queue, 'trade', { key: 'symbol', dir: 'asc' })
        assert.deepEqual(queue, before)
    })

    it('sorts strings case-insensitively, both ways', () => {
        assert.deepEqual(syms(sortRows(queue, 'trade', { key: 'symbol', dir: 'asc' })), ['aapl', 'AMD', 'MSFT', 'NVDA'])
        assert.deepEqual(syms(sortRows(queue, 'trade', { key: 'symbol', dir: 'desc' })), ['NVDA', 'MSFT', 'AMD', 'aapl'])
    })

    // A row with no date is not "the oldest" — flipping the arrow must not float it up.
    it('sinks empty values to the bottom in BOTH directions', () => {
        assert.deepEqual(syms(sortRows(queue, 'trade', { key: 'newest', dir: 'desc' })), ['aapl', 'NVDA', 'MSFT', 'AMD'])
        assert.deepEqual(syms(sortRows(queue, 'trade', { key: 'newest', dir: 'asc' })), ['MSFT', 'NVDA', 'aapl', 'AMD'])
    })

    it('falls back to the option’s own direction when the sort carries none', () => {
        // `newest` starts descending — newest first.
        assert.deepEqual(syms(sortRows(queue, 'trade', { key: 'newest' })).slice(0, 3), ['aapl', 'NVDA', 'MSFT'])
    })

    it('keeps the server order between ties (stable)', () => {
        const rows = [{ id: 1, direction: 'short' }, { id: 2, direction: 'long' }, { id: 3, direction: 'short' }]
        assert.deepEqual(sortRows(rows, 'trade', { key: 'direction', dir: 'asc' }).map(r => r.id), [2, 1, 3])
        assert.deepEqual(sortRows(rows, 'trade', { key: 'direction', dir: 'desc' }).map(r => r.id), [1, 3, 2])
    })

    // The Earnings / Fed / IPO desks are gone (the Calendar panel, 2026-10-14), and "Analyst companies"
    // (the Forecasts map, the same day), but a browser may still hold a sort saved for one in
    // `floorSorts`. It must be a no-op, never a throw.
    it('treats a sort saved for a removed desk as default', () => {
        const rows = [{ symbol: 'ZM' }, { symbol: 'AA' }]
        for (const desk of ['earnings', 'fed', 'ipo', 'coverage']) {
            assert.equal(sortOption(desk, { key: 'symbol', dir: 'asc' }), null)
            assert.equal(sortRows(rows, desk, { key: 'symbol', dir: 'asc' }), rows)
        }
    })

    it('passes ctx through — portfolio P&L comes from the positions, not the book', () => {
        const books = [{ name: 'A', ideas: [1] }, { name: 'B', ideas: [1, 2] }, { name: 'C', ideas: [] }]
        const pnl = { A: 10, B: -5 }
        const out = sortRows(books, 'portfolio', { key: 'pnl', dir: 'desc' }, { pnlOf: b => (b.name in pnl ? { pnl: pnl[b.name] } : null) })
        assert.deepEqual(out.map(b => b.name), ['A', 'B', 'C'])
    })

    it('reads ms numbers and ISO strings alike as dates', () => {
        const rows = [{ asset: 'A', decidedAt: '2026-10-01T00:00:00Z' }, { asset: 'B', decidedAt: Date.parse('2026-10-03T00:00:00Z') }]
        assert.deepEqual(syms(sortRows(rows, 'queued', { key: 'decided', dir: 'desc' })), ['B', 'A'])
    })
})

describe('DESK_SORTS', () => {
    it('every desk opens on default, and every other option has a value and a starting direction', () => {
        for (const [desk, opts] of Object.entries(DESK_SORTS)) {
            assert.equal(opts[0].key, 'default', desk)
            for (const o of opts.slice(1)) {
                assert.equal(typeof o.value, 'function', `${desk}.${o.key}`)
                assert.ok(['asc', 'desc'].includes(o.dir), `${desk}.${o.key}`)
            }
        }
    })

    it('sortOption treats default as no option', () => {
        assert.equal(sortOption('trade', { key: 'default' }), null)
        assert.equal(sortOption('trade', { key: 'symbol' })?.label, 'Symbol')
    })
})
