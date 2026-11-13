import { test } from 'node:test'
import assert from 'node:assert/strict'
import { infoFlow, FLOWS } from './infoFlow.js'

// Info as a diagram (backend one-axl.md §6): which flow, and the step the user is on — read off state, never guessed.

const mentor = (settled = {}, asset = 'NVDA') => ({ draft: { asset, build: { active: asset, names: [{ asset, settled }] } } })

test('the Hotlist: the horizon is always picked — picking a name, then building the trade, then one press from armed', () => {
    assert.deepEqual(infoFlow({ hotlistOpen: true }), { key: 'hotlist', ...FLOWS.hotlist, current: 1 })
    assert.equal(infoFlow({ hotlistOpen: true, agentState: { mentor: mentor({ direction: 'long' }) } }).current, 2)
    assert.equal(infoFlow({ hotlistOpen: true, agentState: { mentor: mentor({ direction: 1, horizon: 1, entries: 1, size: 1 }) } }).current, 3)
})

test('a trade build: the first step the trader has not settled', () => {
    const step = (s) => infoFlow({ floor: 'mentor', agentState: { mentor: mentor(s) } }).current
    assert.equal(infoFlow({ floor: 'mentor' }).current, 0, 'no name yet')
    assert.equal(step({}), 0)
    assert.equal(step({ direction: 'long' }), 1)
    assert.equal(step({ direction: 'long', horizon: 'swing' }), 2)
    assert.equal(step({ direction: 'long', horizon: 'swing', entries: true }), 3)
    assert.equal(step({ direction: 'long', horizon: 'swing', entries: true, size: { unit: 'risk_pct', value: 1 } }), 4)
    assert.deepEqual(FLOWS.trade.steps, ['Direction', 'Horizon', 'Levels', 'Size', 'Confirm & arm'])
})

test('a portfolio, a coverage, a technical read — each from its own role\'s state', () => {
    const p = (s) => infoFlow({ floor: 'portfolio', agentState: { portfolio: s } }).current
    assert.deepEqual([p({}), p({ mandate: {} }), p({ mandate: {}, pendingPlan: {} }), p({ reviewMode: true })], [0, 1, 3, 4])
    const a = (s) => infoFlow({ floor: 'analyst', agentState: { analyst: s } }).current
    assert.deepEqual([a({}), a({ active_symbol: 'MSFT' }), a({ active_symbol: 'MSFT', standing: true })], [0, 1, 2])
    assert.equal(infoFlow({ floor: 'proteus' }).current, 0)
    assert.equal(infoFlow({ floor: 'proteus', rows: [{ agent: 'proteus', role: 'assistant' }] }).current, 2)
})

test('nothing placeable → null (Axl, a role with no flow)', () => {
    assert.equal(infoFlow({ floor: 'axl' }), null)
    assert.equal(infoFlow({}), null)
    assert.equal(infoFlow({ floor: 'scanner' }), null)
})
