import { describe, it, expect, vi } from 'vitest'
import { confirmAvoid } from './avoidOk.js'

describe('confirmAvoid — the user OKs an AVOID industry before the book is saved (step 7)', () => {
    const plan = { ideas: [{ asset: 'XOM' }], limits: { avoid: [{ asset: 'XOM', industry: 'Integrated Oil' }] } }

    it('asks, names the name and its industry, and marks the plan when the user says yes', () => {
        const ask = vi.fn(() => true)
        const out = confirmAvoid(plan, ask)
        expect(ask.mock.calls[0][0]).toMatch(/XOM \(Integrated Oil\) AVOID/)
        expect(out.avoid_ok).toBe(true)
        expect(plan.avoid_ok).toBeUndefined()
    })

    it('a no stops the save; a plan with nothing to avoid is not asked about', () => {
        expect(confirmAvoid(plan, () => false)).toBeNull()
        const ask = vi.fn()
        const clean = { ideas: [{ asset: 'MSFT' }], limits: { avoid: [] } }
        expect(confirmAvoid(clean, ask)).toBe(clean)
        expect(ask).not.toHaveBeenCalled()
    })
})
