import { describe, it, expect } from 'vitest'
import { lastTurnCompletedWorkup } from '../../customHooks/useChatStream.js'

// Gates the "Draft it now" ask in BOTH Prometheus and Pythia. The bug it fixes: asking a desk to
// EXPLAIN something it had already produced was followed by a draft button, as though answering had
// failed to produce anything.
//
// Lives under vitest rather than the node suite because useChatStream reaches app modules through
// Vite-style extensionless imports, which node's ESM resolver rejects.

const user  = (content = 'hi')   => ({ role: 'user', content })
const bot   = (content = 'sure') => ({ role: 'assistant', content })
const phase = (n)                => ({ role: 'phase', phase: n })

describe('lastTurnCompletedWorkup', () => {
    it('a plain conversational turn announces no phases → no ask', () => {
        expect(lastTurnCompletedWorkup([user('explain the forecast'), bot('Here is what it means…')], 5)).toBe(false)
    })

    it('a completed workup with no artifact → the ask is offered', () => {
        expect(lastTurnCompletedWorkup([user('publish the view'), phase(1), bot('…'), phase(5), bot('…')], 5)).toBe(true)
    })

    it('a workup that stopped short of the final phase → no ask', () => {
        // A deliberate pass ends early too, and declining a name is an answer rather than a failed
        // write-up.
        expect(lastTurnCompletedWorkup([user('cover NVDA'), phase(1), phase(4), bot('Passing on this one.')], 6)).toBe(false)
    })

    it('phases from an EARLIER turn do not resurrect the button', () => {
        // The whole reason this is scoped to the last turn: publish once, then ask a question, and a
        // whole-conversation scan would put the button back underneath the answer.
        expect(lastTurnCompletedWorkup([
            user('publish the view'), phase(1), phase(5), bot('done'),
            user('why underweight energy?'), bot('Because…'),
        ], 5)).toBe(false)
    })

    it('a workup AFTER an earlier question still counts', () => {
        expect(lastTurnCompletedWorkup([
            user('what is our view?'), bot('…'),
            user('now re-do it'), phase(1), phase(5), bot('…'),
        ], 5)).toBe(true)
    })

    it('overshooting the final phase still counts', () => {
        expect(lastTurnCompletedWorkup([user('go'), phase(7)], 6)).toBe(true)
    })

    it('degrades to false rather than throwing on junk', () => {
        expect(lastTurnCompletedWorkup([], 5)).toBe(false)
        expect(lastTurnCompletedWorkup(undefined, 5)).toBe(false)
        expect(lastTurnCompletedWorkup([user(), phase(5)], undefined)).toBe(false)
        expect(lastTurnCompletedWorkup([phase(5)], 5)).toBe(false)   // no user turn to scope from
    })
})
