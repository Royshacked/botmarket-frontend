// Pure-function tests, but they run under VITEST, not node --test: they assert against the REAL
// desk table, and agentMeta is a .jsx module Node's runner can't parse. Testing them against a
// hand-copied fixture instead would let the pipelines drift out from under the navigation that
// walks them — which is the one thing worth guarding here.
import { describe, it, expect } from 'vitest'
import { resolveStepIndex, previousStep } from './pipelineNav.js'
import { DESKS } from './agentMeta.jsx'

const trade     = DESKS.find(d => d.key === 'trade').steps
const portfolio = DESKS.find(d => d.key === 'portfolio').steps

describe('pipelineNav — where the user is standing', () => {
    it('follows a single-visit pipeline straight down the chain', () => {
        expect(resolveStepIndex(trade, 'scanner', 0)).toBe(0)
        expect(resolveStepIndex(trade, 'kairos', 0)).toBe(1)
    })

    // The portfolio desk visits Atlas twice — the mandate on the way in, the allocation on the way
    // back. A plain tab match can't tell them apart, and getting it wrong would send someone who
    // just finished research all the way back to the start.
    it('reads Atlas as the MANDATE on the way in', () => {
        expect(resolveStepIndex(portfolio, 'portfolio', 0)).toBe(0)
    })

    it('reads Atlas as ALLOCATE when arriving from research', () => {
        const atResearch = resolveStepIndex(portfolio, 'analyst', 1)
        expect(atResearch).toBe(2)
        expect(resolveStepIndex(portfolio, 'portfolio', atResearch)).toBe(3)
    })

    it('walks the whole portfolio chain in order', () => {
        let step = 0
        for (const [tab, expected] of [['portfolio', 0], ['scanner', 1], ['analyst', 2], ['portfolio', 3]]) {
            step = resolveStepIndex(portfolio, tab, step)
            expect(step).toBe(expected)
        }
    })

    it('keeps the user’s place when they step OUTSIDE the pipeline', () => {
        // The order ticket and the Idea chat belong to no desk — visiting one shouldn't lose the
        // pipeline position, or coming back would put them at the wrong step.
        expect(resolveStepIndex(portfolio, 'ticket', 2)).toBe(2)
        expect(resolveStepIndex(trade, 'mentor', 1)).toBe(1)
    })
})

describe('pipelineNav — where back goes', () => {
    it('the first step has nowhere to go back to (axl is the way out)', () => {
        expect(previousStep(trade, 0)).toBe(null)
        expect(previousStep(portfolio, 0)).toBe(null)
    })

    it('steps back one link, naming where it lands', () => {
        expect(previousStep(trade, 1).tab).toBe('scanner')
        expect(previousStep(portfolio, 1).label).toBe('Mandate')
        expect(previousStep(portfolio, 2).tab).toBe('scanner')
        expect(previousStep(portfolio, 3).tab).toBe('analyst')
    })

    it('every walkable step of both pipelines HAS a back button', () => {
        // The point of the feature: no step the user can stand on is a dead end.
        for (const steps of [trade, portfolio]) {
            steps.forEach((s, i) => {
                if (!s.tab || i === 0) return   // background monitors aren't stood on; step 0 exits via axl
                expect(previousStep(steps, i)).toBeTruthy()
            })
        }
    })

    it('never sends the user to a background monitor', () => {
        // Steps with no tab (Hermes, Themis) are nowhere to stand — so nowhere to go back to.
        const withMonitor = [{ tab: 'kairos', label: 'Build' }, { tab: null, label: 'Monitor' }, { tab: 'portfolio', label: 'After' }]
        expect(previousStep(withMonitor, 2)).toBe(null)
    })

    it('is safe on an unknown desk', () => {
        expect(previousStep(undefined, 2)).toBe(null)
        expect(resolveStepIndex(undefined, 'scanner', 1)).toBe(1)
    })
})
