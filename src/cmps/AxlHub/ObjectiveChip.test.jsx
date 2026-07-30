import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ObjectiveChip } from './ObjectiveChip.jsx'
import { formatObjective, formatDeadline } from './objectiveFormat.js'

// The chip is how a user can tell we understood their goal — and correct us if we didn't. The two
// behaviours worth pinning: a percent target reads as a goal with a date, and a MISSING risk number
// is shown rather than hidden. A silent blank there is how someone reaches a desk and gets asked
// for something they thought they had already given.

const goal = (over = {}) => ({
    id: 'obj_1',
    target: { pct: 5, amount: null, currency: null },
    horizon: { days: 7, until: '2026-08-06' },
    risk: { maxDrawdownPct: 2, amount: null },
    symbol: null,
    ...over,
})

afterEach(cleanup)

describe('formatDeadline', () => {
    it('reads the stored date as UTC, so it never slips a day west of Greenwich', () => {
        expect(formatDeadline('2026-08-06')).toMatch(/Aug/)
        expect(formatDeadline('2026-08-06')).toMatch(/6/)
    })

    it('returns nothing for a date it cannot trust', () => {
        expect(formatDeadline('next tuesday')).toBe(null)
        expect(formatDeadline(null)).toBe(null)
    })
})

describe('formatObjective', () => {
    it('states the target and the deadline together', () => {
        expect(formatObjective(goal()).goal).toMatch(/\+5% by Aug 6/)
    })

    it('handles a cash target as well as a percentage', () => {
        const parts = formatObjective(goal({ target: { pct: null, amount: 2000, currency: 'USD' } }))
        expect(parts.goal).toMatch(/\+2,000 USD/)
    })

    it('shows nothing at all when there is no goal, or no target in it', () => {
        expect(formatObjective(null)).toBe(null)
        expect(formatObjective(goal({ target: {} }))).toBe(null)
    })

    it('drops the deadline rather than the goal when the date is unusable', () => {
        expect(formatObjective(goal({ horizon: { days: 7 } })).goal).toBe('+5%')
    })
})

describe('ObjectiveChip', () => {
    it('renders the goal and the stated risk', () => {
        render(<ObjectiveChip objective={goal()} />)
        expect(screen.getByText(/\+5% by Aug 6/)).toBeTruthy()
        expect(screen.getByText('risk 2%')).toBeTruthy()
    })

    it('says so LOUDLY when the risk was never stated', () => {
        // The number every desk needs before it sizes anything. Hiding its absence is the failure.
        render(<ObjectiveChip objective={goal({ risk: {} })} />)
        expect(screen.getByText('risk not set')).toBeTruthy()
    })

    it('shows the name when the goal is about one', () => {
        render(<ObjectiveChip objective={goal({ symbol: 'NVDA' })} />)
        expect(screen.getByText('NVDA')).toBeTruthy()
    })

    it('renders nothing when there is no goal, rather than an empty chip', () => {
        const { container } = render(<ObjectiveChip objective={null} />)
        expect(container.firstChild).toBe(null)
    })

    it('offers no dismiss control unless the caller can handle one', () => {
        render(<ObjectiveChip objective={goal()} />)
        expect(screen.queryByLabelText(/dismiss/i)).toBe(null)
    })
})
