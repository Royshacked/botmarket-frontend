import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveIdeaOverlay, deriveCallOverlay, deriveSetupOverlay, textToIndicators, parseConditionPrice } from './chartOverlay.js'

// ── textToIndicators (FE mirror of backend _buildStudies + studiesToIndicators) ──
test('textToIndicators: EMA/SMA overlays, RSI/MACD/ATR panes, VWAP overlay', () => {
    assert.deepEqual(textToIndicators('ema(20)'),  [{ name: 'EMA', calcParams: [20], overlay: true }])
    assert.deepEqual(textToIndicators('sma 50'),   [{ name: 'MA',  calcParams: [50], overlay: true }])
    assert.deepEqual(textToIndicators('rsi(14)'),  [{ name: 'RSI', calcParams: [14], overlay: false }])
    assert.deepEqual(textToIndicators('vwap'),     [{ name: 'VWAP', calcParams: [], overlay: true }])
})

test('textToIndicators: bare RSI/ATR mention → default period; EMA/SMA still need a period', () => {
    assert.deepEqual(textToIndicators('RSI divergence'), [{ name: 'RSI', calcParams: [14], overlay: false }])
    assert.deepEqual(textToIndicators('atr'),            [{ name: 'ATR', calcParams: [14], overlay: false }])
    assert.deepEqual(textToIndicators('ema cross'),      [])   // no period → which MA? skip
    // a call naming VWAP + RSI shows both (genuine references, word-bounded)
    assert.deepEqual(textToIndicators('VWAP reclaim ; RSI momentum ; bull flag'),
        [{ name: 'VWAP', calcParams: [], overlay: true }, { name: 'RSI', calcParams: [14], overlay: false }])
})

test('textToIndicators: word-bounded — incidental substrings do NOT match', () => {
    assert.deepEqual(textToIndicators('parsing the theatrics'), [])  // "rsi" in parsing, "atr" in theatrics
    assert.deepEqual(textToIndicators('cinema 20 tickets'), [])      // "ema" inside "cinema"
})

test('textToIndicators: volume excluded, capped at 3', () => {
    assert.equal(textToIndicators('volume').length, 0)  // chart always shows a volume pane
    assert.equal(textToIndicators('ema(9), ema(20), ema(50), rsi(14)').length, 3)  // MAX_INDICATORS
})

test('textToIndicators: empty / junk → []', () => {
    assert.deepEqual(textToIndicators(''), [])
    assert.deepEqual(textToIndicators(null), [])
    assert.deepEqual(textToIndicators('price breaks resistance'), [])
})

// ── parseConditionPrice (conservative leaf → price) ──
test('parseConditionPrice: extracts a plain price after a comparator/keyword', () => {
    assert.equal(parseConditionPrice('price touches 245.20'), 245.20)
    assert.equal(parseConditionPrice('close below 240.5'), 240.5)
    assert.equal(parseConditionPrice('price >= 101'), 101)
    assert.equal(parseConditionPrice('breaks above 1,250.75'), 1250.75)
})

test('parseConditionPrice: null for indicator / timeframe leaves (no wrong lines)', () => {
    assert.equal(parseConditionPrice('rsi crosses 30'), null)          // indicator threshold, not a price
    assert.equal(parseConditionPrice('close below 20-day ma'), null)   // period/indicator
    assert.equal(parseConditionPrice('on the 15min close'), null)
    assert.equal(parseConditionPrice('momentum fades'), null)          // no number
    assert.equal(parseConditionPrice(''), null)
})

// ── deriveCallOverlay ─────────────────────────────────────────────────────────
test('call pre-proposal → entry_zones + reference_levels', () => {
    const call = {
        status: 'waiting', bias: 'long',
        entry_zones: [{ lower: 100, upper: 102, side: 'long' }],
        reference_levels: [{ kind: 'support', price: 98 }],
        patterns: [{ name: 'VWAP reclaim', look_for: 'hold above vwap' }],
    }
    const { levels, indicators } = deriveCallOverlay(call)
    assert.deepEqual(levels.map(l => [l.kind, l.price]), [['zone', 100], ['zone', 102], ['ref', 98]])
    assert.deepEqual(indicators, [{ name: 'VWAP', calcParams: [], overlay: true }])
})

test('call awaiting confirm → proposal entry/stop/tp', () => {
    const call = {
        status: 'hit', bias: 'long',
        monitor_state: { last_assessment: { proposal: { entry: 101, stop: 98, take_profit: [{ price: 106 }, { price: 110 }] } } },
    }
    const { levels } = deriveCallOverlay(call)
    assert.deepEqual(levels.map(l => [l.kind, l.price, l.label]),
        [['entry', 101, 'Entry'], ['stop', 98, 'Stop'], ['tp', 106, 'TP1'], ['tp', 110, 'TP2']])
})

test('a LIVE call → position fill/stop/targets, closed adds exit', () => {
    const base = {
        position_state: {
            entry: { fill_price: 101.5, intended: 101, direction: 'long' },
            stop: { current: 99 },
            targets: [{ price: 106, hit_at: 123 }, { price: 110 }],
        },
    }
    // Live is 'long'/'short' — the shared ladder. Gating this on the retired 'in_position'
    // literal is what kept a live call's own levels off its chart.
    const inPos = deriveCallOverlay({ ...base, status: 'long' })
    assert.deepEqual(inPos.levels.map(l => [l.kind, l.price, l.label]),
        [['entry', 101.5, 'Entry'], ['stop', 99, 'Stop'], ['tp', 106, 'TP1 ✓'], ['tp', 110, 'TP2']])

    const closed = deriveCallOverlay({ ...base, status: 'closed', position_state: { ...base.position_state, outcome: { exit_price: 107 } } })
    assert.ok(closed.levels.some(l => l.kind === 'exit' && l.price === 107))
})

// ── deriveIdeaOverlay ─────────────────────────────────────────────────────────
test('idea NOT in position → planned entry/stop/tp parsed from clean price conditions + invalidation', () => {
    const idea = {
        direction: 'long',
        invalidation: { low: 95 },
        entry_condition_tree: { operator: 'AND', children: [{ condition: 'price touches 100.50', type: 'touch' }] },
        stop_condition_tree:  { operator: 'OR',  children: [{ condition: 'close below 96.00', type: 'structured' }] },
        tp_condition_tree:    { operator: 'OR',  children: [{ condition: 'price reaches 108.00', type: 'touch' }, { condition: 'price reaches 114.00', type: 'touch' }] },
    }
    const { levels } = deriveIdeaOverlay(idea, [])
    assert.deepEqual(levels.filter(l => l.kind === 'entry').map(l => l.price), [100.5])
    assert.deepEqual(levels.filter(l => l.kind === 'stop').map(l => l.price),  [96])
    assert.deepEqual(levels.filter(l => l.kind === 'tp').map(l => [l.price, l.label]), [[108, 'TP1'], [114, 'TP2']])
    assert.ok(levels.some(l => l.kind === 'invalidation' && l.price === 95))
})

test('idea with indicator-only conditions → those levels skipped (no wrong lines), only invalidation', () => {
    const idea = {
        direction: 'long',
        invalidation: { high: 108 },
        stop_condition_tree: { operator: 'OR', children: [{ condition: 'rsi(14) drops below 30', type: 'structured' }] },
    }
    const { levels, indicators } = deriveIdeaOverlay(idea, [])
    assert.deepEqual(levels.map(l => l.kind), ['invalidation'])   // 30 is an RSI threshold, NOT a stop
    assert.deepEqual(indicators, [{ name: 'RSI', calcParams: [14], overlay: false }])
})

test('idea IN position WITHOUT nativeProtection → stop/tp parsed from conditions', () => {
    const idea = {
        direction: 'long',
        stop_condition_tree: { operator: 'OR', children: [{ condition: 'close below 96.00', type: 'structured' }] },
        tp_condition_tree:   { operator: 'OR', children: [{ condition: 'price reaches 114.00', type: 'touch' }] },
    }
    const positions = [{ entryPrice: 100, volume: 1 }]
    const { levels } = deriveIdeaOverlay(idea, positions)
    const byKind = Object.fromEntries(levels.map(l => [l.kind, l.price]))
    assert.equal(byKind.entry, 100)   // from the live fill
    assert.equal(byKind.stop, 96)     // parsed (nativeProtection null)
    assert.equal(byKind.tp, 114)      // parsed
})

test('idea IN position → entry (weighted avg), stop/tp (nativeProtection) + invalidation', () => {
    const idea = {
        direction: 'long',
        nativeProtection: { stop: 97, tp: 112 },
        invalidation: { low: 95 },
        entry_condition_tree: { operator: 'AND', children: [{ condition: 'ema(20) reclaim', type: 'indicator' }] },
    }
    const positions = [
        { entryPrice: 100, volume: 2 },
        { entryPrice: 106, volume: 1 },   // weighted avg = (200+106)/3 = 102
    ]
    const { levels, indicators } = deriveIdeaOverlay(idea, positions)
    const byKind = Object.fromEntries(levels.map(l => [l.kind, l.price]))
    assert.equal(byKind.entry, 102)
    assert.equal(byKind.stop, 97)
    assert.equal(byKind.tp, 112)
    assert.ok(levels.some(l => l.kind === 'invalidation' && l.price === 95))
    assert.deepEqual(indicators, [{ name: 'EMA', calcParams: [20], overlay: true }])
})

test('null / empty inputs → empty spec (no throw)', () => {
    assert.deepEqual(deriveIdeaOverlay(null), { levels: [], indicators: [] })
    assert.deepEqual(deriveCallOverlay(null), { levels: [], indicators: [] })
    assert.deepEqual(deriveIdeaOverlay({}, []), { levels: [], indicators: [] })
})

// ── deriveSetupOverlay ────────────────────────────────────────────────────────
// A setup's plan is authored as ZONES, so BOTH edges of each are real levels. The numbers are
// already clean (setup.schema normalizeZones), so unlike an idea nothing here is parsed from text.

const setup = () => ({
    direction: 'long',
    entry_zones: [{ lower: 100, upper: 102 }],
    stop_zones:  [{ lower: 95,  upper: 96 }],
    tp_zones:    [{ lower: 110, upper: 112 }, { lower: 120, upper: 122 }],
    validity:    { lower: 90, upper: 130 },
})

test('setup: both edges of every zone become levels', () => {
    const { levels } = deriveSetupOverlay(setup())
    const at = kind => levels.filter(l => l.kind === kind).map(l => l.price).sort((a, b) => a - b)
    assert.deepEqual(at('entry'), [100, 102])
    assert.deepEqual(at('stop'),  [95, 96])
    assert.deepEqual(at('tp'),    [110, 112, 120, 122])
    assert.deepEqual(at('invalidation'), [90, 130])
})

test('setup: multiple targets are numbered, a single one is not', () => {
    const multi = deriveSetupOverlay(setup()).levels.filter(l => l.kind === 'tp')
    assert.ok(multi.some(l => l.label === 'TP1') && multi.some(l => l.label === 'TP2'))

    const one = deriveSetupOverlay({ ...setup(), tp_zones: [{ lower: 110, upper: 112 }] }).levels
    assert.ok(one.filter(l => l.kind === 'tp').every(l => l.label === 'TP'))
})

test('setup: a half-open zone contributes the edge it has, never a level at zero', () => {
    // Number(null) is 0, so a permissive coercion here drew a "stop" at the bottom of the chart.
    // normalizeZone back-fills both edges server-side, but the FE must not depend on that.
    const { levels } = deriveSetupOverlay({ direction: 'long', stop_zones: [{ lower: 95, upper: null }] })
    assert.deepEqual(levels.filter(l => l.kind === 'stop').map(l => l.price), [95])
})

test('a null price never becomes a level at zero, in ANY extractor', () => {
    // The shared `num` guard — one bug class, one fix, all three derivations.
    const call = deriveCallOverlay({
        status: 'long', bias: 'long',
        position_state: { entry: { fill_price: 100 }, stop: { current: null }, targets: [{ price: null }] },
    })
    assert.deepEqual(call.levels.map(l => l.price), [100])

    const idea = deriveIdeaOverlay({ direction: 'long', nativeProtection: { stop: null, tp: null }, invalidation: { low: null, high: null } }, [])
    assert.equal(idea.levels.length, 0)
})

test('setup: direction rides on every level, for the chart side', () => {
    const { levels } = deriveSetupOverlay(setup())
    assert.ok(levels.filter(l => l.kind !== 'invalidation').every(l => l.side === 'long'))
})

test('setup: missing / empty input is an empty overlay, never a throw', () => {
    assert.deepEqual(deriveSetupOverlay(null), { levels: [], indicators: [] })
    assert.deepEqual(deriveSetupOverlay({}), { levels: [], indicators: [] })
})
