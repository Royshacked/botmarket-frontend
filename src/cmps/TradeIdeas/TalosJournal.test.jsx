import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TalosJournal } from './TalosJournal.jsx'
import { tidyPrices, guardLabel, nextReadLabel, nextCall, nextCallLine } from './monitorJournal.utils.js'

// Talos's journal: newest on top, a collapsed line per read, the head saying where Talos stands
// now (docs/design/talos-per-candle.md).

afterEach(cleanup)

const SETUP = {
    conditions: [{ id: 'c1', text: 'CHoCH up on the 15m' }],
    scenarios: [{ id: 's1', tp_zones: [{ id: 't1', conditions: [{ id: 't1c1', text: 'bank it if momentum fades' }] }] }],
    monitor_state: {
        memo: 'Base building under 238.6; waiting for the 15m to confirm.',
        timeframe: '15min',
        guards: [{ price: 238.6, direction: 'above', means: 'entry' }, { price: 234.8, direction: 'below', means: 'invalidation' }],
        next_check_at: new Date(Date.now() + 12 * 60_000).toISOString(),
    },
}

const older = {
    at: '2026-09-17T13:00:00.000Z', reason: 'first_look', price: 236.2, rung: '15min', verdict: 'wait',
    note: 'Read the map; arming my lines.', tools: [], armed: SETUP.monitor_state.guards,
}
const newer = {
    at: '2026-09-17T13:15:00.000Z', reason: 'guard', price: 238.7, rung: '15min', verdict: 'enter',
    note: 'Broke 238.6 on volume — this is the moment.',
    fired: { price: 238.6, direction: 'above', means: 'entry', armed_at: '2026-09-17T13:00:00.000Z' },
    conditions: [{ id: 'c1', met: 'yes', note: 'CHoCH printed at 13:10' }],
    tools: ['get_chart', 'get_indicators'],
    armed: [],
}

describe('TalosJournal', () => {
    it('heads the rows with the NEXT CALL: when, on which candle, the prices that wake it sooner, the memo', () => {
        render(<TalosJournal setup={SETUP} rows={[newer, older]} done />)
        expect(screen.getByText('next read')).toBeTruthy()
        expect(screen.getByText('in 12 min')).toBeTruthy()
        expect(screen.getByText('15min close')).toBeTruthy()
        expect(screen.getByText(/or at ↑238\.6 · ↓234\.8/)).toBeTruthy()
        expect(screen.getByText(/Base building under 238\.6/)).toBeTruthy()
        // The head comes BEFORE the newest row.
        const all = screen.getAllByText(/next read|this is the moment/).map(el => el.textContent)
        expect(all[0]).toBe('next read')
    })

    it('an unarmed setup has no next call — a stale stamp is not shown as one', () => {
        render(<TalosJournal setup={{ ...SETUP, status: 'waiting' }} rows={[older]} done />)
        expect(screen.queryByText('next read')).toBeNull()
        expect(screen.getByText('not armed')).toBeTruthy()
        expect(screen.queryByText(/or at/)).toBeNull()
    })

    it('a dormant position says why nothing is scheduled', () => {
        render(<TalosJournal setup={{ ...SETUP, status: 'long', monitor_state: { ...SETUP.monitor_state, dormant: true } }} rows={[]} done />)
        expect(screen.getByText(/dormant — every exit rests at the broker/)).toBeTruthy()
        expect(screen.queryByText('next read')).toBeNull()
    })

    it('an accepted management action reads as one', () => {
        const managed = { at: '2026-09-17T14:00:00.000Z', reason: 'manage', verdict: 'move_stop', note: 'Moved my stop to 240 — locking in breakeven.' }
        render(<TalosJournal setup={SETUP} rows={[managed]} done />)
        expect(screen.getByText('you accepted')).toBeTruthy()
        expect(screen.getByText('move_stop')).toBeTruthy()
    })

    it('renders rows in the order given — newest first — collapsed to when · why · verdict · read', () => {
        render(<TalosJournal setup={SETUP} rows={[newer, older]} done />)
        const notes = screen.getAllByText(/moment|arming my lines/).map(el => el.textContent)
        expect(notes[0]).toMatch(/this is the moment/)
        expect(notes[1]).toMatch(/arming my lines/)
        expect(screen.getByText('level reached')).toBeTruthy()
        expect(screen.getByText('first look')).toBeTruthy()
        expect(screen.getByText('enter')).toBeTruthy()
        // Detail stays folded until asked.
        expect(screen.queryByText(/CHoCH printed at 13:10/)).toBeNull()
    })

    it('opens a row to what it checked, what it pulled, what woke it and what it armed', () => {
        render(<TalosJournal setup={SETUP} rows={[newer]} done />)
        fireEvent.click(screen.getByText('level reached'))
        expect(screen.getByText('CHoCH up on the 15m')).toBeTruthy()          // the id joined back to its text
        expect(screen.getByText(/CHoCH printed at 13:10/)).toBeTruthy()
        expect(screen.getByText('get_chart · get_indicators')).toBeTruthy()
        expect(screen.getByText(/↑238\.6 \(entry\)/)).toBeTruthy()
    })

    it('says outright when a read spent nothing', () => {
        render(<TalosJournal setup={SETUP} rows={[older]} done />)
        fireEvent.click(screen.getByText('first look'))
        expect(screen.getByText(/nothing — the candles answered/)).toBeTruthy()
    })

    it('offers older pages until the hook says there are none', () => {
        const onOlder = vi.fn()
        const { rerender } = render(<TalosJournal setup={SETUP} rows={[newer]} done={false} onOlder={onOlder} />)
        fireEvent.click(screen.getByText('older…'))
        expect(onOlder).toHaveBeenCalledTimes(1)
        rerender(<TalosJournal setup={SETUP} rows={[newer]} done />)
        expect(screen.queryByText('older…')).toBeNull()
    })

    it('has an honest empty state', () => {
        render(<TalosJournal setup={{ monitor_state: {} }} rows={[]} done />)
        expect(screen.getByText(/No reads yet/)).toBeTruthy()
    })
})

describe('journal utils', () => {
    it('tidyPrices only ever shortens', () => {
        expect(tidyPrices('at 33.2445543465656 then 4.5%')).toBe('at 33.24 then 4.5%')
        expect(tidyPrices('0.123456789')).toBe('0.123457')
    })

    it('nextReadLabel: minutes, hours, a time today, and the DATE past today', () => {
        const now = Date.parse('2026-09-18T10:00:00.000Z')   // a Friday
        const at = (h) => new Date(now + h * 3_600_000).toISOString()
        expect(nextReadLabel(at(-1), now)).toBe('any moment')
        expect(nextReadLabel(at(0.2), now)).toBe('in 12 min')
        expect(nextReadLabel(at(3), now)).toBe('in 3 h')
        expect(nextReadLabel(at(8), now)).toMatch(/^at \d/)
        // Friday's close parks a daily setup on Monday's: the label has to carry the day.
        expect(nextReadLabel(at(72), now)).toMatch(/^Mon/)
        expect(nextReadLabel(null, now)).toBe(null)
        expect(nextReadLabel('garbage', now)).toBe(null)
    })

    it('nextCall: when for a watched setup, standing for one nobody reads, neither once closed', () => {
        const now = Date.now()
        const ms = { next_check_at: new Date(now + 5 * 60_000).toISOString() }
        expect(nextCall({ status: 'looking', monitor_state: ms }, now)).toMatchObject({ when: 'in 5 min', standing: null })
        expect(nextCall({ status: 'hit',     monitor_state: ms }, now)).toMatchObject({ when: 'in 5 min', standing: null })
        // A null stamp on an armed setup is the monitor's "due on the next tick" — just armed, or just edited.
        expect(nextCall({ status: 'looking', monitor_state: {} }, now)).toMatchObject({ when: 'any moment', standing: null })
        expect(nextCall({ status: 'waiting', monitor_state: ms }, now)).toMatchObject({ when: null, standing: 'not armed' })
        expect(nextCall({ status: 'long', monitor_state: { ...ms, dormant: true } }, now).standing).toMatch(/dormant/)
        expect(nextCall({ status: 'closed', monitor_state: ms }, now)).toMatchObject({ when: null, standing: null })
        expect(nextCallLine({ status: 'looking', monitor_state: ms }, now)).toBe('next read in 5 min')
        expect(nextCallLine({ status: 'waiting' }, now)).toBe('not armed')
        expect(nextCallLine({ status: 'closed' }, now)).toBe(null)
    })

    it('guardLabel: a price and a side, and nothing for a guard with no price', () => {
        expect(guardLabel({ price: 311.5, direction: 'above' })).toBe('↑311.5')
        expect(guardLabel({ price: 305, direction: 'below' })).toBe('↓305')
        expect(guardLabel({ price: 312, direction: 'any' })).toBe('@312')
        expect(guardLabel({ after_min: 240 })).toBe(null)
        expect(guardLabel(null)).toBe(null)
    })
})

// ── The two tiers, on screen (2026-09-23) ─────────────────────────────────────
// A wake is now the full read, a numbers-only check, or nothing at all. A check has no verdict, no
// tools and no guards — without saying so it looks exactly like a read that failed to answer.

describe('TalosJournal — tiers and the premise', () => {
    afterEach(cleanup)

    const rows = (extra) => [{ at: new Date().toISOString(), reason: 'candle', price: 238.1, ...extra }]

    it('marks a cheap check, and does not dress it as a verdict', () => {
        render(<TalosJournal setup={SETUP} rows={rows({ tier: 'cheap', note: 'Nothing the plan waits on has moved.' })} />)
        expect(screen.getByText('check')).toBeTruthy()
        expect(screen.getByText(/Nothing the plan waits on/)).toBeTruthy()
    })

    it('a full read carries its verdict and no check chip', () => {
        render(<TalosJournal setup={SETUP} rows={rows({ verdict: 'wait', note: 'Had a proper look.' })} />)
        expect(screen.getByText('wait')).toBeTruthy()
        expect(screen.queryByText('check')).toBeNull()
    })

    it('shows a FLAGGED map beside the verdict, because both are true at once', () => {
        render(<TalosJournal setup={SETUP} rows={rows({ verdict: 'wait', premise: 'stale', note: 'Levels stopped describing this.' })} />)
        expect(screen.getByText('wait')).toBeTruthy()
        expect(screen.getByText('map stale')).toBeTruthy()
    })

    it('stays quiet about an intact map — most rows are, and a row shows what is unusual', () => {
        render(<TalosJournal setup={SETUP} rows={rows({ verdict: 'wait', premise: 'intact' })} />)
        expect(screen.queryByText(/^map /)).toBeNull()
    })

    it('a condition the check could not settle reads as unchecked, never as "not happening"', () => {
        render(<TalosJournal setup={SETUP} rows={rows({
            tier: 'cheap', note: 'Cannot tell from the rows.',
            conditions: [{ id: 'c1', met: 'unchecked', note: 'rows cannot show a failed break' }],
        })} />)
        fireEvent.click(screen.getByRole('button', { expanded: false }))
        expect(screen.getByTitle(/could NOT check/)).toBeTruthy()
    })

    it('the head announces when the FULL read is due, so a check is not mistaken for one', () => {
        const watched = { ...SETUP, status: 'looking',
            monitor_state: { ...SETUP.monitor_state, expensive_due: 6, watch: { rung: '15min' } } }
        render(<TalosJournal setup={watched} rows={[]} />)
        expect(screen.getByText('next check')).toBeTruthy()
        expect(screen.getByText(/full read in 6 closes/)).toBeTruthy()
    })
})
