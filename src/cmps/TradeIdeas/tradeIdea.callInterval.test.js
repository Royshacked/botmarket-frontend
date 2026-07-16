// Pure-function tests for deriveCallChartInterval in tradeIdea.utils.js — the Kairos call
// pop-out chart shows the timeframe Hermes actually assessed on, with horizon fallbacks.
// The frontend has no test runner wired up, so these run on Node's built-in harness:
//   node --test src/cmps/TradeIdeas/
import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveCallChartInterval } from './tradeIdea.utils.js'

test('prefers the rung Hermes chose (monitor_state.chosen_timeframe)', () => {
    const call = {
        trade_type: 'swing',
        monitor_state: { chosen_timeframe: '1hr', last_assessment: { timeframe_used: '4hr' } },
    }
    assert.equal(deriveCallChartInterval(call), '1hr')
})

test('falls back to the last assessment record when chosen_timeframe is absent', () => {
    const call = {
        trade_type: 'swing',
        monitor_state: { last_assessment: { timeframe_used: '15min' } },
    }
    assert.equal(deriveCallChartInterval(call), '15min')
})

test('falls back to the horizon default until any assessment has run', () => {
    assert.equal(deriveCallChartInterval({ trade_type: 'intraday' }), '5')
    assert.equal(deriveCallChartInterval({ trade_type: 'day' }), '15')
    assert.equal(deriveCallChartInterval({ trade_type: 'swing' }), 'D')
})

test('empty/null chosen_timeframe does not mask a real fallback', () => {
    const call = {
        trade_type: 'intraday',
        monitor_state: { chosen_timeframe: '', last_assessment: { timeframe_used: null } },
    }
    assert.equal(deriveCallChartInterval(call), '5')
})

test('final fallback is 15 for an unknown/missing horizon', () => {
    assert.equal(deriveCallChartInterval({}), '15')
    assert.equal(deriveCallChartInterval(null), '15')
    assert.equal(deriveCallChartInterval({ trade_type: 'position' }), '15')
})
