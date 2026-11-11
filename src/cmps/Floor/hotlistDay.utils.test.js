import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    etTime, etDay, quotedSpan, latestBoardId, orderedBoards, volText, gapText, catalystCell, dayBoardsNote, DAY_BOARD_ORDER, DAY_BOARD_LABEL,
} from './hotlistDay.utils.js'

// Run in a zone that is NOT New York's, so "the times are New York's" proves something on any machine, a New York one
// included (CR 2026-11-11). The formatters name their zone; the machine's must not leak in. Set before any Date is
// formatted: the imports above create formatters but format nothing.
process.env.TZ = 'Asia/Tokyo'

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

test("the board to open on is the day's latest CHECKPOINT, not the last to finish; an unknown one goes last", () => {
    assert.equal(latestBoardId([{ id: 'm', checkpoint: 'mid' }, { id: 'o', checkpoint: 'open' }]), 'm', 'a re-run 09:20 finishing after 10:30')
    assert.equal(latestBoardId([]), null)
    assert.deepEqual(orderedBoards([{ id: 'x', checkpoint: 'later' }, { id: 'e', checkpoint: 'eod' }, { id: 'o', checkpoint: 'open' }]).map(b => b.id), ['o', 'e', 'x'])
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
    assert.equal(dayBoardsNote({ day: '2026-11-10', boards: [{}] }, now).stale, 'The latest boards are from 2026-11-10 — the next runs at 09:20 ET on a trading day.')
    assert.deepEqual(dayBoardsNote({ day: '2026-11-11', boards: [{}] }, now), { empty: null, stale: null })
    // A day the user stepped back to is that day's: no stale note; none that day says so.
    assert.deepEqual(dayBoardsNote({ day: '2026-11-04', boards: [{}] }, now, { day: '2026-11-04' }), { empty: null, stale: null })
    assert.equal(dayBoardsNote({ boards: [] }, now, { day: '2026-11-04' }).empty, 'No day boards on 2026-11-04.')
})
