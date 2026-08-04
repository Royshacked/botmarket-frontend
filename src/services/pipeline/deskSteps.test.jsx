// The conveyor's questions asked of the REAL desks. Separate from hop.test.js because DESKS lives
// in a .jsx (its agent icons are markup) and node's test runner cannot import that — this one runs
// under vitest. What it locks is the DECLARATIONS: change a desk's steps and the answers here move
// with it, which is the point of the pipeline being data.
import { describe, it, expect } from 'vitest'
import { DESKS } from '../../cmps/AxlHub/agentMeta.jsx'
import { producesOne, hasDownstream, findReceiver } from './hop.js'
import { KIND } from './artifact.js'

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

describe('the trade desk routes both ways', () => {
    it('Argus hands the name forward to Kairos', () => {
        expect(findReceiver(stepsOf('trade'), 0, KIND.CANDIDATE_LIST)?.step.tab).toBe('kairos')
    })

    // "Let's look for another name" — the hop that a forward-only rule would lose.
    it('Kairos asks the step BEFORE it for another name', () => {
        expect(findReceiver(stepsOf('trade'), 1, KIND.SCAN_REQUEST)?.step.tab).toBe('scanner')
    })
})
