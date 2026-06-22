import { Fragment } from 'react'

// ── Condition tree helpers ────────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components -- small condition-tree helper colocated with its only consumers
export function getTree(idea, treeField, condField, logicField) {
    if (idea[treeField]) return idea[treeField]
    const conds = idea[condField]
    if (Array.isArray(conds) && conds.length > 0)
        return { operator: idea[logicField] ?? 'AND', children: conds }
    return null
}

function flattenInline(node, parentOp = null) {
    if (!node) return []
    if (typeof node.condition === 'string') return [{ leaf: node, op: parentOp }]
    if (node.operator && Array.isArray(node.children)) {
        return node.children.flatMap((child, i) =>
            flattenInline(child, i === 0 ? parentOp : node.operator)
        )
    }
    return []
}

// ── Tree display components ───────────────────────────────────────────────────

/**
 * Stable identity for a condition leaf — MUST mirror the backend
 * (monitor.orchestrator.js `leafStateKey`) so a persisted met-state keys back to
 * the right chip. Keyed by type + timeframe + condition text.
 */
// eslint-disable-next-line react-refresh/only-export-components -- tiny helper colocated with its only consumers
export function leafStateKey(leaf) {
    return `${leaf?.type ?? 'structured'}|${leaf?.timeframe ?? ''}|${leaf?.condition ?? ''}`
}

/**
 * True when every node under `node` is a leaf or an AND group (no OR anywhere).
 * Used to decide whether a phase's "passed" status implies all leaves are met —
 * which only holds for all-AND trees (an OR phase passes on just one branch).
 */
// eslint-disable-next-line react-refresh/only-export-components -- tiny tree helper colocated with its only consumers
export function isAllAnd(node) {
    if (!node) return false
    if (typeof node.condition === 'string') return true
    if (node.operator === 'AND' && Array.isArray(node.children)) return node.children.every(isAllAnd)
    return false
}

// `states` is the per-phase map { leafStateKey → metAt } persisted by the monitor.
// `fallbackMet` marks a leaf met when no per-leaf state exists but the phase has
// demonstrably passed (e.g. a 'hit' idea that pre-dates state persistence).
function isMet(leaf, states, fallbackMet = false) {
    if (states && states[leafStateKey(leaf)] != null) return true
    if (leaf.met ?? leaf.triggered ?? leaf.triggeredAt) return true
    return fallbackMet
}

export function LeafChip({ leaf, inline, states, fallbackMet }) {
    if (!leaf || typeof leaf.condition !== 'string') return null
    const type = leaf.type ?? 'structured'
    const met  = isMet(leaf, states, fallbackMet)
    return (
        <span className={`ctree__leaf${inline ? ' ctree__leaf--inline' : ''}${met ? ' ctree__leaf--met' : ''}`}>
            {met && (
                <span className="ctree__leaf-check" aria-hidden="true" title="Condition met">✓</span>
            )}
            <span className="ctree__leaf-text">{leaf.condition}</span>
            {leaf.quantity != null && <span className="ctree__leaf-qty">{leaf.quantity}</span>}
            <span className={`ctree__leaf-type type--${type}`}>{type === 'volume' && leaf.mode ? `${type}·${leaf.mode}` : type}</span>
            {leaf.timeframe && <span className="ctree__leaf-tf">{leaf.timeframe}</span>}
        </span>
    )
}

export function TreeRow({ node, states, fallbackMet }) {
    if (typeof node?.condition === 'string') {
        return (
            <div className="ctree__row ctree__row--leaf">
                <LeafChip leaf={node} states={states} fallbackMet={fallbackMet} />
            </div>
        )
    }
    if (node?.operator && Array.isArray(node.children)) {
        const items = flattenInline(node)
        return (
            <div className="ctree__row ctree__row--group">
                {items.map(({ leaf, op }, i) => (
                    <Fragment key={i}>
                        {op && <span className="ctree__inline-op">{op}</span>}
                        <LeafChip leaf={leaf} inline states={states} fallbackMet={fallbackMet} />
                    </Fragment>
                ))}
            </div>
        )
    }
    return null
}

export function ConditionTreeView({ node, states, fallbackMet = false }) {
    if (!node) return <p className="ctree__empty">—</p>
    if (typeof node.condition === 'string') {
        return (
            <div className="ctree">
                <div className="ctree__rows"><TreeRow node={node} states={states} fallbackMet={fallbackMet} /></div>
            </div>
        )
    }
    const { operator, children } = node
    if (!Array.isArray(children) || children.length === 0)
        return <p className="ctree__empty">—</p>
    return (
        <div className="ctree">
            <div className="ctree__rows">
                {children.map((child, i) => (
                    <Fragment key={i}>
                        {i > 0 && <div className="ctree__sep">{operator}</div>}
                        <TreeRow node={child} states={states} fallbackMet={fallbackMet} />
                    </Fragment>
                ))}
            </div>
        </div>
    )
}
