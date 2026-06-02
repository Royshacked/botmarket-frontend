import { useState, useEffect, Fragment } from 'react'
import PropTypes from 'prop-types'

// ── Condition tree helpers ────────────────────────────────────────────────────

/**
 * Get a displayable tree node from an idea.
 * Uses the tree field if present, falls back to synthesizing from flat arrays.
 */
function getTree(idea, treeField, condField, logicField) {
    if (idea[treeField]) return idea[treeField]
    const conds = idea[condField]
    if (Array.isArray(conds) && conds.length > 0)
        return { operator: idea[logicField] ?? 'AND', children: conds }
    return null
}

/** Flatten a tree node to an array of { leaf, op } for inline rendering. */
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

function LeafChip({ leaf, inline }) {
    if (!leaf || typeof leaf.condition !== 'string') return null
    const type = leaf.type ?? 'structured'
    return (
        <span className={`ctree__leaf${inline ? ' ctree__leaf--inline' : ''}`}>
            <span className="ctree__leaf-text">{leaf.condition}</span>
            <span className={`ctree__leaf-type type--${type}`}>{type}</span>
            {leaf.timeframe && <span className="ctree__leaf-tf">{leaf.timeframe}</span>}
        </span>
    )
}

function TreeRow({ node }) {
    // Leaf → own row, full width
    if (typeof node?.condition === 'string') {
        return (
            <div className="ctree__row ctree__row--leaf">
                <LeafChip leaf={node} />
            </div>
        )
    }

    // Sub-group → all leaves inline on one row
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

function ConditionTreeView({ node }) {
    if (!node) return <p className="ctree__empty">—</p>

    // Single leaf at root (unusual)
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

// ── Dialog ────────────────────────────────────────────────────────────────────

export function TradeIdeaDialog({ idea, onClose, onEdit, onDelete }) {
    if (!idea) return null

    const entryTree = getTree(idea, 'entry_condition_tree', 'entry_conditions', 'entry_logic')
    const stopTree  = getTree(idea, 'stop_condition_tree',  'stop_conditions',  'stop_logic')
    const tpTree    = getTree(idea, 'tp_condition_tree',    'tp_conditions',    'tp_logic')

    function handleDelete() {
        onDelete(idea.id)
        onClose()
    }

    function handleEditInChat() {
        onClose()
        onEdit(idea)
    }

    function handleBackdrop(ev) {
        if (ev.target === ev.currentTarget) onClose()
    }

    return (
        <div className="idea-dialog__backdrop" onClick={handleBackdrop}>
            <div className="idea-dialog">

                <div className="idea-dialog__header">
                    <span className="idea-dialog__title">
                        {idea.asset || '—'}
                        <span className={`idea-dialog__direction direction--${idea.direction}`}>
                            {idea.direction ? ` · ${idea.direction}` : ''}
                        </span>
                        {idea.type && <span style={{ color: '#2a5a9a', fontWeight: 400 }}> · {idea.type}</span>}
                    </span>
                    <button className="idea-dialog__close" onClick={onClose}>×</button>
                </div>

                <div className="idea-dialog__body">

                    <div className="idea-dialog__field">
                        <span>Entry conditions</span>
                        <ConditionTreeView node={entryTree} />
                    </div>

                    <div className="idea-dialog__field">
                        <span>Stop loss</span>
                        <ConditionTreeView node={stopTree} />
                    </div>

                    {tpTree && (
                        <div className="idea-dialog__field">
                            <span>Take profit</span>
                            <ConditionTreeView node={tpTree} />
                        </div>
                    )}

                    {idea.notes && (
                        <div className="idea-dialog__field">
                            <span>Notes</span>
                            <p style={{ margin: 0, color: '#7a9bc0', fontSize: '0.78rem' }}>{idea.notes}</p>
                        </div>
                    )}

                </div>

                <div className="idea-dialog__footer">
                    <button className="idea-dialog__btn idea-dialog__btn--delete" onClick={handleDelete}>Delete</button>
                    <button className="idea-dialog__btn idea-dialog__btn--save"   onClick={handleEditInChat}>Edit in chat</button>
                </div>

            </div>
        </div>
    )
}

TradeIdeaDialog.propTypes = {
    idea:     PropTypes.object,
    onClose:  PropTypes.func.isRequired,
    onEdit:   PropTypes.func.isRequired,
    onDelete: PropTypes.func.isRequired,
}
