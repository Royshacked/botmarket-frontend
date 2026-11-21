import { test } from 'node:test'
import assert from 'node:assert/strict'
import { infoFlow, FLOWS, LIST_FLOWS } from './infoFlow.js'

// Info as a diagram (backend one-axl.md §6): which flow, and the step the user is on — read off state, never guessed.

const mentor = (settled = {}, asset = 'NVDA') => ({ draft: { asset, build: { active: asset, names: [{ asset, settled }] } } })

test('the Hotlist open is ITS flow from the start — whatever the chat behind it is building (Roy, 2026-11-13)', () => {
    assert.deepEqual(infoFlow({ hotlistOpen: true }), { key: 'hotlist', ...FLOWS.hotlist, current: 0 })
    const mid = { mentor: mentor({ direction: 1, horizon: 1, entries: 1, size: 1 }) }
    assert.equal(infoFlow({ hotlistOpen: true, floor: 'mentor', agentState: mid }).key, 'hotlist')
    assert.equal(infoFlow({ hotlistOpen: true, floor: 'mentor', agentState: mid }).current, 0, 'not "build the trade" for a trade behind it')
    assert.equal(infoFlow({ hotlistOpen: false, floor: 'mentor', agentState: mid }).key, 'trade', 'the Hotlist closed → the trade\'s own flow again')
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

test('a portfolio, a coverage — each from its own role\'s state; no technicals flow since Proteus v2', () => {
    const p = (s) => infoFlow({ floor: 'portfolio', agentState: { portfolio: s } }).current
    assert.deepEqual([p({}), p({ mandate: {} }), p({ mandate: {}, pendingPlan: {} }), p({ reviewMode: true })], [0, 1, 3, 4])
    const a = (s) => infoFlow({ floor: 'analyst', agentState: { analyst: s } }).current
    assert.deepEqual([a({}), a({ active_symbol: 'MSFT' }), a({ active_symbol: 'MSFT', standing: true })], [0, 1, 2])
    // Proteus is no desk since 2026-11-21 (backend proteus-v2.md): no flow of his own; an old floor on him reads as Axl's.
    assert.equal(FLOWS.technicals, undefined)
    assert.equal(infoFlow({ floor: 'proteus', rows: [] }).key, 'axl')
    // The event analyst (backend echo-desk.md, 2026-11-19): mapping the event, then the map.
    assert.deepEqual(FLOWS.events.steps, ['Mapping the event', 'The map'])
    const e = (rows) => infoFlow({ floor: 'echo', rows })
    assert.equal(e([]).key, 'events')
    assert.equal(e([{ agent: 'echo', role: 'user' }]).current, 0)
    assert.equal(e([{ agent: 'echo', role: 'user' }, { agent: 'echo', role: 'assistant' }]).current, 1)
    assert.equal(e([{ agent: 'echo', role: 'assistant' }, { agent: 'proteus', role: 'user' }]).current, 1, 'rows of another role do not move it')
})

test('talking with Axl: one step, "Ask Axl" (Roy, 2026-11-13); a role with no flow → null', () => {
    assert.deepEqual(infoFlow({ floor: 'axl' }), { key: 'axl', title: 'Talking with Axl', steps: ['Ask Axl'], current: 0 })
    assert.equal(infoFlow({}).key, 'axl', 'no floor yet is Axl')
    assert.equal(infoFlow({ floor: 'scanner' }), null)
})

test('an open LIST owns Info — it covers the chat (Roy, 2026-11-13); its name until its Info is written', () => {
    const trading = { mentor: mentor({ direction: 'long' }) }
    assert.deepEqual(infoFlow({ floor: 'mentor', agentState: trading, list: { key: 'positions', label: 'Positions' } }),
        { key: 'list:positions', title: 'Positions', steps: LIST_FLOWS.positions.steps, current: -1 })
    assert.equal(infoFlow({ floor: 'mentor', agentState: trading, list: { key: 'hotlist', label: 'Hotlist' } }).key, 'hotlist')
    assert.equal(infoFlow({ floor: 'mentor', agentState: trading, list: null }).key, 'trade', 'the list closed → the chat\'s flow')
})

// drive:all (2026-11-17): every list but the Hotlist used to show its name over an empty Info column.
test('every list with a panel has Info of its own, with nothing lit', () => {
    for (const key of ['positions', 'queued', 'trade', 'portfolio', 'calendar', 'forecasts']) {
        const f = infoFlow({ list: { key, label: key } })
        assert.equal(f.key, `list:${key}`)
        assert.ok(f.steps.length >= 3, `${key} says what it holds`)
        assert.equal(f.current, -1, `${key}: a list is not a flow the user is in — no step is "you are here"`)
    }
    assert.deepEqual(infoFlow({ list: { key: 'board', label: 'Forecast board' } }),
        { key: 'list:board', title: 'Forecast board', steps: [], current: -1 }, 'a list not written yet still shows its name')
})
