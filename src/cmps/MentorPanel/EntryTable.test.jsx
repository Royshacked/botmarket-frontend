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
        expect(screen.getByText(/scaling in — these are one position/)).toBeTruthy()
        expect(screen.getAllByText('50%')).toHaveLength(2)
    })

    it('shows the rung each trigger is read on — it is the mechanic\'s, not the horizon\'s', () => {
        render(<EntryTable entries={ENTRIES} spans={SPANS} />)
        expect(screen.getByText('15min')).toBeTruthy()
        expect(screen.getByText('5min')).toBeTruthy()
    })

    it('MORE THAN ONE way in is a real answer, and not only when scaling', () => {
        // Under `alternatives` the first trigger to fire takes the position and the rest are
        // cancelled — which is exactly "I'd take it either way, whichever comes first".
        const onTake = vi.fn()
        render(<EntryTable entries={ENTRIES} spans={SPANS} onTake={onTake} />)

        const boxes = screen.getAllByRole('checkbox')
        fireEvent.click(boxes[0])
        fireEvent.click(boxes[1])
        fireEvent.click(screen.getByText('Take these 2'))

        expect(onTake).toHaveBeenCalledWith([
            { trade: 't1', option: ENTRIES.trades[0].options[0] },
            { trade: 't1', option: ENTRIES.trades[0].options[1] },
        ])
    })

    it('nothing ticked cannot be taken, and one reads as one', () => {
        const onTake = vi.fn()
        render(<EntryTable entries={ENTRIES} spans={SPANS} onTake={onTake} />)
        expect(screen.getByText('Take it').disabled).toBe(true)
        fireEvent.click(screen.getAllByRole('checkbox')[0])
        fireEvent.click(screen.getByText('Take it'))
        expect(onTake.mock.calls[0][0]).toHaveLength(1)
    })

    it('a SCALE-IN trade ticks as one — its options are halves of one position', () => {
        // Taking two of three would author a plan whose shares no longer add to 100, and the user
        // would fill for less than they agreed.
        const scaled = { trades: [{
            ...ENTRIES.trades[0],
            semantics: 'scale_in',
            options: ENTRIES.trades[0].options.map((o, i) => ({ ...o, share: 50, recommended: i === 0 })),
        }] }
        const onTake = vi.fn()
        render(<EntryTable entries={scaled} spans={SPANS} onTake={onTake} />)

        fireEvent.click(screen.getAllByRole('checkbox')[0])
        expect(screen.getByText('Take these 2')).toBeTruthy()
        for (const b of screen.getAllByRole('checkbox')) expect(b.checked).toBe(true)

        // …and untick the same way: one position, in or out.
        fireEvent.click(screen.getAllByRole('checkbox')[1])
        expect(screen.getByText('Take it').disabled).toBe(true)
    })

    it('the choice can be handed back to Mentor', () => {
        const onDelegate = vi.fn()
        render(<EntryTable entries={ENTRIES} spans={SPANS} onDelegate={onDelegate} />)
        fireEvent.click(screen.getByText('You choose'))
        expect(onDelegate).toHaveBeenCalled()
    })

    it('renders nothing when there are no entries yet', () => {
        const { container } = render(<EntryTable entries={{ trades: [] }} spans={SPANS} />)
        expect(container.innerHTML).toBe('')
        cleanup()
        expect(render(<EntryTable />).container.innerHTML).toBe('')
    })
})
