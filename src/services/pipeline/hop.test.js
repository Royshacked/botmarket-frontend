// Routing an artifact along a pipeline — including the trade desk's real steps.
// Node's built-in harness:  node --test src/services/pipeline/hop.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { KIND, makeArtifact } from './artifact.js'
import { findReceiver, planHop, producesOne, hasDownstream } from './hop.js'
import { contractFor, CONTRACTS } from './contracts.js'

// The trading desk exactly as DESKS declares it: Argus, then Kairos, then a background monitor.
const TRADE_STEPS = [
    { tab: 'scanner', label: 'Scan' },
    { tab: 'kairos',  label: 'Build trade' },
    { tab: null,      label: 'Execute & monitor' },
]

test('a result moves forward: Argus\'s list goes on to Kairos', () => {
    const found = findReceiver(TRADE_STEPS, 0, KIND.CANDIDATE_LIST)
    assert.equal(found.index, 1)
    assert.equal(found.step.tab, 'kairos')
})

// The hop that a forward-only rule would lose: Kairos has no name and asks the desk BEFORE it.
test('a request goes back: Kairos asks Argus for a name', () => {
    const found = findReceiver(TRADE_STEPS, 1, KIND.SCAN_REQUEST)
    assert.equal(found.index, 0)
    assert.equal(found.step.tab, 'scanner')
})

test('a background monitor is never a receiver — it has no agent', () => {
    assert.equal(findReceiver([{ tab: null, label: 'Monitor' }], -1, KIND.CANDIDATE_LIST), null)
})

test('nothing in the pipeline takes it → null, not a guess', () => {
    assert.equal(findReceiver(TRADE_STEPS, 0, KIND.COVERAGE_SET), null)
    assert.equal(planHop({ steps: TRADE_STEPS, fromIndex: 0, artifact: makeArtifact({ kind: KIND.COVERAGE_SET }) }), null)
    assert.equal(planHop({ steps: TRADE_STEPS, fromIndex: 0, artifact: null }), null)
})

// With no chain to walk, capability can only answer when it is unambiguous.
test('outside a pipeline, one qualifying desk is an answer', () => {
    const found = findReceiver([], 0, KIND.SCAN_REQUEST)   // only Argus takes a scan request
    assert.equal(found.step.tab, 'scanner')
    assert.equal(found.index, null, 'there is no step to move the crumb to')
    assert.equal(planHop({ steps: [], artifact: makeArtifact({ kind: KIND.SCAN_REQUEST, items: [{ direction: 'long' }] }) }).targetIndex, null)
})

// …and three is not. Kairos, Mentor and Prometheus all take a candidate_list, so choosing between
// them is a ROUTING decision, and a routing decision needs a pipeline to make it. Refusing here is
// what pushes the caller to borrow the emitting desk's own chain (MainPage.emitArtifact) instead of
// letting the registry guess — the alternative is a name silently opening the wrong desk.
test('outside a pipeline, several qualifying desks is not an answer', () => {
    assert.equal(findReceiver([], 0, KIND.CANDIDATE_LIST), null)
    assert.equal(planHop({ steps: [], artifact: makeArtifact({ kind: KIND.CANDIDATE_LIST, items: [{ ticker: 'NVDA' }] }) }), null)
})

// A pipeline that exists but takes nothing must NOT silently fall back to capability — that would
// route an artifact into a desk this pipeline deliberately left out.
test('a pipeline that takes nothing is a dead end, not a fallback', () => {
    assert.equal(findReceiver([{ tab: 'analyst' }], 0, KIND.SCAN_REQUEST), null)
})

test('forward wins when both directions could take it', () => {
    const steps = [{ tab: 'scanner' }, { tab: 'kairos' }, { tab: 'scanner' }]
    assert.equal(findReceiver(steps, 1, KIND.SCAN_REQUEST).index, 2)
})

test('a seed desk is handed the brief it wrote for itself', () => {
    const artifact = makeArtifact({
        kind:  KIND.SCAN_REQUEST,
        items: [{ direction: 'long', style: 'swing', ticker: 'NVDA' }],
    })
    const plan = planHop({ steps: TRADE_STEPS, fromIndex: 1, artifact })
    assert.equal(plan.targetTab, 'scanner')
    assert.equal(plan.delivery.type, 'seed')
    assert.match(plan.delivery.message, /Validate NVDA/)
    assert.match(plan.delivery.message, /horizon: swing/)
    // Argus starts each hand-off on a clean panel.
    assert.equal(plan.remount, true)
})

test('an artifact desk takes the envelope itself, and is never remounted', () => {
    const artifact = makeArtifact({ kind: KIND.CANDIDATE_LIST, items: [{ ticker: 'NVDA' }] })
    const plan = planHop({ steps: TRADE_STEPS, fromIndex: 0, artifact })
    assert.equal(plan.targetTab, 'kairos')
    assert.deepEqual(plan.delivery, { type: 'artifact' })
    // Kairos is holding the bias the request came from — remounting would throw it away.
    assert.equal(plan.remount, false)
})

test('a step overrides the agent default mount', () => {
    const steps = [{ tab: 'scanner', mount: 'continues' }, { tab: 'kairos' }]
    const plan  = planHop({ steps, fromIndex: 1, artifact: makeArtifact({ kind: KIND.SCAN_REQUEST, items: [{ direction: 'long' }] }) })
    assert.equal(plan.remount, false)
})

// ── auto vs manual ─────────────────────────────────────────────────────────────

test('manual never auto-applies; auto does', () => {
    const artifact = makeArtifact({ kind: KIND.CANDIDATE_LIST, items: [{ ticker: 'NVDA' }] })
    assert.equal(planHop({ steps: TRADE_STEPS, fromIndex: 0, artifact }).auto, false)
    assert.equal(planHop({ steps: TRADE_STEPS, fromIndex: 0, artifact, mode: 'auto' }).auto, true)
})

// Arming and order confirmation stay human. A mode toggle must not become the way around them.
test('a gate blocks auto-advance even in auto mode', () => {
    const steps = [{ tab: 'scanner' }, { tab: 'kairos', gate: true }]
    const plan  = planHop({ steps, fromIndex: 0, artifact: makeArtifact({ kind: KIND.CANDIDATE_LIST, items: [{ ticker: 'NVDA' }] }), mode: 'auto' })
    assert.equal(plan.targetTab, 'kairos')   // still routed — the user is taken there
    assert.equal(plan.auto, false)           // but the step is not taken for them
})

// ── what a step produces, and whether anyone is waiting for it ─────────────────
// Against the REAL desks in deskSteps.test.jsx — DESKS lives in a .jsx (its icons are markup) and
// node's runner cannot import that. Here: the shapes, with no desk to depend on.

test('producesOne is a property of the STEP, not of the agent', () => {
    assert.equal(producesOne([{ tab: 'scanner', produces: 'one' }], 'scanner'), true)
    assert.equal(producesOne([{ tab: 'scanner' }], 'scanner'), false)
    assert.equal(producesOne([{ tab: 'kairos', produces: 'one' }], 'scanner'), false)
    assert.equal(producesOne([], 'scanner'), false)
})

test('a trailing background monitor is not somewhere the work goes', () => {
    assert.equal(hasDownstream([{ tab: 'scanner' }, { tab: 'kairos' }, { tab: null }], 0), true)
    assert.equal(hasDownstream([{ tab: 'scanner' }, { tab: 'kairos' }, { tab: null }], 1), false)
    assert.equal(hasDownstream([{ tab: 'scanner' }], 0), false)
    assert.equal(hasDownstream([], 0), false)
})

// ── the declarations themselves ────────────────────────────────────────────────

// Both ends of Atlas. It has no contract until phase 4, so the kinds it would emit (mandate) and
// accept (coverage_set) each have one side missing and their hops still run through MainPage by
// hand. Named rather than skipped, so the day portfolio.contract.js lands this list empties and
// these stop being exceptions.
const KNOWN_DEAD_ENDS = new Set([KIND.COVERAGE_SET])   // emitted, nobody takes it
const KNOWN_UNSOURCED = new Set([KIND.MANDATE])        // accepted, nobody declares emitting it

test('every kind a contract emits is accepted by someone', () => {
    const declared = Object.keys(CONTRACTS)
    const accepted = new Set(declared.flatMap(a => contractFor(a).accepts))
    for (const agent of declared) {
        for (const kind of contractFor(agent).emits) {
            if (KNOWN_DEAD_ENDS.has(kind)) continue
            assert.ok(accepted.has(kind), `${agent} emits ${kind} and nobody takes it`)
        }
    }
})

// The mirror, and the one that catches a typo'd kind: an inbox nothing can ever reach is a desk
// waiting for a delivery that will never come.
test('every kind a contract accepts is emitted by someone', () => {
    const declared = Object.keys(CONTRACTS)
    const emitted  = new Set(declared.flatMap(a => contractFor(a).emits))
    for (const agent of declared) {
        for (const kind of contractFor(agent).accepts) {
            if (KNOWN_UNSOURCED.has(kind)) continue
            assert.ok(emitted.has(kind), `${agent} accepts ${kind} and nobody produces it`)
        }
    }
})

test('a seed desk must actually produce a brief for everything it accepts', () => {
    // One fixture that satisfies every seed desk's reading of an item: a direction for a scan
    // request, a style/sector for a mandate, a ticker for a name hand-off.
    const item = { ticker: 'NVDA', direction: 'long', style: 'swing', sector: 'Technology' }
    for (const agent of Object.keys(CONTRACTS)) {
        const c = contractFor(agent)
        if (c.deliver !== 'seed') continue
        for (const kind of c.accepts) {
            const brief = c.brief(makeArtifact({ kind, items: [item] }))
            assert.ok(brief?.message, `${agent} has no brief for ${kind}`)
        }
    }
})

// A desk that takes the envelope whole must NOT also declare a brief: two ways to open on the same
// hand-off is one of them going stale.
test('an artifact desk does not also carry a brief', () => {
    for (const agent of Object.keys(CONTRACTS)) {
        const c = contractFor(agent)
        if (c.deliver === 'artifact') assert.equal(typeof c.brief, 'undefined', `${agent} declares both`)
    }
})
