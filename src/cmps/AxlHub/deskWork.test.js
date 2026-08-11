import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deskAgents, deskWork, blockedDesks } from './deskWork.js'

// The badge on a desk route. A desk claims every agent in its STEPS, not just the one it enters at —
// which is the whole reason the badge belongs to the desk: leave a portfolio build parked at Argus and
// what is unfinished is the BUILD. "Create a list" is not where the user left off, even though Argus
// is where the conversation sits.

const PORTFOLIO = { key: 'portfolio', entryTab: 'portfolio', steps: [
    { tab: 'portfolio', label: 'Mandate' },
    { tab: 'scanner',   label: 'Screen' },
    { tab: 'analyst',   label: 'Research' },
    { tab: 'portfolio', label: 'Allocate' },
] }
const SCAN = { key: 'scan', entryTab: 'scanner', steps: [{ tab: 'scanner', label: 'Scan' }] }
const ASSIST = { key: 'assist', entryTab: 'mentor', steps: [
    { tab: 'mentor', label: 'Build setup' },
    { tab: null,     label: 'Arm & monitor' },   // a real step with no chat behind it
] }

test('a desk covers every agent in its steps, without duplicates', () => {
    assert.deepEqual(deskAgents(PORTFOLIO), ['portfolio', 'scanner', 'analyst'])
})

test('a step with no chat behind it is not an agent', () => {
    assert.deepEqual(deskAgents(ASSIST), ['mentor'])
})

test('an unfinished thread badges the desk whose step it sits on', () => {
    const threads = [{ agent: 'scanner', yourTurn: false }]
    assert.equal(deskWork(threads, PORTFOLIO).count, 1, 'a build parked at Argus is unfinished WORK')
    assert.equal(deskWork(threads, SCAN).count, 1, 'and the scan desk shares that agent')
})

test('your turn is reported apart from the count, because it outranks it', () => {
    // Two running and one awaiting an answer is "your turn" — that is the only one the user can act on.
    const threads = [
        { agent: 'portfolio', yourTurn: false },
        { agent: 'analyst',   yourTurn: true },
    ]
    const work = deskWork(threads, PORTFOLIO)
    assert.equal(work.count, 2)
    assert.equal(work.yourTurn, true)
})

test('a desk with nothing outstanding renders nothing', () => {
    assert.deepEqual(deskWork([{ agent: 'strategy', yourTurn: true }], PORTFOLIO), { count: 0, yourTurn: false, threads: [] })
    assert.equal(deskWork(null, PORTFOLIO).count, 0)
    assert.equal(deskWork([{ agent: 'scanner' }], null).count, 0)
})

test('yourTurn must be a real boolean, not merely present', () => {
    assert.equal(deskWork([{ agent: 'scanner', yourTurn: 'yes' }], SCAN).yourTurn, false)
})

// ─── The lock: a desk panel is a singleton, so one agent, one context ────────────

const DESKS = [PORTFOLIO, SCAN, ASSIST]

test('a build parked at Argus closes the standalone scan door', () => {
    // Both desks need Argus; the build is holding it. Entering the scan desk would clobber the run.
    const threads = [{ agent: 'scanner', pipeline: 'portfolio', yourTurn: true }]
    const blocked = blockedDesks(threads, DESKS)
    assert.equal(blocked.has('scan'), true)
    assert.equal(blocked.get('scan').agent, 'scanner')
    assert.equal(blocked.has('portfolio'), false, 'the desk that owns it is not blocked BY it')
})

test('symmetric — a standalone scan closes the portfolio desk', () => {
    // Whoever got there first holds it. Any precedence rule would surprise whoever lost.
    const blocked = blockedDesks([{ agent: 'scanner', pipeline: 'scan' }], DESKS)
    assert.equal(blocked.has('portfolio'), true)
    assert.equal(blocked.has('scan'), false)
})

test('a chat opened off any chain blocks nothing', () => {
    // No run to protect, and resuming it is what opening that desk already does.
    assert.equal(blockedDesks([{ agent: 'scanner', pipeline: null }], DESKS).size, 0)
})

test('a desk sharing no agent with the holder stays open', () => {
    assert.equal(blockedDesks([{ agent: 'scanner', pipeline: 'portfolio' }], DESKS).has('assist'), false)
})

test('nothing unfinished blocks nothing', () => {
    assert.equal(blockedDesks([], DESKS).size, 0)
    assert.equal(blockedDesks(null, DESKS).size, 0)
    assert.equal(blockedDesks([{ agent: 'scanner', pipeline: 'portfolio' }], null).size, 0)
})
