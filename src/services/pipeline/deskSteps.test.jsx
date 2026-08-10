// The conveyor's questions asked of the REAL desks. Separate from hop.test.js because DESKS lives
// in a .jsx (its agent icons are markup) and node's test runner cannot import that — this one runs
// under vitest. What it locks is the DECLARATIONS: change a desk's steps and the answers here move
// with it, which is the point of the pipeline being data.
import { describe, it, expect } from 'vitest'
import { DESKS } from '../../cmps/AxlHub/agentMeta.jsx'
import { producesOne, hasDownstream, findReceiver, planEntry } from './hop.js'
import { previousStep } from '../../cmps/AxlHub/pipelineNav.js'
import { contractFor } from './contracts.js'
import { mentorContract } from '../../cmps/MentorPanel/mentor.contract.js'
import { KIND, STATUS, makeArtifact } from './artifact.js'

const stepsOf = (key) => DESKS.find(d => d.key === key).steps

describe('what each desk asks Argus for', () => {
    it('the trade desk wants ONE name — it exists to build one trade', () => {
        expect(producesOne(stepsOf('trade'), 'scanner')).toBe(true)
    })

    it('the scan and portfolio desks want a list', () => {
        expect(producesOne(stepsOf('scan'), 'scanner')).toBe(false)
        expect(producesOne(stepsOf('portfolio'), 'scanner')).toBe(false)
    })

    it('a desk with no scan step at all answers no, not undefined', () => {
        expect(producesOne(stepsOf('research'), 'scanner')).toBe(false)
    })
})

describe('whether a scan is finished or someone is still waiting', () => {
    // The regression this closes: entering the trade desk AT Argus saved a list and bounced to the
    // hub, because "mid-pipeline" was inferred from the investing profile rather than asked of the
    // pipeline. Kairos was still waiting, and a trading list looked finished.
    it('a trade-desk scan has Kairos after it', () => {
        expect(hasDownstream(stepsOf('trade'), 0)).toBe(true)
    })

    it('a scan-desk list is the end of the road', () => {
        expect(hasDownstream(stepsOf('scan'), 0)).toBe(false)
    })

    it('the last agent step is the end even with a monitor behind it', () => {
        expect(hasDownstream(stepsOf('trade'), 1)).toBe(false)
        expect(hasDownstream(stepsOf('assist'), 0)).toBe(false)
    })
})

// The claim the single-step contracts exist to make good. Neither desk routes anything today; what
// their contracts buy is that giving them a second step is an edit to `steps` and nothing else —
// no agent touched, no handler written, no state added to MainPage.
//
// These insert a step into a COPY of the real desk rather than changing it. Mentor deliberately
// never screens (the ticker comes from the user), so the assist desk stays one step; the point is
// that it *could* stop being one for the price of a line.
describe('a step can be inserted with no agent edited', () => {
    it('the assist desk has nowhere to route a candidate today', () => {
        expect(findReceiver(stepsOf('assist'), 0, KIND.CANDIDATE_LIST)).toBe(null)
    })

    it('…and putting a scan in front of Mentor is enough to make it route', () => {
        const withScan = [{ tab: 'scanner', label: 'Scan', produces: 'one' }, ...stepsOf('assist')]
        expect(findReceiver(withScan, 0, KIND.CANDIDATE_LIST)?.step.tab).toBe('mentor')
    })

    it('and the backward leg comes free — Mentor could ask Argus for a name', () => {
        const withScan = [{ tab: 'scanner', label: 'Scan' }, ...stepsOf('assist')]
        expect(findReceiver(withScan, 1, KIND.SCAN_REQUEST)?.step.tab).toBe('scanner')
    })

    it('the research desk takes a screened list the same way', () => {
        const withScan = [{ tab: 'scanner', label: 'Screen' }, ...stepsOf('research')]
        expect(findReceiver(withScan, 0, KIND.CANDIDATE_LIST)?.step.tab).toBe('analyst')
    })
})

// Mentor takes the envelope WHOLE. It opened on a brief-written sentence until Argus began
// recommending a lens with the name: Mentor authors `trade_mode`, so the recommendation has to
// reach the prompt as data rather than as prose in an opening line, where it would be
// indistinguishable from the user having asked for it.
//
// The opening WORDING now lives in MentorPanel (and is tested there) — with the seed it must agree
// with. Two openers for one hand-off is one of them going stale, which is the invariant
// hop.test.js's "an artifact desk does not also carry a brief" enforces.
describe('Mentor takes a handed name as an artifact', () => {
    it('accepts a candidate list, delivered whole and unworded', () => {
        const c = contractFor('mentor')
        expect(c.accepts).toContain(KIND.CANDIDATE_LIST)
        expect(c.deliver).toBe('artifact')
        expect(c.brief).toBeUndefined()
    })

    // The desk holds the user's own thinking about the trade; a fresh panel would throw away the
    // very thing it exists to work on.
    it('continues the open conversation rather than remounting', () => {
        expect(contractFor('mentor').mount).toBe('continues')
    })
})

// Against the REAL desks: the two entries the research hand-offs actually make.
describe('entering a real pipeline mid-way', () => {
    const names = makeArtifact({ kind: KIND.CANDIDATE_LIST, items: [{ ticker: 'NVDA' }] })

    it('a sleeve enters the portfolio desk at Research, past Mandate and Screen', () => {
        const plan = planEntry({ steps: stepsOf('portfolio'), agent: 'analyst', artifact: names })
        expect(plan.targetTab).toBe('analyst')
        expect(stepsOf('portfolio')[plan.targetIndex].label).toBe('Research')
    })

    // Atlas stands at Mandate AND Allocate. A finished run must land on the second — delivering it
    // to the first hands a built book to the desk that was meant to frame it.
    it('a coverage set enters at Allocate, not at the Mandate Atlas also stands on', () => {
        const steps = stepsOf('portfolio')
        const plan  = planEntry({
            steps, agent: 'portfolio',
            artifact: makeArtifact({ kind: KIND.COVERAGE_SET, items: [{ ticker: 'NVDA', sector: 'Technology' }] }),
        })
        expect(steps[plan.targetIndex].label).toBe('Allocate')
        expect(plan.delivery.type).toBe('seed')
        expect(plan.delivery.message).toContain('NVDA')
    })

    it('one name enters the research desk, which is a single step', () => {
        const plan = planEntry({ steps: stepsOf('research'), agent: 'analyst', artifact: names })
        expect(plan.targetIndex).toBe(0)
    })

    // Walking back from Research must reach the mandate — entering mid-way skips Atlas, it does not
    // cut it out, and the user has to be able to go and set the frame the names were found without.
    it('the mandate is still reachable backwards from where they landed', () => {
        const steps = stepsOf('portfolio')
        const idx   = planEntry({ steps, agent: 'analyst', artifact: names }).targetIndex
        expect(previousStep(steps, idx)?.tab).toBe('scanner')
        expect(previousStep(steps, idx - 1)?.tab).toBe('portfolio')
    })
})

// The scar this guards, verbatim from the code it replaced: a sleeve that screened empty was
// filtered out on the way back, so Atlas saw a shorter coverage list and no reason for it, and
// built a book quietly missing a sleeve its own architecture had called for. An unfilled sleeve is
// a DECISION — widen it, drop it, reallocate its weight — and one Atlas cannot make unasked.
describe('Atlas is told what did NOT come back', () => {
    const coverage = (over = {}) => makeArtifact({
        kind:  KIND.COVERAGE_SET,
        items: [{ ticker: 'NVDA', sector: 'Technology' }],
        ...over,
    })
    const msg = (a) => contractFor('portfolio').brief(a).message

    it('names each covered ticker with the sleeve it was researched for', () => {
        expect(msg(coverage())).toContain('NVDA (Technology)')
    })

    it('an unfilled sleeve is named, not omitted', () => {
        const m = msg(coverage({ context: { unfilled: ['Utilities'], declined: [] } }))
        expect(m).toContain('Utilities')
        expect(m).toMatch(/NOTHING screened/)
    })

    it('a screened-but-declined name is distinguished from one never found', () => {
        const m = msg(coverage({ context: { unfilled: [], declined: [{ ticker: 'KLAC', sector: 'Semis' }] } }))
        expect(m).toContain('KLAC (Semis)')
        expect(m).toMatch(/NOT researched/)
    })

    // Without this, Atlas's most natural repair is the wrong one: quietly topping the empty bucket
    // up from a sleeve that did produce names, which is not the book anyone designed.
    it('a shortfall always comes with the instruction not to fill it from elsewhere', () => {
        const m = msg(coverage({ context: { unfilled: ['Energy'], declined: [] } }))
        expect(m).toMatch(/Do not fill those buckets/)
    })

    it('a clean run says none of that', () => {
        const m = msg(coverage())
        expect(m).not.toMatch(/NOTHING screened|NOT researched|Do not fill/)
    })

    it('a run that produced nobody is still an answer, not silence', () => {
        const m = msg(makeArtifact({
            kind: KIND.COVERAGE_SET, items: [], status: STATUS.EMPTY,
            context: { unfilled: ['Technology', 'Energy'], declined: [] },
        }))
        expect(m).toContain('No coverage was initiated')
        expect(m).toContain('Technology, Energy')
    })
})

describe('the trade desk routes both ways', () => {
    it('Argus hands the name forward to the build step, which is now Mentor', () => {
        expect(findReceiver(stepsOf('trade'), 0, KIND.CANDIDATE_LIST)?.step.tab).toBe('mentor')
    })

    // "Let's look for another name" — the hop that a forward-only rule would lose.
    //
    // The ROUTE still resolves, because Argus accepts a scan_request from either side. What no
    // longer exists is a sender: Kairos emitted `<scan_request>`, Mentor's contract emits nothing,
    // so on this desk the backward hop is reachable but unused. Asserted rather than deleted so the
    // gap is recorded — if the premium autonomous Mentor mode wants it back, this is the wire.
    it('the step BEFORE the build step is still where another name would come from', () => {
        expect(findReceiver(stepsOf('trade'), 1, KIND.SCAN_REQUEST)?.step.tab).toBe('scanner')
        expect(mentorContract.emits).not.toContain(KIND.SCAN_REQUEST)
    })
})
