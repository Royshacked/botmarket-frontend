import { describe, it, expect } from 'vitest'
import { isCurrentPeriod } from './chartPeriod.js'

// The chart patches the live quote onto its last bar every 5s so the price ticks mid-bar. That is
// right only while that bar's period is still running — on a CLOSED candle the same patch does not
// make the chart live, it rewrites a settled bar. It happened: FMP's EOD feed publishes a day only
// after the close, so mid-session the daily series ended on the previous trading day and Friday's
// candle rendered with Monday's price.

const MON_1500Z = Date.parse('2026-08-17T15:00:00Z')   // Monday, mid-session
const FRI_BAR   = Date.parse('2026-08-14T04:00:00Z')   // Friday's daily bar (ET midnight, EDT)
const MON_BAR   = Date.parse('2026-08-17T04:00:00Z')

describe('isCurrentPeriod', () => {
    it('refuses the patch on a daily bar from a previous session', () => {
        expect(isCurrentPeriod({ timestamp: FRI_BAR }, 'day', MON_1500Z)).toBe(false)
    })

    it('allows it on today\'s bar, all session', () => {
        expect(isCurrentPeriod({ timestamp: MON_BAR }, 'day', MON_1500Z)).toBe(true)
        // …including the last minutes before the close, where a too-tight window would silently
        // stop the chart ticking.
        expect(isCurrentPeriod({ timestamp: MON_BAR }, 'day', Date.parse('2026-08-17T19:59:00Z'))).toBe(true)
    })

    it('reads the interval, not just the calendar — a 5min bar goes stale in 5min', () => {
        const bar = { timestamp: MON_1500Z }
        expect(isCurrentPeriod(bar, '5min', MON_1500Z + 4 * 60_000)).toBe(true)
        expect(isCurrentPeriod(bar, '5min', MON_1500Z + 6 * 60_000)).toBe(false)
        // …and a weekly bar from the same instant is still running days later.
        expect(isCurrentPeriod(bar, 'week', MON_1500Z + 3 * 86_400_000)).toBe(true)
    })

    it('a bar with no usable timestamp is never patched', () => {
        expect(isCurrentPeriod(null, 'day', MON_1500Z)).toBe(false)
        expect(isCurrentPeriod({}, 'day', MON_1500Z)).toBe(false)
        expect(isCurrentPeriod({ timestamp: 'x' }, 'day', MON_1500Z)).toBe(false)
    })

    it('an unknown interval falls back to a day rather than refusing everything', () => {
        expect(isCurrentPeriod({ timestamp: MON_BAR }, 'nonsense', MON_1500Z)).toBe(true)
    })
})
