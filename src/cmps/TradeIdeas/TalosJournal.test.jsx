import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TalosJournal } from './TalosJournal.jsx'
import { tidyPrices, guardLabel } from './monitorJournal.utils.js'

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
    it('shows where Talos stands now above the rows', () => {
        render(<TalosJournal setup={SETUP} rows={[newer, older]} done />)
        expect(screen.getByText(/Base building under 238\.6/)).toBeTruthy()
        expect(screen.getByText(/on the 15min/)).toBeTruthy()
        expect(screen.getByText(/next read in 12 min/)).toBeTruthy()
        expect(screen.getByText(/watching ↑238\.6 · ↓234\.8/)).toBeTruthy()
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

    it('guardLabel: a price and a side, and nothing for a guard with no price', () => {
        expect(guardLabel({ price: 311.5, direction: 'above' })).toBe('↑311.5')
        expect(guardLabel({ price: 305, direction: 'below' })).toBe('↓305')
        expect(guardLabel({ price: 312, direction: 'any' })).toBe('@312')
        expect(guardLabel({ after_min: 240 })).toBe(null)
        expect(guardLabel(null)).toBe(null)
    })
})
