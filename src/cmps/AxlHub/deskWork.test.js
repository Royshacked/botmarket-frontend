import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deskAgents, deskWork, deskOfThread, blockedDesks } from './deskWork.js'

// Two questions off two fields: the MARKER says which ONE desk the user left (`pipeline`), the LOCK
// says which desks need an agent that is busy elsewhere (`agent`). Keying the marker off `agent` too
// is what lit up three desks for one parked conversation.

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
// Enters at Argus and hands on to Mentor — it shares BOTH its agents with another desk, which is what
// makes it the case that broke.
const TRADE = { key: 'trade', entryTab: 'scanner', steps: [
    { tab: 'scanner', label: 'Scan' },
    { tab: 'mentor',  label: 'Build trade' },
    { tab: null,      label: 'Arm & monitor' },
] }

test('a desk covers every agent in its steps, without duplicates', () => {
    assert.deepEqual(deskAgents(PORTFOLIO), ['portfolio', 'scanner', 'analyst'])
})

test('a step with no chat behind it is not an agent', () => {
    assert.deepEqual(deskAgents(ASSIST), ['mentor'])
})

const ALL = [PORTFOLIO, SCAN, ASSIST, TRADE]

test('the marker goes on the ONE desk the thread was left at', () => {
    // Argus is a step of three desks. The user left the TRADE desk; the other two are somewhere they
    // have never been, and a dot there is a lie about their own work.
    const threads = [{ agent: 'scanner', pipeline: 'trade', yourTurn: false }]
    assert.equal(deskWork(threads, TRADE, ALL).count, 1)
    assert.equal(deskWork(threads, PORTFOLIO, ALL).count, 0, 'shares Argus — but the user was never here')
    assert.equal(deskWork(threads, SCAN, ALL).count, 0)
})

test('walking a desk leaves a marker on that desk only, once per conversation', () => {
    // The reported case: entered the trade desk, passed Argus, left at Mentor. Two threads, one desk.
    const threads = [
        { agent: 'mentor',  pipeline: 'trade', yourTurn: true },
        { agent: 'scanner', pipeline: 'trade', yourTurn: false },
    ]
    assert.equal(deskWork(threads, TRADE, ALL).count, 2)
    assert.equal(deskWork(threads, ASSIST, ALL).count, 0, 'Mentor is busy, but not with the assist desk')
    assert.equal(deskWork(threads, SCAN, ALL).count, 0)
})

test('a chat opened off any chain belongs to the desk that IS that agent', () => {
    // No pipeline — a tab clicked directly. Argus enters the trade desk AND the scan desk; a standalone
    // Argus chat is the scan desk, because the trade desk is a chain the user never started.
    const loose = { agent: 'scanner', yourTurn: true }
    assert.equal(deskOfThread(loose, ALL), 'scan')
    assert.equal(deskWork([loose], SCAN, ALL).count, 1)
    assert.equal(deskWork([loose], TRADE, ALL).count, 0)
    assert.equal(deskOfThread({ agent: 'mentor' }, ALL), 'assist')
})

test('a thread naming a desk that no longer exists marks nothing, rather than the wrong desk', () => {
    assert.equal(deskWork([{ agent: 'scanner', pipeline: 'retired' }], SCAN, ALL).count, 0)
})

test('your turn is reported apart from the count, because it outranks it', () => {
    // Two running and one awaiting an answer is "your turn" — that is the only one the user can act on.
    const threads = [
        { agent: 'portfolio', pipeline: 'portfolio', yourTurn: false },
        { agent: 'analyst',   pipeline: 'portfolio', yourTurn: true },
    ]
    const work = deskWork(threads, PORTFOLIO, ALL)
    assert.equal(work.count, 2)
    assert.equal(work.yourTurn, true)
})

test('a desk with nothing outstanding renders nothing', () => {
    assert.deepEqual(deskWork([{ agent: 'strategy', pipeline: 'strategy' }], PORTFOLIO, ALL), { count: 0, yourTurn: false, threads: [] })
    assert.equal(deskWork(null, PORTFOLIO, ALL).count, 0)
    assert.equal(deskWork([{ agent: 'scanner' }], null, ALL).count, 0)
    assert.equal(deskOfThread(null, ALL), null)
    assert.equal(deskOfThread({ agent: 'nobody' }, ALL), null)
})

test('yourTurn must be a real boolean, not merely present', () => {
    assert.equal(deskWork([{ agent: 'scanner', pipeline: 'scan', yourTurn: 'yes' }], SCAN, ALL).yourTurn, false)
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

// Axl's own conversation is a draft thread in the same store, so it now appears in the very list
// these two functions read. It must be invisible to both: reception is not a desk, and the hub would
// otherwise badge a route the user never visited and close the doors to an agent nobody is holding.
// `pipeline: null` is what carries that — asserted here rather than left to the save site.
test('the reception thread badges no desk and locks no door', () => {
    const axl = { agent: 'axl', pipeline: null, threadId: 'thr_axl_9', yourTurn: true }
    for (const desk of DESKS) assert.equal(deskWork([axl], desk, DESKS).count, 0, desk.key)
    assert.equal(deskOfThread(axl, DESKS), null)
    assert.equal(blockedDesks([axl], DESKS).size, 0)
})
