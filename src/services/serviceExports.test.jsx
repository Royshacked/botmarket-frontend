import { describe, it, expect } from 'vitest'

// Every agent service publishes its surface as an object literal at the TOP of the file, with the
// implementations below it. That layout is only safe while the members are hoisted `function`
// declarations — the moment one becomes a `const` arrow, the object literal reads it inside the
// temporal dead zone and the module throws on IMPORT:
//
//     Uncaught ReferenceError: Cannot access 'listScans' before initialization
//
// which is what shipped when scans moved onto the shared entityApi and `async function listScans()`
// became `const listScans = () => api.list()`. Four sibling services carried the identical fault.
//
// Nothing else catches this: it is not a lint error, the files parse fine, and a unit test of any
// individual function still passes because it never evaluates the module top-level in isolation.
// Importing the module IS the assertion — the expectations below just pin the surface.
//
// This is a .test.jsx so it runs under vitest (vite resolution handles the extensionless imports);
// see the runner split in vite.config.js.

import { scannerService }    from './scanner/scanner.service.remote'
import { kairosService }     from './kairos/kairos.service.remote'
import { mentorService }     from './mentor/mentor.service.remote'
import { analystService }    from './analyst/analyst.service.remote'
import { tradeIdeasService } from './tradeIdeas/tradeIdeas.service.remote'

const SERVICES = {
    scannerService:    [scannerService,    ['sendStream', 'listScans', 'createScan', 'updateScan', 'deleteScan']],
    kairosService:     [kairosService,     ['sendStream', 'generateCall', 'updateCall', 'listCalls', 'getCall', 'getPerformance', 'actOnCall', 'deleteCall']],
    mentorService:     [mentorService,     ['sendStream', 'generateSetup', 'updateSetup', 'listSetups', 'getSetup', 'armSetup', 'disarmSetup', 'deleteSetup']],
    analystService:    [analystService,    ['sendStream', 'initiateCoverage', 'listCoverage', 'getCoverage', 'updateCoverage', 'retireCoverage']],
    tradeIdeasService: [tradeIdeasService, ['createIdea', 'createBatch', 'getIdeas', 'getIdea', 'deleteIdea', 'updateIdea', 'placeOrders', 'triggerEntry']],
}

describe('agent service exports', () => {
    for (const [name, [service, expected]] of Object.entries(SERVICES)) {
        describe(name, () => {
            // An undefined member is the tell-tale of a member that was renamed out from under the
            // object literal; a non-function is the tell-tale of a value captured before init.
            it('exposes every documented method as a callable', () => {
                for (const method of expected) {
                    expect(typeof service[method], `${name}.${method}`).toBe('function')
                }
            })

            it('exposes nothing undefined', () => {
                const holes = Object.entries(service).filter(([, v]) => typeof v !== 'function')
                expect(holes.map(([k]) => k)).toEqual([])
            })
        })
    }
})
