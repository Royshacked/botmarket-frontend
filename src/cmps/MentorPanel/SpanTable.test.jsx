import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SpanTable } from './SpanTable.jsx'

afterEach(cleanup)

const SPANS = {
    candidates: [
        {
            id: 't1', label: 'false break of the shelf', archetype: 'sweep_reclaim',
            from: 'the 238 shelf', to: 'the 246.5 pool',
            from_price: 238.2, to_price: 246.5,
            why: 'swept twice and reclaimed both times',
            invalidation: 'a close below 234.8',
        },
        {
            id: 't2', label: 'reclaim of the weekly VWAP',
            from: 'the weekly VWAP', to: 'the prior high',
            why: 'it has held every retest this quarter',
        },
    ],
    discarded: [{ label: 'the gap fill at 231.8', why_not: 'it sits below my invalidation' }],
}

describe('SpanTable', () => {
    it('reads as rows — one per way this name travels, from here to there', () => {
        render(<SpanTable spans={SPANS} />)
        expect(screen.getByText('false break of the shelf')).toBeTruthy()
        expect(screen.getByText('the 238 shelf → the 246.5 pool')).toBeTruthy()
        expect(screen.getByText('the weekly VWAP → the prior high')).toBeTruthy()
    })

    it('shows prices when there are any, and does not fake them when there are none', () => {
        render(<SpanTable spans={SPANS} />)
        expect(screen.getByText('238.2')).toBeTruthy()
        expect(screen.getByText('246.5')).toBeTruthy()
        // The second span is worded, not priced — nothing invented for it.
        const rows = screen.getAllByRole('button')
        expect(rows[1].textContent).not.toMatch(/from|to\b/i)
    })

    it('says where each one is WRONG — half of whether it is worth taking', () => {
        render(<SpanTable spans={SPANS} />)
        expect(screen.getByText(/a close below 234.8/)).toBeTruthy()
    })

    it('picking a span speaks in words, so the conversation and the ledger cannot diverge', () => {
        const onPick = vi.fn()
        render(<SpanTable spans={SPANS} onPick={onPick} />)
        fireEvent.click(screen.getByText('false break of the shelf'))
        expect(onPick).toHaveBeenCalledWith(SPANS.candidates[0])
    })

    it('keeps the rejects, folded, and lets one be pulled back', () => {
        const onRevive = vi.fn()
        render(<SpanTable spans={SPANS} onRevive={onRevive} />)
        expect(screen.getByText('1 way not taken')).toBeTruthy()
        expect(screen.getByText('it sits below my invalidation')).toBeTruthy()
        fireEvent.click(screen.getByText('the gap fill at 231.8'))
        expect(onRevive).toHaveBeenCalledWith(SPANS.discarded[0])
    })

    it('renders nothing at all when there are no candidates', () => {
        const { container } = render(<SpanTable spans={{ candidates: [] }} />)
        expect(container.innerHTML).toBe('')
        cleanup()
        const bare = render(<SpanTable />)
        expect(bare.container.innerHTML).toBe('')
    })

    it('shows no rejects section when nothing was discarded', () => {
        render(<SpanTable spans={{ candidates: SPANS.candidates }} />)
        expect(screen.queryByText(/not taken/)).toBeNull()
    })
})
