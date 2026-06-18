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

export function LeafChip({ leaf, inline }) {
    if (!leaf || typeof leaf.condition !== 'string') return null
    const type = leaf.type ?? 'structured'
    // A condition that has evaluated true gets a check mark. The truth flag is not
    // wired to live evaluation yet — for now we read whatever the idea carries.
    const met = leaf.met ?? leaf.triggered ?? !!leaf.triggeredAt
    return (
        <span className={`ctree__leaf${inline ? ' ctree__leaf--inline' : ''}${met ? ' ctree__leaf--met' : ''}`}>
            {met && <span className="ctree__leaf-check" title="Condition met">✓</span>}
            <span className="ctree__leaf-text">{leaf.condition}</span>
            {leaf.quantity != null && <span className="ctree__leaf-qty">{leaf.quantity}</span>}
            <span className={`ctree__leaf-type type--${type}`}>{type}</span>
            {leaf.timeframe && <span className="ctree__leaf-tf">{leaf.timeframe}</span>}
        </span>
    )
}

export function TreeRow({ node }) {
    if (typeof node?.condition === 'string') {
        return (
            <div className="ctree__row ctree__row--leaf">
                <LeafChip leaf={node} />
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
                        <LeafChip leaf={leaf} inline />
                    </Fragment>
                ))}
            </div>
        )
    }
    return null
}

export function ConditionTreeView({ node }) {
    if (!node) return <p className="ctree__empty">—</p>
    if (typeof node.condition === 'string') {
        return (
            <div className="ctree">
                <div className="ctree__rows"><TreeRow node={node} /></div>
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
                        <TreeRow node={child} />
                    </Fragment>
                ))}
            </div>
        </div>
    )
}
