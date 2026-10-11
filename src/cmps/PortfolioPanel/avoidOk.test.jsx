import { describe, it, expect, vi } from 'vitest'
import { confirmAvoid, confirmAvoidAdds } from './avoidOk.js'

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

describe('confirmAvoidAdds — a review add in an AVOID industry (step 7)', () => {
    const update = { portfolioId: 'p1', changes: [
        { action: 'add_item', item: { asset: 'XOM' }, avoid: { industry: 'Integrated Oil' } },
        { action: 'trim_item', itemId: 'i1' },
    ] }

    it('a yes marks the add with the user\'s OK; a no drops just that add', () => {
        const yes = confirmAvoidAdds(update, () => true)
        expect(yes.changes[0].item.avoid_ok).toBe(true)
        expect(update.changes[0].item.avoid_ok).toBeUndefined()
        const no = confirmAvoidAdds(update, () => false)
        expect(no.changes.map(c => c.action)).toEqual(['trim_item'])
    })

    it('nothing left after a no → nothing to apply; nothing flagged → not asked', () => {
        expect(confirmAvoidAdds({ changes: [update.changes[0]] }, () => false)).toBeNull()
        const ask = vi.fn()
        const clean = { changes: [{ action: 'trim_item', itemId: 'i1' }] }
        expect(confirmAvoidAdds(clean, ask)).toBe(clean)
        expect(ask).not.toHaveBeenCalled()
    })
})
