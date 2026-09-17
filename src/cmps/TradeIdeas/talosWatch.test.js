import { test } from 'node:test'
import assert from 'node:assert/strict'
import { watchTimeframe, showsWatch } from './talosWatch.js'

// The two facts the setup pop-out reads off Talos's state.

test('the chart shows the rung Talos is on, falling back to the authored one', () => {
    assert.equal(watchTimeframe({ timeframe: '1hr', monitor_state: { timeframe: '4hr' } }), '4hr')
    assert.equal(watchTimeframe({ timeframe: '1hr', monitor_state: {} }), '1hr')
    assert.equal(watchTimeframe({}), 'day')
})

test('the stale-map ask is pre-entry only', () => {
    assert.equal(showsWatch('looking'), true)
    assert.equal(showsWatch('waiting'), true)
    assert.equal(showsWatch('long'), false)
    assert.equal(showsWatch('closed'), false)
})
