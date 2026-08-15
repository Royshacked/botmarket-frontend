import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tiers, conditionRows, readiness, watchTimeframe, lastWake, showsWatch } from './talosWatch.js'

// What Talos is doing, derived for the pop-out. Every one of these guards a way of telling the user
// something the monitor never actually said.

const SETUP = {
    status: 'looking',
    timeframe: '1hr',
    armed_zone_id: null,
    conditions: [{ id: 'c1', text: 'regime is risk-on', weight: 'confirming' }],
    scenarios: [
        { id: 's1', conditions: [{ id: 's1c1', text: 'CHoCH up on the 15m', weight: 'primary' }] },
        { id: 's2', conditions: [{ id: 's2c1', text: 'breaks and holds 244', weight: 'primary' }] },
    ],
    monitor_state: { timeline: [], last_assessment: null },
}

const withState = (ms) => ({ ...SETUP, monitor_state: { ...SETUP.monitor_state, ...ms } })
const wake = (reason, price) => ({ at: '2026-08-15T12:00:00Z', reason, price })

// ─── Tier 1: what the monitor SAID, not what the document implies ─────────────

test('zone standing comes from the last wake, never from armed_zone_id', () => {
    // armed_zone_id is the last zone that TRIPPED and nothing clears it when price leaves. Reading
    // it as "price is in a zone" would tell the user their setup is at its entry hours after price
    // walked away — the single most misleading thing this panel could say.
    const left = { ...withState({ timeline: [wake('scheduled', 241.2)] }), armed_zone_id: 'ez1' }
    const gate = tiers(left).find(t => t.key === 'gate')
    assert.equal(gate.active, true)
    assert.match(gate.detail, /outside every zone at 241\.2/)
})

test('a zone trip reads as in-zone', () => {
    const gate = tiers(withState({ timeline: [wake('zone_trip', 238.1)] })).find(t => t.key === 'gate')
    assert.match(gate.detail, /in a zone at 238\.1/)
})

test('a wake that never looked at price makes no claim about zones', () => {
    // A shut market and a not-yet-live setup both wake without a price. Neither is evidence of
    // where price stands, so neither may be rendered as if it were.
    for (const reason of ['market_closed', 'pre_active']) {
        const gate = tiers(withState({ timeline: [wake(reason, null)] })).find(t => t.key === 'gate')
        assert.equal(gate.detail, 'waiting for its first look', reason)
    }
    assert.equal(lastWake(SETUP), null, 'no timeline at all is not a crash')
})

test('the panel steps aside once the setup is past entry', () => {
    // `monitor_state.last_assessment` is written by the READINESS read and never by the in-position
    // one, so leaving this on would show a live position the read that got it IN — timestamped and
    // captioned as though it were current.
    assert.equal(showsWatch('looking'), true)
    assert.equal(showsWatch('waiting'), true, 'un-armed still deserves "nothing is running"')
    for (const past of ['hit', 'long', 'short', 'closed']) {
        assert.equal(showsWatch(past), false, past)
    }
})

test('over-precise prices are tidied through the journal\'s own rounder', () => {
    // A raw tick arrives as 241.20000000000002. The journal already owns this; a second rounder here
    // would drift from it.
    // 2dp above $10, trailing zero and all — the journal's convention, kept rather than improved on,
    // because the two sit inches apart in the same column.
    const messy = withState({ timeline: [wake('scheduled', 241.20000000000002)], pulse_anchor_px: 238.19999999999999 })
    assert.match(tiers(messy).find(t => t.key === 'gate').detail, /at 241\.20$/)
    assert.match(tiers(messy).find(t => t.key === 'pulse').detail, /anchored at 238\.2 /)
})

test('nothing is running on a setup that is not armed', () => {
    const idle = { ...withState({ timeline: [wake('scheduled', 241.2)], pulse_anchor_px: 238.2 }), status: 'waiting' }
    assert.equal(tiers(idle).find(t => t.key === 'gate').active, false)
    assert.equal(tiers(idle).find(t => t.key === 'pulse').active, false)
})

// ─── Tier 2: the anchor ───────────────────────────────────────────────────────

test('the move watch is live only out of zone, and only once anchored', () => {
    const out = withState({ timeline: [wake('scheduled', 241.2)], pulse_anchor_px: 238.2 })
    const p   = tiers(out).find(t => t.key === 'pulse')
    assert.equal(p.active, true)
    assert.match(p.detail, /anchored at 238\.2/)

    const inZone = withState({ timeline: [wake('zone_trip', 238.1)], pulse_anchor_px: 238.2 })
    assert.equal(tiers(inZone).find(t => t.key === 'pulse').active, false, 'in a zone, tier 1 has it')

    const unseeded = withState({ timeline: [wake('scheduled', 241.2)] })
    assert.equal(tiers(unseeded).find(t => t.key === 'pulse').active, false, 'nothing to measure from')
})

// ─── Tier 3: the findings ─────────────────────────────────────────────────────

const assessed = (over = {}) => withState({
    last_assessment: {
        verdict: 'wait', scenario_id: 's1', timeframe_used: '15min', read: 'Semis are diverging.',
        conditions: [{ id: 's1c1', met: 'yes', note: 'CHoCH at 10:42' }, { id: 'c1', met: 'no', note: 'QQQ red' }],
        ...over,
    },
})

test('graded answers are joined to the conditions they answer', () => {
    const rows = conditionRows(assessed())
    assert.deepEqual(rows.map(r => [r.id, r.met, r.weight]), [
        ['c1', 'no', 'confirming'],
        ['s1c1', 'yes', 'primary'],
    ])
    assert.equal(rows[1].text, 'CHoCH up on the 15m', 'the wording lives on the setup, not the assessment')
})

test('rows follow the scenario the read actually judged', () => {
    // Keying off the armed or projected premise instead would print s2's trigger beside s1's answers.
    const rows = conditionRows(assessed({ scenario_id: 's2', conditions: [{ id: 's2c1', met: 'no' }] }))
    assert.deepEqual(rows.map(r => r.id), ['c1', 's2c1'])
})

test('a condition the read never answered shows as unchecked, not as absent', () => {
    // 'unchecked' means it could not look — a reason to go get the data. 'no' means it looked and
    // the thing isn't happening — a reason to wait. Collapsing them hides a broken provider.
    const rows = conditionRows(assessed({ conditions: [] }))
    assert.deepEqual(rows.map(r => r.met), ['unchecked', 'unchecked'])
    assert.deepEqual(conditionRows(SETUP), [], 'no assessment yet → nothing to show')
})

// ─── The derived word ─────────────────────────────────────────────────────────

test('"almost" means every trigger is present and the answer is still no', () => {
    const all = assessed({ conditions: [{ id: 's1c1', met: 'yes' }, { id: 'c1', met: 'no' }] })
    assert.equal(readiness(all), 'almost')
})

test('"almost" is never claimed while a trigger is missing or unchecked', () => {
    for (const met of ['no', 'unchecked']) {
        assert.equal(readiness(assessed({ conditions: [{ id: 's1c1', met }] })), null, met)
    }
})

test('a setup with no primary trigger can never be "almost"', () => {
    // There would be nothing for the claim to rest on.
    const noTrigger = { ...assessed(), scenarios: [{ id: 's1', conditions: [{ id: 's1c1', text: 'x', weight: 'confirming' }] }] }
    assert.equal(readiness(noTrigger), null)
})

test('a real verdict is left to speak for itself', () => {
    assert.equal(readiness(assessed({ verdict: 'enter' })), 'ready')
    for (const verdict of ['stand_aside', 'edit', 'let_expire']) {
        assert.equal(readiness(assessed({ verdict })), null, verdict)
    }
    assert.equal(readiness(SETUP), null, 'nothing read yet')
})

// ─── The chart follows the monitor ────────────────────────────────────────────

test('the chart shows the rung Talos chose, falling back to the authored one', () => {
    assert.equal(watchTimeframe(withState({ timeframe: '4hr' })), '4hr')
    assert.equal(watchTimeframe(SETUP), '1hr', 'nothing chosen yet → what it was drawn on')
    assert.equal(watchTimeframe({}), 'day', 'and never undefined — the chart needs an interval')
})
