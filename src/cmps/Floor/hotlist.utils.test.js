// The Hotlist's words and numbers (docs/design/daily-names.md §5, §8). Node's built-in harness:
// node --test src/cmps/Floor/
import test from 'node:test'
import assert from 'node:assert/strict'
import { readTime, fmtRange, rangeTitle, bestColumn, catalystChip, earningsChip, rowStatus, rowReason, sortList, askArgusText, handoffRead, sparkGeometry, pickFor, horizonRows, horizonCounts, readsBySymbol, readCell, hasBand, resultCell, gradeRecord, columnRecord, bookResult, bookProgress, bookOrigin, bookRecordLine, sortBook, isBuy } from './hotlist.utils.js'
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

// ─── A list per horizon (docs/design/horizon-chains.md §1, §3) ────────────────

test('pickFor: the per-column pick, or the old single pick on its own column only', () => {
    assert.deepEqual(pickFor({ picks: { week: { rank: 2 } } }, 'week'), { rank: 2 })
    assert.equal(pickFor({ picks: { week: { rank: 2 } } }, 'open'), null)
    assert.equal(pickFor({ pick: { column: 'mid', rank: 1 } }, 'mid').rank, 1)
    assert.equal(pickFor({ pick: { column: 'mid', rank: 1 } }, 'week'), null)
})

test('horizonRows: the graded names, his picks first in his order, then grade, then room', () => {
    const rows = [
        { symbol: 'C', cells: { week: { grade: 'C', range: { atr_mult: 1 } } }, picks: { week: { rank: 1 } } },
        { symbol: 'A', cells: { week: { grade: 'A', range: { atr_mult: 1 } } } },
        { symbol: 'B', cells: { week: { grade: 'A', range: { open_sky: true } } } },
        { symbol: 'X', cells: { open: { grade: 'A' } } },
    ]
    assert.deepEqual(horizonRows(rows, 'week').map(r => r.symbol), ['C', 'B', 'A'])
    assert.deepEqual(horizonCounts(rows), { open: 1, mid: 0, eod: 0, tomorrow: 0, week: 3 })
})

test('readsBySymbol keeps the live read over a settled one; readCell says the number and what is open', () => {
    const by = readsBySymbol([
        { symbol: 'Z', status: 'expired', set_at: '2026-10-20', target: { value: 10 } },
        { symbol: 'Z', status: 'active', set_at: '2026-10-01', target: { value: 12, open_pct: 4.4 }, valid_until: '2026-11-01', verdict: 'credible' },
    ])
    assert.equal(by.get('Z').status, 'active')
    assert.equal(readCell(by.get('Z')).text, '12.00 · +4.4%')
    assert.equal(readCell({ status: 'hit', target: { value: 12, open_pct: 4 }, valid_until: 'x', verdict: 'credible' }).text, '12.00 · hit')
    assert.equal(readCell({ status: 'pass', verdict: 'contradicted' }).text, 'pass')
    assert.equal(readCell(null), null)
})

// The code review of 2026-10-24.
test('a band needs both ends; a one-ended band is a target without a band, not a crash', () => {
    assert.equal(hasBand({ low: 1, high: 2 }), true)
    assert.equal(hasBand({ low: 1, high: null }), false)
    const cell = readCell({ status: 'active', verdict: 'credible', valid_until: '2026-10-26', target: { value: 31, low: 30.5, high: null, open_pct: 3 } })
    assert.doesNotMatch(cell.title, /band/)
    assert.match(readCell({ status: 'pass', verdict: 'credible', pass_reason: 'report_too_close' }).title, /before its report/)
})

test("readsBySymbol with the list's day: a settled read from another day's board is left out; an active one never is", () => {
    const by = readsBySymbol([
        { symbol: 'OLD', status: 'expired', context: { day: '2026-10-12' } },
        { symbol: 'LIVE', status: 'active', context: { day: '2026-10-20' } },
        { symbol: 'TODAY', status: 'pass', context: { day: '2026-10-23' } },
    ], '2026-10-23')
    assert.deepEqual([...by.keys()].sort(), ['LIVE', 'TODAY'])
})

test("sortList on a horizon: the grade is that column's, and the tie-break is that column's pick", () => {
    const rows = [
        { symbol: 'MIX', cells: { open: { grade: 'A' }, week: { grade: 'C' } } },
        { symbol: 'WK', cells: { week: { grade: 'B' } } },
        { symbol: 'PK', cells: { week: { grade: 'B' } }, picks: { week: { rank: 1 } } },
    ]
    assert.deepEqual(sortList(rows, 'grade', 'desc', 'week').map(r => r.symbol), ['PK', 'WK', 'MIX'])
    assert.deepEqual(sortList(rows, 'grade', 'desc').map(r => r.symbol)[0], 'MIX', 'off a horizon: the best column')
})

// Did it work? (Roy, 2026-10-24)
test('resultCell: reached / missed / up / down once scored, open or scoring before', () => {
    const moves = { mfe_pct: 3.2, mae_pct: -0.4, ret_pct: 2.5, level: 103 }
    assert.deepEqual(resultCell({ state: 'reached', ...moves }), { text: '✓ reached', tone: 'good', title: 'Reached 103.00 — best +3.2%, worst -0.4%, ended +2.5%' })
    assert.equal(resultCell({ state: 'missed', ...moves, mfe_pct: 1.2 }).text, '✗ best +1.2%')
    assert.equal(resultCell({ state: 'missed', ...moves }).tone, 'bad')
    assert.equal(resultCell({ state: 'up', ret_pct: 1.9 }).text, '↑ +1.9%')
    assert.equal(resultCell({ state: 'down', ret_pct: -0.8 }).text, '↓ -0.8%')
    assert.match(resultCell({ state: 'open', ends: '2026-10-28' }).title, /until 2026-10-28/)
    assert.equal(resultCell({ state: 'scoring' }).tone, 'dim')
    assert.match(resultCell({ state: 'missed', ...moves, partial: true }).title, /partial window/)
    assert.equal(resultCell(null), null)
})

test("a grade's record and a column's: the hit rate over names with a level, the up rate over all, how far from verified", () => {
    const summary = { week: { n: 9, sessions: 6, verified: false, grades: {
        A: { n: 5, judged: 4, hit_rate: 75, up_rate: 60 }, B: { n: 4, judged: 0, hit_rate: null, up_rate: 50 }, C: { n: 0 } } } }
    assert.equal(gradeRecord(summary, 'week', 'A'), 'reached 75% of 4 · up 60% of 5')
    assert.equal(gradeRecord(summary, 'week', 'B'), 'up 50% of 4', 'no name with a level: no hit rate')
    assert.equal(gradeRecord(summary, 'week', 'C'), null)
    assert.equal(gradeRecord(null, 'week', 'A'), null)
    const rec = columnRecord(summary, 'week')
    assert.deepEqual(rec.grades.map(g => g.grade), ['A', 'B'])
    assert.equal(rec.progress, '6 of 40 sessions, 9 of 30 names')
    assert.equal(columnRecord({ week: { ...summary.week, verified: true } }, 'week').progress, null)
})

// The house's book — Swing and Long term (Roy, 2026-10-24)
test("a book row's result: ✓ hit / ✗ broken / expired once settled; live, its move since set, toned by SPY", () => {
    assert.equal(bookResult({ state: 'hit', since_set_pct: 20 }).text, '✓ hit')
    assert.equal(bookResult({ state: 'broken' }).tone, 'bad')
    assert.equal(bookResult({ state: 'expired' }).text, 'expired')
    const live = bookResult({ state: 'live', since_set_pct: 4.2, vs_spy: -1.3, spy_since_pct: 5.5, set_at: '2026-09-01T14:00:00Z' })
    assert.deepEqual([live.text, live.tone], ['+4.2% (-1.3%)', 'bad'])
    assert.match(live.title, /Since the target was set \(2026-09-01\): \+4\.2%; SPY \+5\.5%/)
    assert.equal(bookResult({ state: 'live', since_set_pct: null }).text, '—')
})

test('progress, origin and the record line', () => {
    assert.equal(bookProgress({ progress: 0.62 }), '62%')
    assert.equal(bookProgress({ progress: null }), null)
    assert.equal(bookOrigin({ origin: { source: 'desk' } }).text, 'desk')
    assert.match(bookOrigin({ origin: { source: 'pythia', subject: 'Rails', verdict: 'long_term', kind: 'industry' } }).title, /long-term call on the industry Rails/)
    const line = bookRecordLine({ n: 10, hit: 2, broken: 1, expired: 1, hit_rate: 50, priced: 6, median_since: 3.8, median_vs_spy: 1.2, beat_spy: 66.7 })
    assert.equal(line.settled, 'settled 4: 2 hit, 1 broken, 1 expired — 50% hit')
    assert.equal(line.live, 'median +3.8% since set, +1.2% vs SPY; 67% beating SPY (6 priced)')
    assert.equal(bookRecordLine({ n: 3, hit: 0, broken: 0, expired: 0, priced: 0 }).settled, 'no target has come due yet')
    assert.equal(bookRecordLine({ n: 0 }), null)
})

test('the book sorts by a column, missing values last; buys are buy and strong buy', () => {
    const rows = [{ symbol: 'A', upside_pct: 5 }, { symbol: 'B', upside_pct: null }, { symbol: 'C', upside_pct: 40 }]
    assert.deepEqual(sortBook(rows, 'upside', null).map(r => r.symbol), ['C', 'A', 'B'])
    assert.deepEqual(sortBook(rows, 'upside', 'asc').map(r => r.symbol), ['A', 'C', 'B'])
    assert.deepEqual(sortBook(rows, null).map(r => r.symbol), ['A', 'B', 'C'], 'no key: the server order')
    assert.deepEqual(['strong_buy', 'buy', 'hold', 'sell'].map(rating => isBuy({ rating })), [true, true, false, false])
})

test("a book row's hand-offs: Mentor gets the thesis in numbers and the chain's reason; Argus the timing question", () => {
    const row = { symbol: 'CHN', rating: 'strong_buy', target: 130, target_date: '2027-03-01', upside_pct: 30,
        origin: { source: 'pythia', subject: 'Railroads', why: 'the leader' } }
    assert.equal(handoffRead(row, 'swing'), 'Prometheus strong buy, target 130.00 by 2027-03-01 (a swing name) — the leader')
    assert.equal(askArgusText(row, 'long_term'),
        "From the house's long term book: CHN — Prometheus strong buy, target 130.00 by 2027-03-01, +30.0% upside, from Pythia's call on Railroads. Is now a good time to buy it, and what would make it wrong?")
})

test('a live book row level with SPY is neither ahead nor behind', () => {
    assert.equal(bookResult({ state: 'live', since_set_pct: 0, vs_spy: 0, spy_since_pct: 0, set_at: '2026-10-23' }).tone, 'dim')
})

// Roy, 2026-10-24: RCL's 08:00 Last sat over a 15:51 target — the cell measures from the read's own price.
test("a read's target is measured from the price it was set from, with when", () => {
    const read = { status: 'active', verdict: 'credible', set_at: '2026-10-23T19:51:24Z', valid_until: '2026-10-26T21:00:00Z', price_at_read: 276.7,
        target: { value: 280.85, open_pct: 1.5, spot: 276.7 } }
    const cell = readCell(read)
    assert.equal(cell.text, '280.85 · +1.5% from 276.70')
    assert.match(cell.title, /set from 276\.70 at the read \(Oct 23, 15:51 ET\)/)
    assert.equal(readTime('2026-10-23T19:51:24Z'), 'Oct 23, 15:51 ET')
    assert.match(readCell({ status: 'pass', verdict: 'credible', pass_reason: 'too_small' }).title, /too little left open to trade/)
})

test('a book row goes to Mentor as which list — never with its own horizon or target — and a board row as before', () => {
    const t = handoffTurn({ ticker: 'chn', direction: 'long', thesis: 'x', book: { column: 'swing', horizon: 'intraday' } })
    assert.deepEqual(t.seed.book, { column: 'swing' })
    assert.equal(t.seed.hotlist, undefined)
    assert.equal(handoffTurn({ ticker: 'A', hotlist: { board: 'hb_2026-10-23_mid', column: 'mid' } }).seed.book, undefined)
})

test("Argus's record line: picks, avoids and unmarked — per column, or all; null with nothing scored", async () => {
    const { argusRecordLine } = await import('./hotlist.utils.js')
    const summary = { argus: { all: { pick: { n: 11, up_rate: 72.7, ret_mean: 0.58 }, avoid: { n: 20, up_rate: 60, ret_mean: 0.46 }, unmarked: { n: 0 } } } }
    assert.deepEqual(argusRecordLine(summary), [['picks', 'up 73% · avg +0.6% (11)'], ['avoids', 'up 60% · avg +0.5% (20)'], ['unmarked', 'none yet']])
    assert.equal(argusRecordLine(summary, 'week'), null)
    assert.equal(argusRecordLine({}), null)
})
