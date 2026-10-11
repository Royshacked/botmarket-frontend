import { describe, it, expect, vi } from 'vitest'
import { confirmAvoid, confirmAvoidAdds, avoidRetry, avoidRefusalRetry } from './avoidOk.js'

describe('confirmAvoid — the user OKs an AVOID industry before the book is saved (step 7)', () => {
    const plan = { ideas: [{ asset: 'XOM' }], limits: { avoid: [{ asset: 'XOM', industry: 'Integrated Oil' }] } }

    it('asks, names the name and its industry, and marks the plan when the user says yes', () => {
        const ask = vi.fn(() => true)
        const out = confirmAvoid(plan, ask)
        expect(ask.mock.calls[0][0]).toMatch(/XOM \(Integrated Oil\) AVOID/)
        expect(out.avoid_ok).toEqual(['XOM'])
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

describe('code review 2026-10-11 — the OK names its symbols; a refusal is asked about and retried', () => {
    it('confirmAvoid carries the names the user said yes to', () => {
        const plan = { ideas: [], limits: { avoid: [{ asset: 'XOM', industry: 'Oil' }, { asset: 'BP', industry: 'Oil' }] } }
        expect(confirmAvoid(plan, () => true).avoid_ok).toEqual(['XOM', 'BP'])
    })

    it('avoidRetry asks about the names the SERVER refused, and only for that refusal', () => {
        const plan = { ideas: [{ asset: 'XOM' }], limits: { avoid: [] } }
        const err = { response: { status: 409, data: { outcome: 'avoid_needs_ok', avoid: [{ asset: 'XOM', industry: 'Oil' }] } } }
        const ask = vi.fn(() => true)
        expect(avoidRetry(err, plan, ask).avoid_ok).toEqual(['XOM'])
        expect(ask.mock.calls[0][0]).toMatch(/XOM \(Oil\)/)
        expect(avoidRetry(err, plan, () => false)).toBeNull()
        expect(avoidRetry({ response: { status: 500 } }, plan, ask)).toBeUndefined()
    })

    it('avoidRefusalRetry sends again only the refused changes, with the OK, after a yes', () => {
        const update = { portfolioId: 'p1', changes: [
            { action: 'add_item', item: { asset: 'XOM' } },
            { action: 'add_to_item', itemId: 'i_cvx', addFraction: 0.5 },
            { action: 'trim_item', itemId: 'i_msft' },
        ] }
        const failed = [
            { action: 'add_item', asset: 'XOM', ok: false, reason: 'avoid_industry', avoid: [{ asset: 'XOM', industry: 'Oil' }] },
            { action: 'add_to_item', itemId: 'i_cvx', ok: false, reason: 'avoid_industry', avoid: [{ asset: 'CVX', industry: 'Oil' }] },
            { action: 'trim_item', itemId: 'i_msft', ok: false, reason: 'market_closed' },
        ]
        const { retry } = avoidRefusalRetry(update, failed, () => true)
        expect(retry.changes.map(c => c.action)).toEqual(['add_item', 'add_to_item'])
        expect(retry.changes[0].item.avoid_ok).toBe(true)
        expect(retry.changes[1].avoid_ok).toBe(true)
        expect(avoidRefusalRetry(update, failed, () => false)).toEqual({ retry: null, declined: true })
        expect(avoidRefusalRetry(update, [failed[2]], () => true)).toEqual({ retry: null, declined: false })
    })
})
