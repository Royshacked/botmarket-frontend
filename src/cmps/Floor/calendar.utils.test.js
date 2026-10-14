// The Floor month calendar's date math. Node's built-in harness:  node --test src/cmps/Floor/
import test from 'node:test'
import assert from 'node:assert/strict'
import { monthGrid, shiftMonth, addDays, todayIso, monthOf, fmtMonth, fmtLongDay, isWeekend } from './calendar.utils.js'

test('monthGrid: whole Monday-first weeks, padded with the neighbouring months', () => {
    // October 2026 starts on a Thursday and ends on a Saturday.
    const g = monthGrid({ y: 2026, m: 10 })
    assert.equal(g.from, '2026-09-28')
    assert.equal(g.to, '2026-11-01')
    assert.equal(g.weeks.length, 5)
    assert.ok(g.weeks.every(w => w.length === 7))
    assert.deepEqual(g.weeks[0].slice(0, 4), ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'])
    assert.equal(g.weeks.at(-1).at(-1), '2026-11-01')
})

test('monthGrid: a month that starts on Monday and ends on Sunday needs no padding', () => {
    // June 2026: Mon 1st … Tue 30th → padded only at the end.
    assert.equal(monthGrid({ y: 2026, m: 6 }).from, '2026-06-01')
    // February 2027: Mon 1st … Sun 28th → exactly four weeks.
    const feb = monthGrid({ y: 2027, m: 2 })
    assert.deepEqual([feb.from, feb.to, feb.weeks.length], ['2027-02-01', '2027-02-28', 4])
})

test('monthGrid: never more than six weeks (the backend caps a range at 62 days)', () => {
    for (let m = 1; m <= 12; m++) {
        const g = monthGrid({ y: 2026, m })
        assert.ok(g.weeks.length <= 6, `${m}: ${g.weeks.length}`)
        assert.equal(addDays(g.from, g.weeks.length * 7 - 1), g.to)
    }
})

test('shiftMonth: crosses year boundaries both ways', () => {
    assert.deepEqual(shiftMonth({ y: 2026, m: 12 }, 1), { y: 2027, m: 1 })
    assert.deepEqual(shiftMonth({ y: 2026, m: 1 }, -1), { y: 2025, m: 12 })
    assert.deepEqual(shiftMonth({ y: 2026, m: 10 }, 0), { y: 2026, m: 10 })
})

test('today and month are the reader\'s local date', () => {
    assert.equal(todayIso(new Date(2026, 9, 14, 23, 30)), '2026-10-14')
    assert.deepEqual(monthOf('2026-10-14'), { y: 2026, m: 10 })
})

test('labels', () => {
    assert.equal(fmtMonth({ y: 2026, m: 10 }), 'October 2026')
    assert.equal(fmtLongDay('2026-10-29'), 'Thursday, October 29')
    assert.equal(isWeekend('2026-10-31'), true)
    assert.equal(isWeekend('2026-10-30'), false)
})
