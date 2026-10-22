import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { bringToFront, topChannel, setVisible, stageState, _resetStage } from './stage.store.js'

// The stage's order (docs/design/floor-stage.md): whatever opened last is on top; closing it shows what was under it.

beforeEach(() => _resetStage())

test('a channel that opens something comes to the front; the rest keep their order', () => {
    assert.deepEqual(stageState().order, ['panel', 'surface', 'chart'])
    bringToFront('panel')
    assert.deepEqual(stageState().order, ['surface', 'chart', 'panel'])
    bringToFront('surface')
    assert.deepEqual(stageState().order, ['chart', 'panel', 'surface'])
    bringToFront('nonsense')
    assert.deepEqual(stageState().order, ['chart', 'panel', 'surface'], 'an unknown channel changes nothing')
})

test('the top is the most recent channel that holds something — closing one shows the one under it', () => {
    const order = ['panel', 'surface', 'chart']   // list, then Mentor, then a chart
    assert.equal(topChannel(order, { panel: true, surface: true, chart: true }), 'chart')
    assert.equal(topChannel(order, { panel: true, surface: true, chart: false }), 'surface', 'chart closed → Mentor')
    assert.equal(topChannel(order, { panel: true, surface: false, chart: false }), 'panel', 'Mentor closed → the list')
    assert.equal(topChannel(order, { panel: false, surface: false, chart: false }), null)
})

test('the stage reports what it shows; nothing changes when it is the same', () => {
    setVisible('panel')
    assert.equal(stageState().visible, 'panel')
    const before = stageState()
    setVisible('panel')
    assert.equal(stageState(), before)
    setVisible(null)
    assert.equal(stageState().visible, null)
})
