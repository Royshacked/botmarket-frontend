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

test('textToIndicators: volume excluded, no cap — every named indicator draws', () => {
    assert.equal(textToIndicators('volume').length, 0)  // chart always shows a volume pane
    assert.equal(textToIndicators('ema(9), ema(20), ema(50), rsi(14)').length, 4)
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

test('textToIndicators: prose forms — "20 EMA", "200-day SMA", "50d EMA", "the 200 MA", "20/50 EMA"', () => {
    assert.deepEqual(textToIndicators('reclaim the 20 EMA'),        [{ name: 'EMA', calcParams: [20],  overlay: true }])
    assert.deepEqual(textToIndicators('holding the 200-day SMA'),   [{ name: 'MA',  calcParams: [200], overlay: true }])
    assert.deepEqual(textToIndicators('above the 50d EMA'),         [{ name: 'EMA', calcParams: [50],  overlay: true }])
    assert.deepEqual(textToIndicators('lost the 200 MA'),           [{ name: 'MA',  calcParams: [200], overlay: true }])
    assert.deepEqual(textToIndicators('a 20/50 EMA cross'),
        [{ name: 'EMA', calcParams: [20], overlay: true }, { name: 'EMA', calcParams: [50], overlay: true }])
    // the same average named both ways is one line, and a price is never a period
    assert.deepEqual(textToIndicators('ema(20) then the 20 EMA'),   [{ name: 'EMA', calcParams: [20], overlay: true }])
    assert.deepEqual(textToIndicators('close above 4150 ; ema cross'), [])
})

// ── deriveSetupOverlay ────────────────────────────────────────────────────────
// The numbers are already clean (setup.schema normalizeZones), so unlike an idea nothing here is
// parsed from text. `setup()` is a PRE-SCENARIO document — flat zones + root validity, legacy bands
// with two edges — which is the only shape whose flat fields are read at all.

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

// A scenario-shaped setup: two rival ways in, zero-width levels, each with its own range.
const scenarioSetup = () => ({
    direction: 'long',
    status: 'looking',
    // The flat fields are the FIRST scenario's projection — must not draw a second time.
    entry_zones: [{ lower: 100, upper: 100 }],
    stop_zones:  [{ lower: 95,  upper: 95 }],
    tp_zones:    [{ lower: 110, upper: 110 }],
    validity:    { lower: 90, upper: 130, approach: 104 },
    scenarios: [
        {
            id: 's1', name: 'False break',
            entry_zones: [{ id: 's1e1', lower: 100, upper: 100 }],
            stop_zones:  [{ id: 's1s1', lower: 95,  upper: 95 }],
            tp_zones:    [{ id: 's1t1', lower: 110, upper: 110 }],
            validity:    { lower: 90, upper: 130, approach: 104 },
        },
        {
            id: 's2', name: 'Break and go',
            entry_zones: [{ id: 's2e1', lower: 106, upper: 106 }],
            stop_zones:  [{ id: 's2s1', lower: 101, upper: 101 }],
            tp_zones:    [{ id: 's2t1', lower: 115, upper: 115 }, { id: 's2t2', lower: 120, upper: 120 }],
            validity:    { lower: 98, upper: 125, approach: null },
        },
    ],
})
const pricesOf = (levels, kind) => levels.filter(l => l.kind === kind).map(l => l.price).sort((a, b) => a - b)

test('setup: pre-arm, every live scenario draws — entries, stops, targets, ranges, away pivot', () => {
    const { levels } = deriveSetupOverlay(scenarioSetup())
    assert.deepEqual(pricesOf(levels, 'entry'), [100, 106])
    assert.deepEqual(pricesOf(levels, 'stop'),  [95, 101])
    assert.deepEqual(pricesOf(levels, 'tp'),    [110, 115, 120])
    assert.deepEqual(pricesOf(levels, 'invalidation'), [90, 98, 125, 130])
    assert.deepEqual(pricesOf(levels, 'ref'), [104])                   // "ran away"
    // zero-width levels are ONE line each, and the flat projection did not double the first scenario
    assert.equal(levels.filter(l => l.price === 100).length, 1)
    // two premises on one chart → each level says whose it is
    assert.ok(levels.some(l => l.label === 'Entry · False break') && levels.some(l => l.label === 'Entry · Break and go'))
    assert.ok(levels.some(l => l.label === 'TP1 · Break and go') && levels.some(l => l.label === 'TP2 · Break and go'))
})

test('setup: a dead premise is not a relevant price', () => {
    const s = scenarioSetup()
    s.monitor_state = { scenarios: { s2: { invalidation_status: 'fired' } } }
    const { levels } = deriveSetupOverlay(s)
    assert.deepEqual(pricesOf(levels, 'entry'), [100])
    // one premise left → no scenario tag on the labels
    assert.ok(levels.filter(l => l.kind !== 'ref').every(l => !l.label.includes('·')))
})

test('setup: once armed, only the premise that fired draws', () => {
    const s = { ...scenarioSetup(), status: 'hit', armed_scenario_id: 's2' }
    const { levels } = deriveSetupOverlay(s)
    assert.deepEqual(pricesOf(levels, 'entry'), [106])
    assert.deepEqual(pricesOf(levels, 'stop'),  [101])
    assert.deepEqual(pricesOf(levels, 'tp'),    [115, 120])
    assert.deepEqual(pricesOf(levels, 'invalidation'), [98, 125])
})

test('setup: in position, the fill / current stop / target ladder replace the plan', () => {
    const s = {
        ...scenarioSetup(), status: 'long', armed_scenario_id: 's2',
        position_state: {
            entry:   { fill_price: 106.2 },
            stop:    { current: 103 },                                  // trailed above the planned 101
            targets: [{ price: 115, hit_at: '2026-09-12T00:00:00Z' }, { price: 120 }],
        },
    }
    const { levels } = deriveSetupOverlay(s)
    assert.deepEqual(pricesOf(levels, 'entry'), [106.2])
    assert.deepEqual(pricesOf(levels, 'stop'),  [103])
    assert.ok(levels.some(l => l.label === 'TP1 ✓') && levels.some(l => l.label === 'TP2'))
    assert.deepEqual(pricesOf(levels, 'invalidation'), [])              // the range is a pre-entry gate
})

test('setup: closed draws the exit', () => {
    const s = {
        ...scenarioSetup(), status: 'closed', armed_scenario_id: 's1',
        position_state: { entry: { fill_price: 100 }, stop: { current: 95 }, targets: [], outcome: { exit_price: 108.5 } },
    }
    const { levels } = deriveSetupOverlay(s)
    assert.deepEqual(pricesOf(levels, 'exit'), [108.5])
    assert.deepEqual(pricesOf(levels, 'tp'), [110])                     // no ladder written → the plan's
})

test('setup: guards Talos armed are drawn, unless they sit on a level already there', () => {
    const s = scenarioSetup()
    s.monitor_state = { guards: [
        { price: 100, direction: 'any', means: 'entry' },               // on s1's entry — no second line
        { price: 97.5, direction: 'below', means: 'invalidation' },     // only the monitor named this
        { after_min: 240 },                                             // backstop — no price
    ] }
    const { levels } = deriveSetupOverlay(s)
    assert.equal(levels.filter(l => l.price === 100).length, 1)
    assert.deepEqual(levels.filter(l => l.price === 97.5).map(l => l.label), ['Talos · invalidation'])
})

test('setup: indicators are read from every tier — root, scenario, and zone conditions', () => {
    const { indicators } = deriveSetupOverlay({
        ...setup(),
        conditions: [{ id: 'c1', text: 'RSI holding above 50' }],
        scenarios:  [{
            id: 's1', name: 'Way in 1',
            entry_zones: [{ lower: 100, upper: 100 }],
            stop_zones:  [{ lower: 95, upper: 95, conditions: [{ id: 's1s1c1', text: 'out if it closes below the ema(50)' }] }],
            conditions:  [{ id: 's1c1', text: 'a green 15m close back above the 20 EMA' }],
        }],
    })
    // Root (RSI), scenario condition (20 EMA), zone condition (EMA 50). Three tiers, three lines —
    // sorted because the palette order is not what this test is about.
    const names = indicators.map(d => `${d.name}(${d.calcParams.join(',')})`).sort()
    assert.deepEqual(names, ['EMA(20)', 'EMA(50)', 'RSI(14)'])
})

test('setup: a zone’s own condition names an indicator too', () => {
    const { indicators } = deriveSetupOverlay({
        direction: 'long',
        tp_zones: [{ lower: 110, upper: 110, conditions: [{ id: 't1c1', text: 'trail behind the ema(21)' }] }],
    })
    assert.deepEqual(indicators, [{ name: 'EMA', calcParams: [21], overlay: true }])
})

test('setup: conditions with no indicator words draw nothing', () => {
    const { indicators } = deriveSetupOverlay({
        ...setup(),
        conditions: [{ id: 'c1', text: 'FDA decision has printed' }],
        scenarios:  [{ id: 's1', conditions: [{ id: 's1c1', text: 'a sweep of the prior low' }] }],
    })
    assert.deepEqual(indicators, [])
})

test('setup: missing / empty input is an empty overlay, never a throw', () => {
    assert.deepEqual(deriveSetupOverlay(null), { levels: [], indicators: [] })
    assert.deepEqual(deriveSetupOverlay({}), { levels: [], indicators: [] })
})
