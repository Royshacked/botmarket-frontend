import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    liveReadiness, ACCOUNT_GAP, candidatePress, stagePress, spansPress, entriesPress, delegatePress, revivePress,
    handoffTurn, batchNames,
} from './mentorSurface.utils.js'

// The rules Mentor's surface draws by (phase 8b) — moved from MentorPanel with its suite's assertions.

// ─── the Generate verdict ─────────────────────────────────────────────────────

test('no verdict yet is never ready, whatever the account', () => {
    assert.equal(liveReadiness(null, 1).ready, false)
    assert.deepEqual(liveReadiness(null, 0).blockers, [{ kind: 'missing', text: ACCOUNT_GAP }])
})

test('the account gap is listed once, not once per side that noticed it', () => {
    const r = liveReadiness({ ready: false, missing: [ACCOUNT_GAP, 'size'] }, 0)
    assert.deepEqual(r.blockers.map(b => b.text), ['size', ACCOUNT_GAP])
})

test('marking an account lights Generate when the account was ALL it lacked — and only then', () => {
    assert.equal(liveReadiness({ ready: false, missing: [ACCOUNT_GAP] }, 1).ready, true)
    assert.equal(liveReadiness({ ready: false, missing: [ACCOUNT_GAP, 'size'] }, 1).ready, false, 'the account clears only itself')
    assert.equal(liveReadiness({ ready: true, missing: [] }, 0).ready, false, 'unmarking it goes dark again')
})

test('a CONTRADICTION is a refusal too — a complete-but-incoherent plan still refuses, and says why', () => {
    const r = liveReadiness({ ready: false, missing: [], problems: ['validity floor below its own stop'] }, 1)
    assert.equal(r.ready, false)
    assert.deepEqual(r.blockers, [{ kind: 'problem', text: 'validity floor below its own stop' }])
    assert.deepEqual(liveReadiness({ ready: false, missing: [ACCOUNT_GAP], problems: ['x'] }, 0).blockers.map(b => b.kind), ['missing', 'problem'])
})

test('warnings are never blockers', () => {
    const r = liveReadiness({ ready: true, missing: [], warnings: ['no rejected alternatives'] }, 1)
    assert.equal(r.ready, true)
    assert.deepEqual(r.warnings, ['no rejected alternatives'])
})

// ─── what a press says and settles ────────────────────────────────────────────

test('picking a candidate settles the opening — only what it carries — and says so in words', () => {
    assert.deepEqual(candidatePress({ label: 'Pullback long', setup: { direction: 'long', type: 'swing', trade_mode: 'trend' } }), {
        ops:  [{ claim: { direction: 'long', horizon: 'swing', lens: 'trend' }, settle: ['direction', 'horizon', 'lens'] }],
        text: 'Let\'s go with "Pullback long".',
    })
    assert.deepEqual(candidatePress({ label: 'X', setup: { direction: 'short' } }).ops[0].settle, ['direction'])
    assert.deepEqual(candidatePress({ label: 'X', setup: {} }).ops, [])
})

test('the stage card settles its fields — the waiver rides on the same press', () => {
    assert.deepEqual(stagePress(['direction', 'horizon']), { ops: [{ settle: ['direction', 'horizon'] }], text: 'Yes, those are right.' })
    assert.deepEqual(stagePress(['direction'], true).ops, [{ settle: ['direction'], waiver: true }])
})

test('the spans and entries gates carry EVERY choice ticked; nothing ticked is no press', () => {
    assert.deepEqual(spansPress([{ id: 's1', label: 'A', from: '1', to: '2' }, { id: 's2', label: 'B' }]).ops, [{ claim: { spans: ['s1', 's2'] }, settle: ['spans'] }])
    assert.equal(spansPress([{ id: 's1', label: 'A', from: 'Mon', to: 'Fri' }]).text, 'Let\'s build "A" — Mon to Fri.')
    assert.equal(spansPress([]), null)
    const e = entriesPress([{ trade: 't1', option: { id: 'o1', label: 'Reclaim', trigger: 'a 15m close over 240' } }])
    assert.deepEqual(e.ops, [{ claim: { entries: ['t1:o1'] }, settle: ['entries'] }])
    assert.equal(e.text, 'Take "Reclaim" — a 15m close over 240.')
    assert.equal(entriesPress(null), null)
})

test('"You choose" hands back THAT gate, as an op, and still says it in words', () => {
    assert.deepEqual(delegatePress('spans').ops, [{ delegate: 'spans' }])
    assert.deepEqual(delegatePress('entries').ops, [{ delegate: 'entries' }])
    assert.match(delegatePress('entries').text, /pick the way in/)
    assert.deepEqual(revivePress({ label: 'Breakout' }), { ops: [], text: 'Take another look at "Breakout" — I\'d like that one on the table.' })
})

// ─── Argus's hand-off ─────────────────────────────────────────────────────────

test('a handed-over name opens as a name to WORK ON, its lens carried as data', () => {
    const t = handoffTurn({ ticker: 'nvda', direction: 'long', thesis: 'Capex runs longer.', recommended_mode: 'trend' })
    assert.equal(t.text, 'I want to work on a NVDA trade — the read on it is: Capex runs longer. Let\'s build the setup together.')
    assert.deepEqual(t.seed, { ticker: 'NVDA', direction: 'long', thesis: 'Capex runs longer.', analysis: null, recommended_mode: 'trend' })
    assert.doesNotMatch(t.text, /my own/)
    assert.equal(handoffTurn({ ticker: 'AMD' }).text, 'I want to work on a AMD trade. Let\'s build the setup together.')
    assert.equal(handoffTurn({}), null)
    assert.equal(handoffTurn(null), null)
})

test('the names in a build count the one being worked on once', () => {
    assert.deepEqual(batchNames({ asset: 'NVDA' }, { NVDA: {}, AMD: {} }).sort(), ['AMD', 'NVDA'])
    assert.deepEqual(batchNames(null, {}), [])
})
