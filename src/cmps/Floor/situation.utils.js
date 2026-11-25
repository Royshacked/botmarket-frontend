// The situation network's board — pure helpers (SituationPanel.jsx). The Mermaid text is built here from a run, so it
// is testable without a browser: one diagram per tree (its nodes, the branches children hang under, its own links) and
// one of the connections BETWEEN trees (branch → node, docs/design/situation-network.md §4).

export const pct = (p) => (typeof p === 'number' && Number.isFinite(p) ? `${Math.round(p * 100)}%` : '—')
export const usd = (v) => (typeof v === 'number' && Number.isFinite(v) ? `$${v.toFixed(2)}` : '—')

export const SECTION_LABEL = Object.freeze({ regime: 'Regime', policy: 'Policy', money: 'Big money', stories: 'Stories and geopolitics', prices: 'Prices', calendar: 'Calendar' })
export const DECISION_LABEL = Object.freeze({ moves_option: 'Moves an option', new_option: 'New option', new_question: 'New question', resolves: 'Resolves', outside: 'Outside the network', none: 'No change' })
export const REASON_LABEL = Object.freeze({ low_impact: 'low impact', nearly_settled: 'nearly settled', duplicate: 'duplicate', too_far_out: 'too far out', cap: 'the cap of its layer', story_full: 'its story is full', reworded: 'reworded', parent_resolved: 'its parent resolved another way' })
const word = (t) => String(t ?? 'other').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
/** A tree's label; a sector's tree (key `35:drug_pricing`) says its sector. Pure. */
export const TREE_LABEL = (t) => {
    const m = /^(\d{2}):(.+)$/.exec(String(t ?? ''))
    return m ? `${SECTOR_NAMES[m[1]] ?? m[1]} · ${word(m[2])}` : word(t)
}
/** The key a node's tree is grouped by: its tree, inside its sector when it has one. Pure. */
export const treeKey = (n) => ((n?.layer ?? 'macro') === 'macro' ? n.tree : `${n.layer}:${n.tree}`)

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
    for (const n of drawn(nodes)) { const k = treeKey(n); if (!m.has(k)) m.set(k, []); m.get(k).push(n) }
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
/** A tree's outline in the connections diagram: no fill, a thin dashed grey edge, its name in the settled grey. */
const OUTLINE = 'fill:transparent,stroke:#8a919e,stroke-width:1px,stroke-dasharray:3 3,color:#8a919e'
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
 * The connections BETWEEN trees: each tree an outline holding the nodes that take part, and a link drawn as the trees
 * draw theirs — a dotted arrow said in the options' words ("Strikes raises Rises"). The outline is see-through with a
 * thin dashed edge (Roy, 2026-11-23: Mermaid's filled grey boxes clashed with the boxes inside them). → null when no
 * link crosses a tree. Pure.
 */
export function crossDiagram(nodes = [], links = []) {
    const live = new Map(drawn(nodes).map(n => [n.node_id, n]))
    const cross = links.filter(l => live.has(l.from.node_id) && live.has(l.to.node_id) && treeKey(live.get(l.from.node_id)) !== treeKey(live.get(l.to.node_id)))
    if (!cross.length) return null
    const used = [...new Set(cross.flatMap(l => [l.from.node_id, l.to.node_id]))]
    const ids = new Map(used.map((id, i) => [id, `c${i}`]))
    const byTree = new Map()
    for (const id of used) { const t = treeKey(live.get(id)); if (!byTree.has(t)) byTree.set(t, []); byTree.get(t).push(live.get(id)) }
    const out = ['flowchart LR']
    let s = 0
    for (const [tree, ns] of byTree) {
        const sid = `s${s++}`
        out.push(`  subgraph ${sid}["${safe(TREE_LABEL(tree), 40)}"]`)
        for (const n of ns) out.push(`    ${ids.get(n.node_id)}["${safe(n.question, 60)}"]:::${cls(n)}`)
        out.push('  end')
        out.push(`  style ${sid} ${OUTLINE}`)
    }
    for (const l of cross) {
        const f = live.get(l.from.node_id), t = live.get(l.to.node_id)
        const fl = f.options.find(o => o.key === l.from.option)?.label ?? l.from.option
        const tl = t.options.find(o => o.key === l.to.option)?.label ?? l.to.option
        out.push(`  ${ids.get(l.from.node_id)} -.->|"${safe(fl, 26)} ${l.shift > 0 ? 'raises' : 'lowers'} ${safe(tl, 26)}"| ${ids.get(l.to.node_id)}`)
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

// ─── THE LAYERS (docs/design/situation-network-layers.md): a macro layer and one per sector under it ───

export const SECTOR_NAMES = Object.freeze({
    10: 'Energy', 15: 'Materials', 20: 'Industrials', 25: 'Consumer Discretionary', 30: 'Consumer Staples', 35: 'Health Care',
    40: 'Financials', 45: 'Information Technology', 50: 'Communication Services', 55: 'Utilities', 60: 'Real Estate',
})
export const SECTOR_SECTION_LABEL = Object.freeze({ backdrop: 'Macro backdrop', prices: 'Prices', news: 'Its news', policy: 'Its policy', calendar: 'Its calendar' })
/** A node's layer: 'macro' or a sector code (a node from before the layers is macro). Pure. */
export const layerOf = (n) => n?.layer ?? 'macro'
export const LAYER_LABEL = (l) => (l === 'macro' ? 'Macro' : SECTOR_NAMES[l] ?? l)

/** The layers present in a run, macro first, then sectors by code → `[[layer, count of drawn nodes]]`. Pure. */
export function layersOf(nodes = []) {
    const m = new Map([['macro', 0]])
    for (const n of drawn(nodes)) m.set(layerOf(n), (m.get(layerOf(n)) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => (a[0] === 'macro' ? -1 : b[0] === 'macro' ? 1 : a[0].localeCompare(b[0])))
}

/**
 * The nodes to show for a layer: all of them ('all'), or the layer's own nodes plus the nodes OTHER layers link into them
 * from or out to (as context, so a sector is seen with its macro parents). Pure.
 */
export function nodesForLayer(nodes = [], links = [], layer = 'all') {
    if (layer === 'all') return nodes
    const own = new Set(nodes.filter(n => layerOf(n) === layer).map(n => n.node_id))
    const near = new Set(own)
    for (const l of links) {
        if (own.has(l.to.node_id)) near.add(l.from.node_id)
        if (own.has(l.from.node_id)) near.add(l.to.node_id)
    }
    return nodes.filter(n => near.has(n.node_id))
}

/** The dropped list counted per layer → `[[layer, n]]`. Pure. */
export function droppedByLayer(dropped = []) {
    const m = new Map()
    for (const d of dropped) m.set(d.layer ?? 'macro', (m.get(d.layer ?? 'macro') ?? 0) + 1)
    return [...m.entries()]
}

/** The missing-outcomes review's line on the Updates tab: what it added, reworded and followed up. Pure. */
export function outcomesLine(o, nodes = []) {
    const q = (id) => nodes.find(n => n.node_id === id)
    const parts = [
        ...(o.added ?? []).map(a => `added "${a.label}" to ${q(a.node_id)?.question ?? a.node_id}`),
        ...(o.reworded ?? []).map(r => `reworded as ${r.question}`),
        ...(o.followUps ?? []).map(f => { const p = q(f.parent); return `follow-up ${f.question}, if "${p?.options?.find(x => x.key === f.option)?.label ?? f.option}"` }),
    ]
    return parts.length ? parts.join('; ') : "every question's options stood"
}
