import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toolStatusLabel } from './toolStatusLabels.js'

// The tool status line (2026-10-19): what the desk is doing, and — once the call runs — which names.

test('a tool is named by what it does; an unknown one is "Working…"', () => {
    assert.equal(toolStatusLabel('screen_candidates'), 'Screening the market…')
    assert.equal(toolStatusLabel('check_broker_symbol'), 'Checking it trades at your broker…')
    assert.equal(toolStatusLabel('no_such_tool'), 'Working…')
})

test('the names it runs on ride the line: up to three, then a count', () => {
    assert.equal(toolStatusLabel('get_candles', ['SCCO']), 'Reading price action · SCCO…')
    assert.equal(toolStatusLabel('get_quotes', ['FCX', 'SCCO', 'MSI', 'PG', 'EOG']), 'Fetching live prices · FCX, SCCO, MSI +2…')
    assert.equal(toolStatusLabel('get_candles', []), 'Reading price action…')
    assert.equal(toolStatusLabel('get_candles', null), 'Reading price action…')
    assert.equal(toolStatusLabel('no_such_tool', ['NVDA']), 'Working · NVDA…')
})

test('every tool Argus calls has a label of its own', () => {
    const argus = ['web_search', 'get_trading_context', 'check_broker_symbol', 'screen_candidates', 'get_market_movers', 'get_sector_snapshot',
        'get_analyst_actions', 'get_price_action', 'get_quotes', 'get_risk_metrics', 'get_candles', 'get_indicators', 'get_chart',
        'get_orderblocks', 'get_false_breaks', 'get_fundamentals', 'get_earnings', 'get_earnings_calendar', 'get_sec_filings',
        'get_cycle_analysis', 'get_short_interest', 'get_options_context', 'get_derivatives_context', 'get_market_hours',
        'get_house_industries', 'consult']
    for (const t of argus) assert.notEqual(toolStatusLabel(t), 'Working…', t)
})
