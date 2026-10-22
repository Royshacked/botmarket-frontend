// The Hotlist's words and numbers (docs/design/daily-names.md §5, §8). Node's built-in harness:
// node --test src/cmps/Floor/
import test from 'node:test'
import assert from 'node:assert/strict'
import { fmtRange, rangeTitle, bestColumn, catalystChip, earningsChip, rowStatus, rowReason, sortList, askArgusText, handoffRead, sparkGeometry } from './hotlist.utils.js'
import { handoffTurn } from '../MentorSurface/mentorSurface.utils.js'

const ROW = {
    symbol: 'SPCX', gap_pct: 10.14, rvol: 3.39,
    catalyst: { material: true, type: 'drift', surprise: 'mixed', headline: 'SpaceX swings to profit' },
    cells: {
        mid: { grade: 'B', why: ['3.39× normal volume, above the open'], range: { level: 166.18, pct: 2.09, atr_mult: 0.45 } },
        eod: { grade: 'A', range: { level: 170, pct: 4, atr_mult: 0.9 } },
        tomorrow: { grade: null, gate: 'atr' },
    },
}

test('free range reads as % and × ATR, or open sky — never a target', () => {
    assert.equal(fmtRange({ pct: 2.09, atr_mult: 0.45 }), '2.1% · 0.45× ATR')
    assert.equal(fmtRange({ open_sky: true }), 'open sky')
    assert.equal(fmtRange(null), null)
    assert.match(rangeTitle({ level: 166.18 }), /Room to 166\.18/)
})

test('the hand-off column: Argus\'s pick column first, else the best grade, then the most room', () => {
    assert.equal(bestColumn(ROW, ['mid', 'eod', 'tomorrow']), 'eod')
    assert.equal(bestColumn({ ...ROW, pick: { column: 'mid' } }, ['mid', 'eod']), 'mid')
    assert.equal(bestColumn({ ...ROW, pick: { column: 'tomorrow' } }, ['mid', 'eod', 'tomorrow']), 'eod', 'a pick on an ungraded column is not followed')
    assert.equal(bestColumn({ cells: { mid: { grade: null } } }, ['mid']), null)
})

test('the catalyst chip', () => {
    assert.equal(catalystChip(ROW.catalyst), 'drift · mixed')
    assert.equal(catalystChip({ material: false }), 'not material')
    assert.equal(catalystChip(null), null)
})

test('the earnings chip: a graded week cell holding the report says to be out before it', () => {
    const row = { next_earnings: '2026-10-28', cells: { week: { grade: 'B', exit_before: '2026-10-28' } } }
    assert.deepEqual(earningsChip(row), { text: 'E 10-28 · out before', title: 'Earnings 2026-10-28 — a run-up into the report: be out before it', exit: true })
    assert.equal(earningsChip({ ...row, cells: { week: { grade: 'B' } } }).text, 'E 10-28', 'report outside the window: just the date')
    assert.equal(earningsChip({ ...row, cells: { week: { grade: null, exit_before: '2026-10-28' } } }).exit, false, 'an ungraded cell is no trade')
    assert.equal(earningsChip({ cells: {} }), null)
})

test('"Ask Argus" puts the row\'s facts to Argus as the user\'s own question', () => {
    const t = askArgusText(ROW, 'mid')
    assert.match(t, /^From today's hotlist: SPCX — Mid-day B, \+10\.1% gap, 3\.39× volume, free range 2\.1% · 0\.45× ATR, news: "SpaceX swings to profit"\./)
    assert.match(t, /what would make it wrong\?$/)
})

test('the opening read: Argus\'s note, else the board\'s own reason', () => {
    assert.equal(handoffRead({ ...ROW, pick: { why: 'A real profit swing.' } }, 'mid'), 'A real profit swing.')
    assert.equal(handoffRead(ROW, 'mid'), '3.39× normal volume, above the open')
    assert.equal(handoffRead(ROW, 'eod'), null)
})

test('the Mentor seed carries the board REFERENCE only — no grade, no facts from the client', () => {
    const turn = handoffTurn({ ticker: 'spcx', direction: 'long', thesis: 'A real profit swing.', hotlist: { board: 'hb_2026-10-21_mid', column: 'mid', grade: 'A' } })
    assert.equal(turn.seed.ticker, 'SPCX')
    assert.deepEqual(turn.seed.hotlist, { board: 'hb_2026-10-21_mid', column: 'mid' })
    assert.match(turn.text, /I want to work on a SPCX trade — the read on it is: A real profit swing\./)
    assert.equal(handoffTurn({ ticker: 'X' }).seed.hotlist, undefined)
})

// ─── sparkGeometry (Roy, 2026-10-22: a small chart per row) ───

const CLOSES = [100, 101, 99, 102, 104]

test('spark: closes, today’s dot and the level share one scale — the highest value at the top', () => {
    const g = sparkGeometry(CLOSES, { price: 110, level: 112, w: 90, h: 28, pad: 3 })
    assert.equal(g.levelY, 3, '112 is the highest → the top edge')
    assert.equal(g.dot.x, 87)
    assert.ok(g.dot.y > g.levelY, 'the room overhead: the dot sits below the dash')
    assert.ok(g.line.startsWith('M3 23.3 '), '100 sits just above the 99 floor (y 25)')
    assert.equal(g.up, true)
    assert.equal(g.changePct, 10)
})

test('spark: no level (open sky) → no dash; no live price → the last close is the dot', () => {
    const g = sparkGeometry(CLOSES)
    assert.equal(g.levelY, null)
    assert.equal(g.changePct, 4)
})

test('spark: a fall reads as down', () => {
    assert.equal(sparkGeometry([100, 98, 95], { price: 94 }).up, false)
})

test('spark: too little to draw → null; a flat series does not divide by zero', () => {
    assert.equal(sparkGeometry(null), null)
    assert.equal(sparkGeometry([100]), null)
    assert.doesNotMatch(sparkGeometry([100, 100, 100]).line, /NaN/)
})

test('row status: the server\'s, else from the cells — a session grade or a story is in play, a date alone is setting up', () => {
    assert.equal(rowStatus({ status: 'building', cells: {} }), 'building')
    assert.equal(rowStatus({ cells: { mid: { grade: 'C' } } }), 'in_play')
    assert.equal(rowStatus({ cells: { week: { grade: 'B' } }, catalyst: { material: true } }), 'in_play')
    assert.equal(rowStatus({ cells: { week: { grade: 'B' } } }), 'setting_up')
    assert.equal(rowStatus({ cells: { week: { grade: null } } }), null)
})

test('the reason: the best column\'s own words', () => {
    const row = { cells: { mid: { grade: 'C', why: ['1.6× volume'] }, week: { grade: 'A', why: ['NR7', 'RS +4'], range: { open_sky: true } } } }
    assert.equal(rowReason(row), 'NR7; RS +4')
    assert.equal(rowReason({ cells: {} }), null)
})

test('the list sorts by any column; a missing value sorts last either way; ties keep picks first', () => {
    const rows = [
        { symbol: 'B', price: 10, next_earnings: '2026-10-30' },
        { symbol: 'A', price: 30 },
        { symbol: 'C', price: 20, next_earnings: '2026-10-25', pick: { rank: 1 } },
        { symbol: 'D', price: null },
    ]
    assert.deepEqual(sortList(rows, 'price').map(r => r.symbol), ['A', 'C', 'B', 'D'], 'price sorts high first')
    assert.deepEqual(sortList(rows, 'price', 'asc').map(r => r.symbol), ['B', 'C', 'A', 'D'], 'no price stays last')
    assert.deepEqual(sortList(rows, 'earnings').map(r => r.symbol), ['C', 'B', 'A', 'D'], 'no date is not "soonest"')
    assert.deepEqual(sortList([{ symbol: 'Z', price: 1 }, { symbol: 'Y', price: 1, pick: {} }], 'price').map(r => r.symbol), ['Y', 'Z'])
    const graded = [{ symbol: 'C1', cells: { mid: { grade: 'C', range: { atr_mult: 9 } } } }, { symbol: 'A1', cells: { week: { grade: 'A', range: { atr_mult: 1 } } } }]
    assert.deepEqual(sortList(graded, 'grade').map(r => r.symbol), ['A1', 'C1'], 'the grade outranks the room')
    assert.equal(sortList(rows, 'price').length, 4)
    assert.notEqual(sortList(rows, 'price'), rows, 'a new array')
})
