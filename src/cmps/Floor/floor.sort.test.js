// Pure-function tests for the Floor's sort.
// Node's built-in harness:  node --test src/cmps/Floor/
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { DESK_SORTS, sortOption, sortRows } from './floor.sort.js'

const syms = rows => rows.map(r => r.symbol ?? r.asset)

describe('sortRows', () => {
    const coverage = [
        { symbol: 'MSFT', rating: 'hold',       gap: { pct: 4 },   updated_at: '2026-09-01T00:00:00Z' },
        { symbol: 'aapl', rating: 'strong_buy', gap: { pct: 22 },  updated_at: '2026-10-01T00:00:00Z' },
        { symbol: 'NVDA', rating: 'buy',        gap: null,         updated_at: '2026-09-15T00:00:00Z' },
        { symbol: 'AMD',  rating: 'sell',       gap: { pct: -9 },  updated_at: null },
    ]

    it('returns the rows untouched on default, a missing sort, or an unknown key', () => {
        assert.equal(sortRows(coverage, 'coverage', null), coverage)
        assert.equal(sortRows(coverage, 'coverage', { key: 'default' }), coverage)
        assert.equal(sortRows(coverage, 'coverage', { key: 'gone' }), coverage)
        assert.equal(sortRows(coverage, 'nope', { key: 'symbol' }), coverage)
    })

    it('never mutates the input', () => {
        const before = [...coverage]
        sortRows(coverage, 'coverage', { key: 'symbol', dir: 'asc' })
        assert.deepEqual(coverage, before)
    })

    it('sorts strings case-insensitively, both ways', () => {
        assert.deepEqual(syms(sortRows(coverage, 'coverage', { key: 'symbol', dir: 'asc' })), ['aapl', 'AMD', 'MSFT', 'NVDA'])
        assert.deepEqual(syms(sortRows(coverage, 'coverage', { key: 'symbol', dir: 'desc' })), ['NVDA', 'MSFT', 'AMD', 'aapl'])
    })

    it('ranks ratings by conviction, not alphabet', () => {
        assert.deepEqual(syms(sortRows(coverage, 'coverage', { key: 'rating', dir: 'asc' })), ['aapl', 'NVDA', 'MSFT', 'AMD'])
    })

    // A row with no gap is not "the lowest upside" — flipping the arrow must not float it up.
    it('sinks empty values to the bottom in BOTH directions', () => {
        assert.deepEqual(syms(sortRows(coverage, 'coverage', { key: 'upside', dir: 'desc' })), ['aapl', 'MSFT', 'AMD', 'NVDA'])
        assert.deepEqual(syms(sortRows(coverage, 'coverage', { key: 'upside', dir: 'asc' })), ['AMD', 'MSFT', 'aapl', 'NVDA'])
        assert.equal(syms(sortRows(coverage, 'coverage', { key: 'updated', dir: 'asc' })).at(-1), 'AMD')
    })

    it('falls back to the option’s own direction when the sort carries none', () => {
        // `updated` starts descending — newest first.
        assert.deepEqual(syms(sortRows(coverage, 'coverage', { key: 'updated' })).slice(0, 3), ['aapl', 'NVDA', 'MSFT'])
    })

    it('keeps the server order between ties (stable)', () => {
        const rows = [{ id: 1, status: 'waiting' }, { id: 2, status: 'active' }, { id: 3, status: 'waiting' }]
        assert.deepEqual(sortRows(rows, 'research_queue', { key: 'status', dir: 'asc' }).map(r => r.id), [2, 1, 3])
        assert.deepEqual(sortRows(rows, 'research_queue', { key: 'status', dir: 'desc' }).map(r => r.id), [1, 3, 2])
    })

    // The calendar keeps its days: "by symbol" is alphabetical WITHIN a day, never across them —
    // groupByDay needs same-date rows to stay consecutive.
    it('sorts calendar rows within their day, days staying soonest-first', () => {
        const earnings = [
            { date: '2026-10-05', symbol: 'ZM' }, { date: '2026-10-05', symbol: 'AA' },
            { date: '2026-10-06', symbol: 'MU' }, { date: '2026-10-06', symbol: 'BA' },
        ]
        const out = sortRows(earnings, 'earnings', { key: 'symbol', dir: 'desc' })
        assert.deepEqual(out.map(e => `${e.date}:${e.symbol}`), ['2026-10-05:ZM', '2026-10-05:AA', '2026-10-06:MU', '2026-10-06:BA'])
        const asc = sortRows(earnings, 'earnings', { key: 'symbol', dir: 'asc' })
        assert.deepEqual(asc.map(e => e.symbol), ['AA', 'ZM', 'BA', 'MU'])
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
        assert.equal(sortOption('coverage', { key: 'default' }), null)
        assert.equal(sortOption('coverage', { key: 'symbol' })?.label, 'Symbol')
    })
})
