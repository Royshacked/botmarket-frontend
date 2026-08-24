import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { CandidatePicker } from './CandidatePicker.jsx'

afterEach(cleanup)

const mk = (over = {}) => ({
    label: 'Sweep and reclaim',
    pitch: 'Best risk — buying the failed break with a tight invalidation.',
    setup: {
        direction: 'long', trade_mode: 'smc', timeframe: '1hr',
        entry_zones: [{ id: 'ez1', lower: 199, upper: 201 }],
        stop_zones:  [{ id: 'sz1', lower: 196, upper: 197 }],
        tp_zones:    [{ id: 'tp1', lower: 210, upper: 211 }],
        rr: 2.4, conviction: { level: 'medium', rationale: 'fresh OB' },
        ...over.setup,
    },
    ...over,
})

const TWO = [
    mk(),
    mk({ label: 'Break of the shelf', pitch: 'Momentum version — worse fill.', setup: { direction: 'long', trade_mode: 'classical', rr: 1.2, entry_zones: [{ id: 'ez1', lower: 205, upper: 206 }], stop_zones: [{ id: 'sz1', lower: 201, upper: 202 }], tp_zones: [{ id: 'tp1', lower: 213, upper: 214 }] } }),
]

describe('CandidatePicker', () => {
    it('renders one card per candidate with the same fields, for comparison', () => {
        render(<CandidatePicker candidates={TWO} onPick={() => {}} />)
        const cards = screen.getAllByRole('button')
        expect(cards).toHaveLength(2)
        // Both cards expose the same three levels, so the eye can scan a column.
        for (const card of cards) {
            expect(within(card).getByText('in')).toBeTruthy()
            expect(within(card).getByText('stop')).toBeTruthy()
            expect(within(card).getByText('target')).toBeTruthy()
        }
    })

    it('marks the first as Mentor’s own pick — it ranks them honestly', () => {
        render(<CandidatePicker candidates={TWO} onPick={() => {}} />)
        const cards = screen.getAllByRole('button')
        expect(within(cards[0]).getByText('pick')).toBeTruthy()
        expect(within(cards[1]).queryByText('pick')).toBeNull()
    })

    it('shows each candidate’s own lens, since they differ in character', () => {
        render(<CandidatePicker candidates={TWO} onPick={() => {}} />)
        expect(screen.getByText('smc')).toBeTruthy()
        expect(screen.getByText('classical')).toBeTruthy()
    })

    it('flags a thin R:R on a candidate the same way the worksheet does', () => {
        render(<CandidatePicker candidates={TWO} onPick={() => {}} />)
        expect(screen.getByText('2.4R').className).not.toMatch(/is-thin/)
        expect(screen.getByText('1.2R').className).toMatch(/is-thin/)
    })

    it('hands the whole candidate back on pick, not just a label', () => {
        const onPick = vi.fn()
        render(<CandidatePicker candidates={TWO} onPick={onPick} />)
        fireEvent.click(screen.getAllByRole('button')[1])
        expect(onPick).toHaveBeenCalledTimes(1)
        expect(onPick.mock.calls[0][0].label).toBe('Break of the shelf')
        expect(onPick.mock.calls[0][0].setup.trade_mode).toBe('classical')
    })

    it('renders a zero-width zone as a single price, not a degenerate range', () => {
        const exact = [mk({ setup: { entry_zones: [{ id: 'ez1', lower: 200, upper: 200 }], stop_zones: [], tp_zones: [] } })]
        render(<CandidatePicker candidates={exact} onPick={() => {}} />)
        expect(screen.getByText(/^200$/)).toBeTruthy()
    })

    it('renders nothing when there is no offer', () => {
        const { container } = render(<CandidatePicker candidates={[]} />)
        expect(container.firstChild).toBeNull()
    })
})
