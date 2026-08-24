import { describe, it, expect } from 'vitest'
import { reviewApplyMessage, queuedAnything } from './reviewApply.js'

// The toast after accepting a review. It used to be the flat string "Changes applied." — printed
// over a review in which every change silently did nothing, because applyRebalance reported ok:true
// regardless of what its individual changes returned. The rule now: never claim more than happened.

describe('reviewApplyMessage', () => {
    const applied  = (n) => ({ applied: n, deferredItems: [], failed: [] })
    const queued   = (n) => ({ applied: 0, deferredItems: Array.from({ length: n }, (_, i) => ({ itemId: `i${i}` })), failed: [] })

    it('says what applied', () => {
        expect(reviewApplyMessage(applied(2))).toBe('2 changes applied.')
        expect(reviewApplyMessage(applied(1))).toBe('1 change applied.')
    })

    it('a fully queued review says QUEUED, never "applied"', () => {
        const msg = reviewApplyMessage(queued(3))
        expect(msg).toMatch(/3 changes queued for the open/)
        expect(msg).toMatch(/waiting in your queued list/)
        expect(msg).not.toMatch(/applied/)
    })

    it('names the reopen time when the server knows it', () => {
        // The weekday is OPTIONAL in this assertion, and that is the whole subtlety: the formatter
        // adds one when the reopen falls on a different day, so "now + 2h" produces "12:07 AM" for
        // most of the day and "Sun 12:07 AM" for the two hours before midnight. Demanding digits
        // straight after the bracket made this test fail nightly between 22:00 and midnight —
        // a gate that is red on a clock teaches people to ignore it.
        const at = new Date(); at.setHours(at.getHours() + 2)
        const msg = reviewApplyMessage({ ...queued(1), nextOpenMs: at.getTime() })
        expect(msg).toMatch(/queued for the open \((?:\w{3} )?\d{1,2}:\d{2}/)
    })

    it('a mixed result reports both buckets', () => {
        const msg = reviewApplyMessage({ applied: 2, deferredItems: [{ itemId: 'a' }], failed: [] })
        expect(msg).toMatch(/2 changes applied/)
        expect(msg).toMatch(/1 queued for the open/)
    })

    it('failures are named, with the reason when they share one', () => {
        const msg = reviewApplyMessage({ applied: 1, deferredItems: [], failed: [{ reason: 'add_too_small' }] })
        expect(msg).toMatch(/1 change couldn't be applied \(too small to place\)/)
    })

    // The 2026-08-20 regression: a scale-in the paper venue refused (no live price for EME) came
    // back carrying only `legsFailed`, so this looked up `undefined` and printed a bare
    // "1 change couldn't be applied" — indistinguishable from a change that never ran at all.
    it('a venue rejection is named, not left bare', () => {
        const msg = reviewApplyMessage({ applied: 3, deferredItems: [], failed: [{ reason: 'broker_rejected' }] })
        expect(msg).toMatch(/1 change couldn't be applied \(the venue rejected it\)/)
    })

    it('a broker that cannot close positions says so', () => {
        const msg = reviewApplyMessage({ applied: 0, deferredItems: [], failed: [{ reason: 'broker_cannot_close' }] })
        expect(msg).toMatch(/can't close positions/)
    })

    it('mixed failure reasons drop the parenthetical rather than pick one', () => {
        const msg = reviewApplyMessage({
            applied: 0, deferredItems: [{ itemId: 'a' }],
            failed: [{ reason: 'add_too_small' }, { reason: 'no_position' }],
        })
        expect(msg).toMatch(/2 changes couldn't be applied\./)
        expect(msg).not.toMatch(/\(/)
    })

    it('a pending (unactivated) book keeps its activate nudge', () => {
        expect(reviewApplyMessage(applied(1), { pending: true })).toMatch(/Activate the book/)
    })

    it('an older response with no buckets falls back rather than inventing a count', () => {
        expect(reviewApplyMessage({ ok: true })).toBe('Changes applied.')
        expect(reviewApplyMessage(undefined)).toBe('Changes applied.')
        // The fallback is the pre-refactor sentence verbatim, lower-case verb and all.
        expect(reviewApplyMessage({ ok: true }, { pending: true })).toMatch(/activate the book/i)
    })
})

// The queued list is FETCHED, not pushed: on mount, on Axl's market-open card, and after the user
// executes or cancels a row. Accepting a review off-hours added rows to it and told nobody, so the
// toast said "waiting in your queued list" over a list the user had to reload the page to see.
// This predicate is what the accept path asks before re-reading it.
describe('queuedAnything', () => {
    it('is true when a change was deferred to the open', () => {
        expect(queuedAnything({ applied: 0, deferredItems: [{ itemId: 'a' }], failed: [] })).toBe(true)
        expect(queuedAnything({ applied: 2, deferredItems: [{ itemId: 'a' }], failed: [] })).toBe(true)
    })

    it('is false for a review that fully executed', () => {
        expect(queuedAnything({ applied: 2, deferredItems: [], failed: [] })).toBe(false)
    })

    it('is false for a FAILED queue write — there is no row to go and look at', () => {
        // A deferral whose enqueue failed reports in `failed`, not `deferredItems` (see
        // portfolioRebalance.applyRebalance). Refreshing on it would be a fetch that changes nothing
        // and, worse, would pair with a toast that never claimed anything was queued.
        expect(queuedAnything({ applied: 0, deferredItems: [], failed: [{ reason: 'queue_failed' }] })).toBe(false)
    })

    it('is false for an older response shape with no buckets at all', () => {
        expect(queuedAnything({ ok: true })).toBe(false)
        expect(queuedAnything(undefined)).toBe(false)
    })
})
