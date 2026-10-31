// The Hotlist's words and numbers (docs/design/daily-names.md §5, §8). Node's built-in harness:
// node --test src/cmps/Floor/
import test from 'node:test'
import assert from 'node:assert/strict'
import { readTime, fmtRange, rangeTitle, bestColumn, catalystChip, earningsChip, rowStatus, rowReason, sortList, askArgusText, handoffRead, sparkGeometry, pickFor, horizonRows, horizonCounts, readsBySymbol, readCell, hasBand, resultCell, columnRecord, bookResult, bookProgress, bookOrigin, bookRecordLine, sortBook, isBuy, scoreCell, hotlistHandoff } from './hotlist.utils.js'
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
    assert.match(t, /^From today's hotlist: SPCX — Mid-day, \+10\.1% gap, 3\.39× volume, free range 2\.1% · 0\.45× ATR, news: "SpaceX swings to profit"\./)
    assert.match(t, /what would make it wrong\?$/)
    // No horizon carries a grade (2026-10-24), the week included.
    assert.match(askArgusText({ symbol: 'X', cells: { week: { grade: 'A' } } }, 'week'), /X — This week\./)
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

test("a column's record carries no grades (2026-10-24) — the board against its cut, once there is one", () => {
    const summary = { week: { n: 9, sessions: 6, verified: false, grades: { A: { n: 5, judged: 4, hit_rate: 75, up_rate: 60 } } } }
    assert.deepEqual(columnRecord(summary, 'week'), { cut: null, rule: null })
    assert.equal(columnRecord(null, 'week'), null)
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
    // "valued at", never "target": the sentence goes out as the user's, and Mentor built a "target" as their take-profit (NXST).
    assert.equal(handoffRead(row, 'swing'), 'Prometheus strong buy, valued at 130.00 by 2027-03-01 (a swing name) — the leader')
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

test("Build with Mentor opens in the thesis lens — a board row by reference, a book row by list; nothing without a name", () => {
    const board = handoffTurn(hotlistHandoff(ROW, 'mid', { id: 'hb_2026-10-21_mid' }))
    assert.equal(board.seed.recommended_mode, 'thesis')
    assert.deepEqual(board.seed.hotlist, { board: 'hb_2026-10-21_mid', column: 'mid' })
    assert.equal(board.seed.direction, 'long')
    const book = handoffTurn(hotlistHandoff({ symbol: 'chn', rating: 'buy', target: 12 }, 'swing', null))
    assert.deepEqual([book.seed.recommended_mode, book.seed.book], ['thesis', { column: 'swing' }])
    assert.equal(hotlistHandoff(ROW, 'mid', null), null, 'a board row needs its board')
    assert.equal(hotlistHandoff({}, 'swing', null), null)
})

test("Argus's record line: picks, avoids and unmarked — per column, or all; null with nothing scored", async () => {
    const { argusRecordLine } = await import('./hotlist.utils.js')
    const summary = { argus: { all: { pick: { n: 11, up_rate: 72.7, ret_mean: 0.58 }, avoid: { n: 20, up_rate: 60, ret_mean: 0.46 }, unmarked: { n: 0 } } } }
    assert.deepEqual(argusRecordLine(summary), [['picks', 'up 73% · avg +0.6% (11)'], ['avoids', 'up 60% · avg +0.5% (20)'], ['unmarked', 'none yet']])
    assert.equal(argusRecordLine(summary, 'week'), null)
    assert.equal(argusRecordLine({}), null)
})

test("a column's record sets the board against the graded names off it — once there are any", async () => {
    const { columnRecord } = await import('./hotlist.utils.js')
    const base = { n: 70, sessions: 3, verified: false, grades: { A: { n: 70, judged: 0, up_rate: 55 } } }
    assert.deepEqual(columnRecord({ mid: { ...base, board: { n: 20, up_rate: 60, ret_mean: 0.4 }, off: { n: 50, up_rate: 52, ret_mean: -0.1 } } }, 'mid').cut,
        { board: 'up 60% · avg +0.4% (20)', off: 'up 52% · avg -0.1% (50)', pool: 'none yet' })
    assert.equal(columnRecord({ mid: { ...base, board: { n: 20 }, off: { n: 0 }, pool: { n: 0 } } }, 'mid').cut, null)
    assert.equal(columnRecord({ mid: { ...base, board: { n: 20 }, off: { n: 0 }, pool: { n: 300, up_rate: 48, ret_mean: -0.2 } } }, 'mid').cut.pool, 'up 48% · avg -0.2% (300)')
})

test("Argus's record line adds his pool spots against the pool he passed on — once he has read a pool", async () => {
    const { argusRecordLine } = await import('./hotlist.utils.js')
    const g = { pick: { n: 2, up_rate: 50, ret_mean: 1 }, avoid: { n: 0 }, unmarked: { n: 0 }, spot: { n: 3, up_rate: 66.7, ret_mean: 1.2 }, passed: { n: 37, up_rate: 45, ret_mean: -0.3 } }
    const line = argusRecordLine({ argus: { all: g } })
    assert.deepEqual(line.slice(3), [['spotted in the pool', 'up 67% · avg +1.2% (3)'], ['pool passed on', 'up 45% · avg -0.3% (37)']])
    assert.equal(argusRecordLine({ argus: { all: { ...g, spot: { n: 0 }, passed: { n: 0 } } } }).length, 3)
})

test("a column's backtest: the span, the screener's names against the pool, the caveats — null without one", async () => {
    const { backtestLine } = await import('./hotlist.utils.js')
    const week = { sessions: 125, from: '2026-04-22', to: '2026-10-19', caveats: ['no drift path'], summary: {
        grades: { A: { n: 2400, up_rate: 61.2, ret_mean: 0.42 } }, graded: { n: 3300, up_rate: 58.4, ret_mean: 0.3 }, pool: { n: 60000, up_rate: 52, ret_mean: 0.1 } } }
    const bt = backtestLine({ backtest: { week } }, 'week')
    assert.equal(bt.span, '125 sessions, 2026-04-22 → 2026-10-19')
    // No grades on the Hotlist (2026-10-24) — not even the replay's.
    assert.deepEqual(bt.parts, [['the screener’s names', 'up 58% · avg +0.3% (3,300)'], ['the pool', 'up 52% · avg +0.1% (60,000)']])
    assert.equal(backtestLine({ backtest: { week } }, 'mid'), null)
    // By path, once the replay has them (2026-10-24) — catalyst, run-up, money arriving, between the names and the pool.
    const paths = { catalyst: { n: 300, up_rate: 55, ret_mean: 0.9 }, scheduled: { n: 2600, up_rate: 52, ret_mean: 0.64 }, accumulation: { n: 2000, up_rate: 48, ret_mean: -0.06 } }
    assert.deepEqual(backtestLine({ backtest: { week: { ...week, summary: { ...week.summary, paths } } } }, 'week').parts.map(p => p[0]),
        ['the screener’s names', 'catalyst (earnings beat)', 'run-up', 'the pool'], 'money arriving dropped 2026-10-24: an old replay\'s line for it is not shown')
    // A day column's replay (2026-10-24) — on that column; the open by its ways in.
    const open = { ...week, sessions: 60, summary: { ...week.summary, paths: { catalyst: { n: 20, up_rate: 50, ret_mean: 0.2 }, gap: { n: 400, up_rate: 47, ret_mean: -0.1 } } } }
    assert.deepEqual(backtestLine({ backtest: { open } }, 'open').parts.map(p => p[0]),
        ['the screener’s names', 'catalyst (earnings beat)', 'the gap', 'the pool'])
    assert.equal(backtestLine({ backtest: { open } }, 'mid'), null)
})

test('a week name is confirmed when Prometheus set a target on it; an empty confirmed list says where his reads stand', async () => {
    const { isConfirmedRead, emptyNamesText } = await import('./hotlist.utils.js')
    assert.equal(isConfirmedRead({ status: 'active', target: { value: 10 } }), true)
    assert.equal(isConfirmedRead({ status: 'hit', target: { value: 10 } }), true)
    assert.equal(isConfirmedRead({ status: 'pass', target: null, pass_reason: 'company' }), false)
    assert.equal(isConfirmedRead(null), false)
    const argus = [{ symbol: 'A' }, { symbol: 'B' }]
    assert.match(emptyNamesText({ shown: 'confirmed', column: 'week', argus, reads: new Map([['A', { status: 'pass' }]]) }), /Prometheus has 1 of Argus’s 2 names still to read/)
    assert.match(emptyNamesText({ shown: 'confirmed', column: 'week', argus, reads: new Map([['A', {}], ['B', {}]]) }), /confirmed none of Argus’s 2 names/)
    assert.match(emptyNamesText({ shown: 'confirmed', column: 'week', argus: [], screened: 4 }), /Argus picked no names for this week on this list — the screener let 4 through/)
    assert.match(emptyNamesText({ shown: 'confirmed', column: 'week', argus, readsFailed: true }), /could not be loaded/)
    assert.match(emptyNamesText({ shown: 'argus', column: 'open', screened: 2 }), /^Argus confirmed no names for open on this list — the screener let 2 through: see All screened\.$/)
})

test("his own target's cell title says it is his, off which yardstick, and the company", () => {
    const c = readCell({ status: 'active', verdict: 'credible', valid_until: '2026-10-29T21:00:00Z', company: { verdict: 'weak' },
        target: { value: 104.5, spot: 100, open_pct: 4.5, basis: 'prometheus', yardstick: { open_pct: 3, basis: 'run_up' } } })
    assert.equal(c.text, '104.50 · +4.5% from 100.00')
    assert.match(c.title, /^Prometheus's swing target 104\.50/)
    assert.match(c.title, /; yardstick \+3\.0%; company weak$/)
})

test("the chain's survivors and where each pick stands", async () => {
    const { chainSurvivors, pickCell } = await import('./hotlist.utils.js')
    // Survived = the chain sent it and Prometheus covered it — a thesis and a PT, whatever the rating (Roy, 2026-10-24).
    const book = {
        swing: [{ symbol: 'CHN', rating: 'buy', origin: { source: 'pythia' } }, { symbol: 'HLD', rating: 'hold', origin: { source: 'pythia' } },
            { symbol: 'DSK', rating: 'buy', origin: { source: 'desk' } }, { symbol: 'PRE', rating: 'sell', origin: { source: 'desk' } }],
        picks: { swing: [{ symbol: 'PRE', state: 'already_covered' }, { symbol: 'PSS', state: 'passed' }, { symbol: 'DSK', state: 'passed' }] },
    }
    assert.deepEqual(chainSurvivors(book, 'swing').map(r => r.symbol), ['CHN', 'HLD', 'PRE'],
        "his hold is a survivor; so is a pick the desk had covered; the desk's own buy and a pass are not")
    assert.deepEqual(chainSurvivors({ swing: book.swing }, 'swing').map(r => r.symbol), ['CHN', 'HLD'], 'no picks read: the chain origin alone')
    assert.deepEqual(chainSurvivors(null, 'swing'), [])
    const row = { rating: 'strong_buy', target: 54.2, upside_pct: 12.5 }
    assert.deepEqual(pickCell({ state: 'covered' }, row), { text: 'strong buy · target 54.20 (+12.5%)', tone: 'good' })
    assert.deepEqual(pickCell({ state: 'covered' }, { ...row, rating: 'sell' }).tone, 'dim')
    assert.equal(pickCell({ state: 'covered' }).text, 'covered — no longer live')
    assert.equal(pickCell({ state: 'passed', reason: 'horizon_off_book' }).text, 'pass — his target fell outside this book’s horizon')
    assert.equal(pickCell({ state: 'already_covered' }, row).text, 'covered at the desk: strong buy · target 54.20 (+12.5%)')
    assert.equal(pickCell({ state: 'waiting' }).text, 'waiting for Prometheus')
})

// Roy, 2026-10-28: "if a name is not relevant anymore to swing or long term — leave it only in covered companies".
test('a name Pythia no longer calls leaves its list — and only its list', async () => {
    const { chainSurvivors, chainLeft, coveredRows, pickCell, bookOrigin } = await import('./hotlist.utils.js')
    const book = {
        swing: [{ symbol: 'CHN', origin: { source: 'pythia', still: true } }, { symbol: 'PGR', origin: { source: 'pythia', subject: 'P&C', verdict: 'swing', still: false, verdict_now: 'watch' } },
            { symbol: 'OLD', origin: { source: 'pythia', still: null } }, { symbol: 'PRE', origin: { source: 'desk' } }],
        long_term: [],
        picks: { swing: [{ symbol: 'PRE', state: 'already_covered', still: false, verdict_now: 'avoid' }] },
    }
    assert.deepEqual(chainSurvivors(book, 'swing').map(r => r.symbol), ['CHN', 'OLD'], 'unknown stays; a pick the desk covered leaves by its pick')
    assert.deepEqual(chainLeft(book, 'swing').map(r => r.symbol), ['PGR', 'PRE'])
    assert.deepEqual(coveredRows(book).map(r => r.symbol), ['CHN', 'PGR', 'OLD', 'PRE'], 'Covered companies keeps every one')
    assert.equal(pickCell(book.picks.swing[0]).text, 'covered at the desk · Pythia now: avoid — off this list')
    assert.equal(bookOrigin(book.swing[1]).text, 'P&C · no longer called')
    assert.match(bookOrigin(book.swing[1]).title, /she now rates it watch — off the Swing list/)
})

test('a server that marks each row\'s list is followed — the record is over the same rows', async () => {
    const { chainSurvivors, chainLeft } = await import('./hotlist.utils.js')
    const book = { swing: [{ symbol: 'ON', list: 'on', origin: { source: 'desk' } }, { symbol: 'OFF', list: 'left', origin: { source: 'pythia', still: true } },
        { symbol: 'DSK', list: null, origin: { source: 'desk' } }] }
    assert.deepEqual(chainSurvivors(book, 'swing').map(r => r.symbol), ['ON'], "the server's mark, not the rule here")
    assert.deepEqual(chainLeft(book, 'swing').map(r => r.symbol), ['OFF'])
})

test('the run-up week’s empty confirmed list says where Prometheus’s reads stand', async () => {
    const { emptyNamesText } = await import('./hotlist.utils.js')
    const names = [{ symbol: 'A' }, { symbol: 'B' }]
    assert.match(emptyNamesText({ shown: 'confirmed', column: 'week', argus: names, reads: new Map([['A', { status: 'pass' }]]), rule: true }), /1 of the 2 run-up names still to read/)
    assert.match(emptyNamesText({ shown: 'confirmed', column: 'week', argus: names, reads: new Map([['A', {}], ['B', {}]]), rule: true }), /confirmed none of the 2 run-up names/)
})

test('the week\'s record carries the run-up rule\'s own group', async () => {
    const { columnRecord } = await import('./hotlist.utils.js')
    assert.equal(columnRecord({ week: { rule: { n: 3, sessions: 1, up_rate: 66.7, ret_mean: 1.2 } } }, 'week').rule, 'up 67% · avg +1.2% (3) over 1 session')
    assert.equal(columnRecord({ week: { board: { n: 2 } } }, 'week').rule, null)
})

test('scoreCell: mean vs SPY, the share beating it and how many; dim under the bar to judge', () => {
    assert.equal(scoreCell(null), null)
    assert.equal(scoreCell({ n: 0 }), null)
    const c = scoreCell({ n: 77, mean: 0.05, median: -0.2, beat: 49.35, judge: true })
    assert.equal(c.text, '+0.1% · 49% beat · 77')
    assert.equal(c.tone, 'good')
    assert.match(c.title, /median -0.2%/)
    assert.equal(scoreCell({ n: 5, mean: 15, median: 1.3, beat: 80, judge: false }).tone, 'dim')
    assert.match(scoreCell({ n: 5, mean: 15, median: 1.3, beat: 80, judge: false }, 20).title, /too few to judge/)
    assert.equal(scoreCell({ n: 30, mean: -1, median: -1, beat: 40, judge: true }).tone, 'bad')
})
