import { describe, it, expect, vi, afterEach } from 'vitest'
import { formatTime } from './messageStamp.js'
import { RETIRED_BOT_IDS, isRetiredBotId, isBotId, BOT_IDS } from '../AxlHub/agentMeta.jsx'

// Every message carries a DATE as well as a clock time. These threads are notification history you
// scroll back through, and a bare "13:44" on a card from three weeks ago reads as today.
describe('formatTime', () => {
    afterEach(() => vi.useRealTimers())

    // Fix "now" so today/yesterday/this-year are decidable. Local time throughout — the stamp is
    // rendered in the reader's zone, so the test must build its inputs in the same one.
    const at = (y, m, d, hh, mm) => new Date(y, m, d, hh, mm).getTime()
    function freeze(y, m, d, hh = 12, mm = 0) {
        vi.useFakeTimers()
        vi.setSystemTime(new Date(y, m, d, hh, mm))
    }

    it('says "Today" rather than repeating the date down the live conversation', () => {
        freeze(2026, 7, 7, 15, 0)
        expect(formatTime(at(2026, 7, 7, 13, 44))).toMatch(/^Today /)
    })

    it('names yesterday, so the most common "when was that?" needs no arithmetic', () => {
        freeze(2026, 7, 7)
        expect(formatTime(at(2026, 7, 6, 9, 5))).toMatch(/^Yesterday /)
    })

    it('crossing midnight makes an hours-old message yesterday, not today', () => {
        // 00:30 looking back at 23:50 — the regression a naive "less than 24h ago" check produces.
        freeze(2026, 7, 7, 0, 30)
        expect(formatTime(at(2026, 7, 6, 23, 50))).toMatch(/^Yesterday /)
    })

    it('older messages carry the calendar date', () => {
        freeze(2026, 7, 7)
        const stamp = formatTime(at(2026, 6, 19, 8, 30))
        expect(stamp).not.toMatch(/Today|Yesterday/)
        expect(stamp).toMatch(/19/)
        expect(stamp).toMatch(/\d{1,2}:\d{2}/)
    })

    it('the year appears only once it stops being obvious', () => {
        freeze(2026, 7, 7)
        expect(formatTime(at(2026, 0, 4, 10, 0))).not.toMatch(/2026/)
        expect(formatTime(at(2025, 11, 30, 10, 0))).toMatch(/2025/)
    })

    it('a missing stamp renders nothing rather than "Invalid Date"', () => {
        expect(formatTime(null)).toBe('')
        expect(formatTime(undefined)).toBe('')
        expect(formatTime(0)).toBe('')
    })
})

// The Idea desk is archived. Dropping it from BOT_IDS unpins the thread, but that ALONE makes it
// render as a person (an unrecognised id falls through to the human-DM branch) — so the retired
// list is what actually removes it. Mirrors the backend RETIRED_BOT_IDS.
describe('retired bot feeds', () => {
    it('idea is retired, and retired is not the same as unknown', () => {
        expect(RETIRED_BOT_IDS).toEqual(['idea'])
        expect(isRetiredBotId('idea')).toBe(true)
        expect(isBotId('idea')).toBe(false)
        expect(isRetiredBotId('kairos')).toBe(false)
    })

    it('no id is ever both live and retired', () => {
        expect(BOT_IDS.filter(isRetiredBotId)).toEqual([])
    })
})
