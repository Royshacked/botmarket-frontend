// The situation network's board — pure helpers (SituationPanel.jsx). The Mermaid text is built here from a run, so it
// is testable without a browser: one diagram per tree (its nodes, the branches children hang under, its own links) and
// one of the connections BETWEEN trees (branch → node, docs/design/situation-network.md §4).

export const pct = (p) => (typeof p === 'number' && Number.isFinite(p) ? `${Math.round(p * 100)}%` : '—')
export const usd = (v) => (typeof v === 'number' && Number.isFinite(v) ? `$${v.toFixed(2)}` : '—')

export const SECTION_LABEL = Object.freeze({ regime: 'Regime', policy: 'Policy', money: 'Big money', stories: 'Stories and geopolitics', prices: 'Prices', calendar: 'Calendar' })
export const DECISION_LABEL = Object.freeze({ moves_option: 'Moves an option', new_option: 'New option', new_question: 'New question', resolves: 'Resolves', outside: 'Outside the network', none: 'No change' })
export const REASON_LABEL = Object.freeze({ low_impact: 'low impact', nearly_settled: 'nearly settled', duplicate: 'duplicate', too_far_out: 'too far out', cap: 'the cap of 20' })
export const TREE_LABEL = (t) => String(t ?? 'other').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())

/** Mermaid-safe text: no quotes, brackets or pipes; short. Pure. */
export function safe(s, max = 90) {
    const t = String(s ?? '').replace(/["[\]{}|<>#;`]/g, ' ').replace(/\s+/g, ' ').trim()
    return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/** The nodes worth drawing: live and resolved (dropped and split are on the Updates tab). Pure. */
export function drawn(nodes = []) {
    return nodes.filter(n => n.status === 'live' || n.status === 'resolved')
}

/** Nodes grouped by tree, trees in first-seen order → `[[tree, nodes]]`. Pure. */
export function treesOf(nodes = []) {
    const m = new Map()
    for (const n of drawn(nodes)) { if (!m.has(n.tree)) m.set(n.tree, []); m.get(n.tree).push(n) }
    return [...m.entries()]
}

/** A node's box label: the question, then each option with its number (dormant / woken / resolved marked). Pure. */
export function boxLabel(n) {
    const lines = n.options.map(o => {
        const tag = n.status === 'resolved' ? (n.resolved?.option === o.key ? ' ✓' : '') : (n.woken ?? []).some(w => w.option === o.key) ? ' ⚠ woken' : o.dormant ? ' · dormant' : ''
        return `${safe(o.label, 40)} ${pct(o.p)}${tag}`
    })
    return [safe(n.question), ...lines].join('<br/>')
}

const cls = (n) => (n.status === 'resolved' ? 'resolved' : n.kind === 'settled' ? 'settled' : 'open')
const CLASSES = [
    'classDef open stroke:#5b8def,stroke-width:2px',
    'classDef settled stroke:#8a919e,stroke-width:1px',
    'classDef resolved stroke:#3fae6a,stroke-width:2px,stroke-dasharray:4 3',
]

/** One tree as a Mermaid flowchart: its nodes, the branches their children hang under, and links inside it. Pure. */
export function treeDiagram(treeNodes, links = []) {
    const ids = new Map(treeNodes.map((n, i) => [n.node_id, `n${i}`]))
    const out = ['flowchart LR']
    for (const n of treeNodes) out.push(`  ${ids.get(n.node_id)}["${boxLabel(n)}"]:::${cls(n)}`)
    for (const n of treeNodes) {
        if (n.given && ids.has(n.given.node_id)) {
            const parent = treeNodes.find(x => x.node_id === n.given.node_id)
            const label = parent?.options.find(o => o.key === n.given.option)?.label ?? n.given.option
            out.push(`  ${ids.get(n.given.node_id)} -->|"${safe(label, 30)}"| ${ids.get(n.node_id)}`)
        }
    }
    // Said in the options' own words, not their keys (the 2026-11-23 drive read "bear_market raises cut").
    const labelOf = (id, key) => treeNodes.find(x => x.node_id === id)?.options.find(o => o.key === key)?.label ?? key
    for (const l of links) {
        if (!ids.has(l.from.node_id) || !ids.has(l.to.node_id)) continue
        out.push(`  ${ids.get(l.from.node_id)} -.->|"${safe(labelOf(l.from.node_id, l.from.option), 26)} ${l.shift > 0 ? 'raises' : 'lowers'} ${safe(labelOf(l.to.node_id, l.to.option), 26)}"| ${ids.get(l.to.node_id)}`)
    }
    return [...out, ...CLASSES.map(c => `  ${c}`)].join('\n')
}

/**
 * The connections BETWEEN trees: each tree a box holding the nodes that take part, a thick arrow per cross-tree link,
 * labelled with the branch it starts on and the option it moves. → null when no link crosses a tree. Pure.
 */
export function crossDiagram(nodes = [], links = []) {
    const live = new Map(drawn(nodes).map(n => [n.node_id, n]))
    const cross = links.filter(l => live.has(l.from.node_id) && live.has(l.to.node_id) && live.get(l.from.node_id).tree !== live.get(l.to.node_id).tree)
    if (!cross.length) return null
    const used = [...new Set(cross.flatMap(l => [l.from.node_id, l.to.node_id]))]
    const ids = new Map(used.map((id, i) => [id, `c${i}`]))
    const byTree = new Map()
    for (const id of used) { const t = live.get(id).tree; if (!byTree.has(t)) byTree.set(t, []); byTree.get(t).push(live.get(id)) }
    const out = ['flowchart LR']
    let s = 0
    for (const [tree, ns] of byTree) {
        out.push(`  subgraph s${s++}["${safe(TREE_LABEL(tree), 40)}"]`)
        for (const n of ns) out.push(`    ${ids.get(n.node_id)}["${safe(n.question, 60)}"]:::${cls(n)}`)
        out.push('  end')
    }
    for (const l of cross) {
        const f = live.get(l.from.node_id), t = live.get(l.to.node_id)
        const fl = f.options.find(o => o.key === l.from.option)?.label ?? l.from.option
        const tl = t.options.find(o => o.key === l.to.option)?.label ?? l.to.option
        out.push(`  ${ids.get(l.from.node_id)} ==>|"${safe(fl, 26)} → ${l.shift > 0 ? '+' : '−'} ${safe(tl, 26)}"| ${ids.get(l.to.node_id)}`)
    }
    return [...out, ...CLASSES.map(c => `  ${c}`)].join('\n')
}

/** The industries, the most one-sided first; `calls` are those at 60%+. Pure. */
export function industryTable(industries = []) {
    const rows = [...industries].sort((a, b) => Math.max(b.p_win, b.p_lose) - Math.max(a.p_win, a.p_lose))
    return { rows, calls: rows.filter(r => r.p_win >= 0.6 || r.p_lose >= 0.6) }
}

/** One node's history as a compact line per run. Pure. */
export function historyLines(history = []) {
    return history.map(h => ({ key: h.run_id, when: h.as_of, kind: h.kind, by: h.set_by, text: h.options.map(o => `${o.label} ${pct(o.p)}`).join(' / ') }))
}
