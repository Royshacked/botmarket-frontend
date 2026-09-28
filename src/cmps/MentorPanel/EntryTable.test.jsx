import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { EntryTable } from './EntryTable.jsx'

afterEach(cleanup)

const ENTRIES = {
    trades: [{
        id: 't1',
        semantics: 'alternatives',
        options: [
            {
                id: 't1e1', label: 'reclaim close', technique: 'sweep then CHoCH',
                trigger: 'a 15m close back above 238', timeframe: '15min',
                evidence: '11 of the last 14 sweeps closed back inside', recommended: true,
            },
            {
                id: 't1e2', label: 'the retest', technique: 'break and retest',
                trigger: 'tags 238 from above and holds', timeframe: '5min',
                evidence: 'held 4 of 6 retests this quarter', recommended: false,
            },
        ],
    }],
}

const SPANS = { candidates: [{ id: 't1', label: 'false break of the shelf' }] }

describe('EntryTable', () => {
    it('names the trade by its span label, not its id', () => {
        render(<EntryTable entries={ENTRIES} spans={SPANS} />)
        expect(screen.getByText('false break of the shelf')).toBeTruthy()
        expect(screen.queryByText('t1')).toBeNull()
    })

    it('expands Mentor\'s pick and folds the rest — twelve rows is a wall, not a choice', () => {
        render(<EntryTable entries={ENTRIES} spans={SPANS} />)
        expect(screen.getByText('pick')).toBeTruthy()
        // The recommended one shows its trigger and evidence up front.
        expect(screen.getByText('a 15m close back above 238')).toBeTruthy()
        expect(screen.getByText('11 of the last 14 sweeps closed back inside')).toBeTruthy()
        // The other is behind a fold, named.
        expect(screen.getByText('1 other way in')).toBeTruthy()
        expect(screen.getByText('the retest')).toBeTruthy()
    })

    it('states the semantics rather than implying them from a list', () => {
        render(<EntryTable entries={ENTRIES} spans={SPANS} />)
        expect(screen.getByText(/first one to fire takes the position/)).toBeTruthy()
    })

    it('says SCALING IN when it is scaling in, and shows each share', () => {
        const scaled = { trades: [{
            ...ENTRIES.trades[0],
            semantics: 'scale_in',
            options: ENTRIES.trades[0].options.map((o, i) => ({ ...o, share: 50, recommended: i === 0 })),
        }] }
        render(<EntryTable entries={scaled} spans={SPANS} />)
        expect(screen.getByText(/scaling in — each of these takes its share/)).toBeTruthy()
        expect(screen.getAllByText('50%')).toHaveLength(2)
    })

    it('shows the rung each trigger is read on — it is the mechanic\'s, not the horizon\'s', () => {
        render(<EntryTable entries={ENTRIES} spans={SPANS} />)
        expect(screen.getByText('15min')).toBeTruthy()
        expect(screen.getByText('5min')).toBeTruthy()
    })

    it('picking an entry speaks in words, so the ledger cannot silently diverge', () => {
        const onPick = vi.fn()
        render(<EntryTable entries={ENTRIES} spans={SPANS} onPick={onPick} />)
        fireEvent.click(screen.getByText('reclaim close'))
        expect(onPick).toHaveBeenCalledWith(ENTRIES.trades[0].options[0])
    })

    it('renders nothing when there are no entries yet', () => {
        const { container } = render(<EntryTable entries={{ trades: [] }} spans={SPANS} />)
        expect(container.innerHTML).toBe('')
        cleanup()
        expect(render(<EntryTable />).container.innerHTML).toBe('')
    })
})
