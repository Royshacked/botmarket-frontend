import { test } from 'node:test'
import assert from 'node:assert/strict'

import { pct, safe, drawn, treesOf, boxLabel, treeDiagram, crossDiagram, industryTable, historyLines, layersOf, nodesForLayer, droppedByLayer, treeKey, TREE_LABEL, LAYER_LABEL } from './situation.utils.js'

const node = (node_id, tree, opts, over = {}) => ({ node_id, tree, question: `Q ${node_id}?`, status: 'live', kind: 'open', woken: [],
    options: Object.entries(opts).map(([key, p]) => ({ key, label: key, p })), ...over })

test('pct and safe', () => {
    assert.equal(pct(0.254), '25%')
    assert.equal(pct(null), '—')
    assert.equal(safe('a "quoted" [x] | y'), 'a quoted x y')
    assert.equal(safe('x'.repeat(100), 10).length, 10)
})

test('drawn and treesOf keep live and resolved, grouped by tree in order', () => {
    const ns = [node('a', 't1', { y: 1 }), node('b', 't2', { y: 1 }, { status: 'dropped' }), node('c', 't1', { y: 1 }, { status: 'resolved' }), node('d', 't3', { y: 1 })]
    assert.deepEqual(drawn(ns).map(n => n.node_id), ['a', 'c', 'd'])
    assert.deepEqual(treesOf(ns).map(([t, xs]) => [t, xs.length]), [['t1', 2], ['t3', 1]])
})

test('boxLabel marks dormant, woken and resolved options', () => {
    const n = node('q', 't', { yes: 0.85, no: 0.15 }, { kind: 'settled', options: [{ key: 'yes', label: 'Yes', p: 0.85 }, { key: 'no', label: 'No', p: 0.15, dormant: true }] })
    assert.equal(boxLabel(n), 'Q q?<br/>Yes 85%<br/>No 15% · dormant')
    assert.match(boxLabel({ ...n, woken: [{ option: 'no' }] }), /No 15% ⚠ woken/)
    assert.match(boxLabel({ ...n, status: 'resolved', resolved: { option: 'yes' } }), /Yes 85% ✓/)
})

test('treeDiagram: boxes, the branch a child hangs under, and links inside the tree', () => {
    const parent = node('p', 't', { yes: 0.85, no: 0.15 })
    const child = node('c', 't', { a: 0.5, b: 0.5 }, { given: { node_id: 'p', option: 'yes' } })
    const d = treeDiagram([parent, child], [{ from: { node_id: 'c', option: 'a' }, to: { node_id: 'p', option: 'no' }, shift: -0.4 }])
    assert.match(d, /^flowchart LR/)
    assert.match(d, /n0\["Q p\?<br\/>yes 85%<br\/>no 15%"\]:::open/)
    assert.match(d, /n0 -->\|"yes"\| n1/)
    assert.match(d, /n1 -\.->\|"a lowers no"\| n0/)
})

test('crossDiagram: only links that cross trees, in tree boxes; none → null', () => {
    const a = node('a', 'tariffs_trade', { all: 0.25, none: 0.75 }), b = node('b', 'inflation_fed_rates', { rises: 0.2, falls: 0.8 }), c = node('c', 'tariffs_trade', { x: 1 })
    const d = crossDiagram([a, b, c], [{ from: { node_id: 'a', option: 'all' }, to: { node_id: 'b', option: 'rises' }, shift: 0.8 }, { from: { node_id: 'a', option: 'all' }, to: { node_id: 'c', option: 'x' }, shift: 0.3 }])
    assert.match(d, /subgraph s0\["Tariffs trade"\]/)
    assert.match(d, /c0 ==>\|"all → \+ rises"\| c1/)
    assert.ok(!d.includes('Q c?'), 'a link inside one tree is not drawn here')
    assert.equal(crossDiagram([a, b], []), null)
})

test('industryTable: the most one-sided first; calls at 60%+', () => {
    const t = industryTable([{ name: 'A', p_win: 0.3, p_lose: 0.2 }, { name: 'B', p_win: 0.1, p_lose: 0.7 }, { name: 'C', p_win: 0.62, p_lose: 0 }])
    assert.deepEqual(t.rows.map(r => r.name), ['B', 'C', 'A'])
    assert.deepEqual(t.calls.map(r => r.name), ['B', 'C'])
})

test('historyLines: one line per run', () => {
    assert.deepEqual(historyLines([{ run_id: 'r1', as_of: '2025-01-07', kind: 'build', set_by: 'llm', options: [{ label: 'Yes', p: 0.85 }, { label: 'No', p: 0.15 }] }]),
        [{ key: 'r1', when: '2025-01-07', kind: 'build', by: 'llm', text: 'Yes 85% / No 15%' }])
})

test('the layers: present layers macro first; a layer with the nodes linked to it; dropped counted per layer; sector trees keyed apart', () => {
    const m = node('m', 'energy', { a: 0.5 }), h = node('h', 'drug_pricing', { a: 0.5 }, { layer: '35' }), t = node('t', 'chips', { a: 0.5 }, { layer: '45' })
    assert.deepEqual(layersOf([t, h, m]), [['macro', 1], ['35', 1], ['45', 1]])
    const links = [{ from: { node_id: 'm', option: 'a' }, to: { node_id: 'h', option: 'a' }, shift: 1 }]
    assert.deepEqual(nodesForLayer([m, h, t], links, '35').map(n => n.node_id), ['m', 'h'])
    assert.equal(nodesForLayer([m, h, t], links, 'all').length, 3)
    assert.deepEqual(droppedByLayer([{ layer: '35' }, {}, { layer: '35' }]), [['35', 2], ['macro', 1]])
    assert.equal(treeKey(h), '35:drug_pricing')
    assert.equal(TREE_LABEL(treeKey(h)), 'Health Care · Drug pricing')
    assert.equal(TREE_LABEL('energy'), 'Energy')
    assert.equal(LAYER_LABEL('macro'), 'Macro')
    assert.deepEqual(treesOf([m, node('m2', 'drug_pricing', { a: 1 }), h]).map(([k]) => k), ['energy', 'drug_pricing', '35:drug_pricing'])
})
