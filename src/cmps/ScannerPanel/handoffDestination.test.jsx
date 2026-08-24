// Where Argus's single pick goes, and what the user is TOLD about where it goes.
//
// These have to be the same answer, and for two months they were not: the trade desk moved its
// build step from Kairos to Mentor, the routing followed, and every sentence describing it stayed
// on Kairos — the empty-state intro, the hand-off button, and the prompt Argus writes its own prose
// from. A user entering the trade desk was told their pick was going somewhere it wasn't.
//
// The fix is that nothing names a desk by hand any more: MainPage asks findReceiver, the same
// function emitArtifact routes with. So this file asserts against the REAL desk table rather than a
// fixture — a fixture would drift out from under the pipelines it exists to describe.
import { describe, it, expect } from 'vitest'
import { findReceiver } from '../../services/pipeline/hop.js'
import { resolveStepIndex } from '../AxlHub/pipelineNav.js'
import { DESKS, AGENTS } from '../AxlHub/agentMeta.jsx'
import { KIND } from '../../services/pipeline/artifact.js'

// The derivation MainPage runs, kept in one place so the test exercises the shape of it.
function handoffDestination(pipelineKey, pipelineStep = 0) {
    const steps = pipelineKey
        ? (DESKS.find(d => d.key === pipelineKey)?.steps ?? [])
        : (DESKS.find(d => d.steps.some(s => s.tab === 'scanner'))?.steps ?? [])
    const from = steps.length ? resolveStepIndex(steps, 'scanner', pipelineStep) : 0
    return findReceiver(steps, from, KIND.CANDIDATE_LIST)?.step?.tab ?? null
}

describe('the trade desk hand-off destination', () => {
    it('is Mentor — the desk that builds a setup, not Kairos', () => {
        expect(handoffDestination('trade')).toBe('mentor')
    })

    // The regression in its own words: the label is read off the routing, so it cannot be Kairos
    // while the artifact goes to Mentor.
    it('matches the step the trade desk actually routes a candidate list to', () => {
        const steps = DESKS.find(d => d.key === 'trade').steps
        const scannerIdx = steps.findIndex(s => s.tab === 'scanner')
        expect(findReceiver(steps, scannerIdx, KIND.CANDIDATE_LIST).step.tab)
            .toBe(handoffDestination('trade'))
    })

    it('resolves to a brand the UI can show', () => {
        expect(AGENTS[handoffDestination('trade')].brand).toBe('Mentor')
    })
})

describe('outside a pipeline', () => {
    // Argus reached directly still has somewhere to send a pick: emitArtifact BORROWS the chain of
    // the desk Argus belongs to rather than routing on capability, because three desks now accept a
    // candidate_list and "the only one that qualifies" stopped being an answer. The label has to
    // borrow the same chain or it describes a different hop than the one that happens.
    it('borrows the trade chain, the same one emitArtifact borrows', () => {
        expect(handoffDestination(null)).toBe('mentor')
    })
})

describe('the portfolio desk', () => {
    // Argus stands mid-chain here and its output is a LIST for research, not a pick — different
    // question, and the trade desk's answer must not leak into it.
    it('does not route its screen to Mentor', () => {
        expect(handoffDestination('portfolio')).not.toBe('mentor')
    })
})
