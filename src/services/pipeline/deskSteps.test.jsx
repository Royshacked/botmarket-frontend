// The conveyor's questions asked of the REAL desks. Separate from hop.test.js because DESKS lives
// in a .jsx (its agent icons are markup) and node's test runner cannot import that — this one runs
// under vitest. What it locks is the DECLARATIONS: change a desk's steps and the answers here move
// with it, which is the point of the pipeline being data.
import { describe, it, expect } from 'vitest'
import { DESKS } from '../../cmps/AxlHub/agentMeta.jsx'
import { producesOne, hasDownstream, findReceiver } from './hop.js'
import { contractFor } from './contracts.js'
import { KIND, makeArtifact } from './artifact.js'

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

// Mentor opens on a sentence it writes itself. A name off a screen is not one the user brought, and
// the brief has to say so — opening as "my own trade" would have Mentor pressure-test a plan that
// does not exist yet.
describe('Mentor words its own opening turn', () => {
    const brief = (item) => contractFor('mentor').brief(
        makeArtifact({ kind: KIND.CANDIDATE_LIST, items: [item] }))

    it('a bare ticker opens as the user\'s own trade', () => {
        expect(brief({ ticker: 'NVDA' }).message).toBe('I want to work on my own NVDA trade.')
    })

    it('a ticker carrying a read says where it came from instead', () => {
        const msg = brief({ ticker: 'NVDA', thesis: 'AI capex re-rating' }).message
        expect(msg).toContain('NVDA')
        expect(msg).toContain('AI capex re-rating')
        expect(msg).not.toContain('my own')
    })

    it('nothing to open on yields no brief rather than an empty turn', () => {
        expect(brief({})).toBe(null)
        expect(contractFor('mentor').brief(makeArtifact({ kind: KIND.CANDIDATE_LIST }))).toBe(null)
    })
})

describe('the trade desk routes both ways', () => {
    it('Argus hands the name forward to Kairos', () => {
        expect(findReceiver(stepsOf('trade'), 0, KIND.CANDIDATE_LIST)?.step.tab).toBe('kairos')
    })

    // "Let's look for another name" — the hop that a forward-only rule would lose.
    it('Kairos asks the step BEFORE it for another name', () => {
        expect(findReceiver(stepsOf('trade'), 1, KIND.SCAN_REQUEST)?.step.tab).toBe('scanner')
    })
})
