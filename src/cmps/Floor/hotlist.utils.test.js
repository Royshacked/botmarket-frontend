// The Hotlist's words and numbers (docs/design/daily-names.md §5, §8). Node's built-in harness:
// node --test src/cmps/Floor/
import test from 'node:test'
import assert from 'node:assert/strict'
import { fmtRange, rangeTitle, bestColumn, catalystChip, askArgusText, handoffRead } from './hotlist.utils.js'
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
