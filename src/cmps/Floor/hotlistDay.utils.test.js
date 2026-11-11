import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    etTime, etDay, quotedSpan, latestBoardId, volText, gapText, catalystCell, dayBoardsNote, DAY_BOARD_ORDER, DAY_BOARD_LABEL,
} from './hotlistDay.utils.js'

// The day boards on the Hotlist (backend hotlist.day, 2026-11-11): names in play, no grade.

const ET = (s) => Date.parse(`${s}-05:00`)   // 2026-11-11 is EST

test('the three boards and their times', () => {
    assert.deepEqual(DAY_BOARD_ORDER, ['open', 'mid', 'eod'])
    assert.deepEqual(DAY_BOARD_ORDER.map(c => DAY_BOARD_LABEL[c]), ['09:20', '10:30', '14:30'])
})

test('times are New York\'s, whatever the browser\'s zone', () => {
    assert.equal(etTime(ET('2026-11-11T09:20:00')), '09:20')
    assert.equal(etTime(null), null)
    assert.equal(etDay(ET('2026-11-11T23:30:00')), '2026-11-11', 'late evening ET is still that day (UTC has moved on)')
})

test('the quote span: first to last, one time when they match, null with none', () => {
    assert.equal(quotedSpan([{ quoted_at: ET('2026-11-11T09:24:00') }, { quoted_at: ET('2026-11-11T09:20:00') }]), '09:20–09:24')
    assert.equal(quotedSpan([{ quoted_at: ET('2026-11-11T10:31:00') }]), '10:31')
    assert.equal(quotedSpan([{ quoted_at: null }, null]), null)
})

test('the board to open on is the day\'s latest', () => {
    assert.equal(latestBoardId([{ id: 'a' }, { id: 'b' }]), 'b')
    assert.equal(latestBoardId([]), null)
})

test('volume: in session against an ordinary day, before the open as % of a day', () => {
    assert.equal(volText({ rvol: 2.4 }), '2.4×')
    assert.equal(volText({ pm_vol_pct: 3.04 }), '3% pre')
    assert.equal(volText({}), null)
    assert.equal(gapText({ gap_pct: 6.23 }), '+6.2%')
    assert.equal(gapText({ gap_pct: -1 }), '-1.0%')
    assert.equal(gapText({}), null)
})

test('the catalyst: the freshest headline with its time, the flags, how many more', () => {
    const row = { catalyst: { news: [{ title: 'Beats', at: '2026-11-11 07:05:00' }, { title: 'older', at: '2026-11-11 06:00:00' }], earnings: true, rating: false } }
    assert.deepEqual(catalystCell(row), { time: '07:05', title: 'Beats', flags: ['reported'], more: 1 })
    assert.deepEqual(catalystCell({ catalyst: { news: [], earnings: false, rating: true } }), { time: null, title: null, flags: ['rating change'], more: 0 })
    assert.equal(catalystCell({ catalyst: null }), null)
    assert.equal(catalystCell({ catalyst: { news: [], earnings: false, rating: false } }), null)
})

test('the note: no board says when they run; a past day\'s boards say so', () => {
    const now = ET('2026-11-11T08:00:00')
    assert.match(dayBoardsNote({ boards: [] }, now).empty, /09:20, 10:30 and 14:30 ET/)
    assert.match(dayBoardsNote({ day: '2026-11-10', boards: [{}] }, now).stale, /last trading day’s boards \(2026-11-10\)/)
    assert.deepEqual(dayBoardsNote({ day: '2026-11-11', boards: [{}] }, now), { empty: null, stale: null })
})
