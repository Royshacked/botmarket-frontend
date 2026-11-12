import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    liveReadiness, ACCOUNT_GAP,
    handoffTurn, batchNames, mentorHolding,
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

// ─── Argus's hand-off ─────────────────────────────────────────────────────────

test('a handed-over name opens as a name to WORK ON, with no lens — Mentor opens it risk-based', () => {
    const t = handoffTurn({ ticker: 'nvda', direction: 'long', thesis: 'Capex runs longer.', recommended_mode: 'trend' })
    assert.equal(t.text, 'I want to work on a NVDA trade — the read on it is: Capex runs longer. Let\'s build the setup together.')
    assert.deepEqual(t.seed, { ticker: 'NVDA', direction: 'long', thesis: 'Capex runs longer.', analysis: null })
    assert.doesNotMatch(t.text, /my own/)
    assert.equal(handoffTurn({ ticker: 'AMD' }).text, 'I want to work on a AMD trade. Let\'s build the setup together.')
    assert.equal(handoffTurn({}), null)
    assert.equal(handoffTurn(null), null)
})

test('the names in a build count the one being worked on once', () => {
    assert.deepEqual(batchNames({ asset: 'NVDA' }, { NVDA: {}, AMD: {} }).sort(), ['AMD', 'NVDA'])
    assert.deepEqual(batchNames(null, {}), [])
})

test('what a fresh plan would put aside: any work on the table counts, not only a draft (8b CR)', () => {
    assert.equal(mentorHolding(null), null)
    assert.equal(mentorHolding({ draft: null, drafts: {} }), null)
    assert.equal(mentorHolding({ draft: null, generated: { id: 's1', asset: 'NVDA' } }), 'NVDA (saved, waiting on Arm)')
    assert.equal(mentorHolding({ draft: { asset: 'AMD' } }), 'AMD')
    assert.equal(mentorHolding({ draft: null, editing: { kind: 'setup', entityId: 's1' } }), 'an edit of a saved setup')
    assert.equal(mentorHolding({ draft: null, drafts: { TSLA: {}, AAPL: {} } }), 'TSLA, AAPL')
})
