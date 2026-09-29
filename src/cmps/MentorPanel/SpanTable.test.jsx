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

    it('SEVERAL trades can survive the gate — that is what the stage is for', () => {
        const onBuild = vi.fn()
        render(<SpanTable spans={SPANS} onBuild={onBuild} />)

        // A row that fired on click quietly made this a one-of-four choice.
        const boxes = screen.getAllByRole('checkbox')
        fireEvent.click(boxes[0])
        fireEvent.click(boxes[1])
        expect(screen.getByText('Build these 2')).toBeTruthy()

        fireEvent.click(screen.getByText('Build these 2'))
        expect(onBuild).toHaveBeenCalledWith(SPANS.candidates)
    })

    it('one ticked reads as one, and nothing ticked cannot be built', () => {
        const onBuild = vi.fn()
        render(<SpanTable spans={SPANS} onBuild={onBuild} />)
        expect(screen.getByText('Build it').disabled).toBe(true)

        fireEvent.click(screen.getAllByRole('checkbox')[1])
        const go = screen.getByText('Build it')
        expect(go.disabled).toBe(false)
        fireEvent.click(go)
        expect(onBuild).toHaveBeenCalledWith([SPANS.candidates[1]])
    })

    it('a tick can be taken back', () => {
        render(<SpanTable spans={SPANS} onBuild={() => {}} />)
        const box = screen.getAllByRole('checkbox')[0]
        fireEvent.click(box)
        fireEvent.click(box)
        expect(screen.getByText('Build it').disabled).toBe(true)
    })

    it('the choice can be handed back to Mentor instead', () => {
        const onDelegate = vi.fn()
        render(<SpanTable spans={SPANS} onDelegate={onDelegate} />)
        fireEvent.click(screen.getByText('You choose'))
        expect(onDelegate).toHaveBeenCalled()
    })

    it('everything is disabled while a turn is in flight', () => {
        render(<SpanTable spans={SPANS} busy />)
        for (const b of screen.getAllByRole('checkbox')) expect(b.disabled).toBe(true)
        expect(screen.getByText('You choose').disabled).toBe(true)
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
