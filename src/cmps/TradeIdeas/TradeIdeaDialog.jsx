import { useState, useEffect, Fragment } from 'react'
import PropTypes from 'prop-types'
import { TradingViewChart } from '../TradingViewChart/TradingViewChart.jsx'
import { formatCreatedAtFull, brokerSymbolLabel } from './tradeIdea.utils.js'
import { StatusIcon } from '../StatusIcon.jsx'

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
    return (
        <span className={`ctree__leaf${inline ? ' ctree__leaf--inline' : ''}`}>
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

// ── Dialog ────────────────────────────────────────────────────────────────────

const DIALOG_W = 540
const DIALOG_H = 660

export function TradeIdeaDialog({ idea, index = 0, onClose, onEdit, onDelete, onPlaceOrder }) {
    const [pos, setPos] = useState({ x: 0, y: 0 })

    // Centre + cascade by index whenever a new idea is opened
    useEffect(() => {
        if (!idea) return
        const offset = index * 30
        setPos({
            x: Math.max(20, (window.innerWidth  - DIALOG_W) / 2 + offset),
            y: Math.max(20, (window.innerHeight - DIALOG_H) / 2 + offset),
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps -- reposition only when a different idea opens
    }, [idea?.id])

    if (!idea) return null

    const entryTree = getTree(idea, 'entry_condition_tree', 'entry_conditions', 'entry_logic')
    const stopTree  = getTree(idea, 'stop_condition_tree',  'stop_conditions',  'stop_logic')
    const tpTree    = getTree(idea, 'tp_condition_tree',    'tp_conditions',    'tp_logic')

    function handleHeaderMouseDown(e) {
        if (e.button !== 0) return
        e.preventDefault()
        const startX = e.clientX - pos.x
        const startY = e.clientY - pos.y
        document.body.style.userSelect = 'none'

        function onMove(e) {
            setPos({
                x: Math.max(0, Math.min(window.innerWidth  - DIALOG_W, e.clientX - startX)),
                y: Math.max(0, Math.min(window.innerHeight - 64,       e.clientY - startY)),
            })
        }
        function onUp() {
            document.body.style.userSelect = ''
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup',   onUp)
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup',   onUp)
    }

    function handleDelete() {
        onDelete(idea.id)
        onClose()
    }

    function handleEditInChat() {
        onClose()
        onEdit(idea)
    }

    function handlePlaceOrder() {
        onClose()
        onPlaceOrder(idea)
    }

    function handlePopOut() {
        localStorage.setItem(`popup-idea-${idea.id}`, JSON.stringify(idea))
        const popup = window.open(`/idea/${idea.id}`, `idea-${idea.id}`, 'width=960,height=720')
        if (popup) popup.__ideaData = idea
        onClose()
    }

    return (
        <div
            className="idea-dialog"
            style={{ left: pos.x, top: pos.y }}
        >
            <div className="idea-dialog__header" onMouseDown={handleHeaderMouseDown}>
                <span className="idea-dialog__title">
                    {idea.asset || '—'}
                    {brokerSymbolLabel(idea) && (
                        <span className="idea-row__broker-badge" title={`Trades as ${brokerSymbolLabel(idea)} on the broker`}>{brokerSymbolLabel(idea)}</span>
                    )}
                    <span className={`idea-dialog__direction direction--${idea.direction}`}>
                        {idea.direction ? ` · ${idea.direction}` : ''}
                    </span>
                    {idea.quantity != null && <span className="idea-dialog__meta"> · {idea.quantity}</span>}
                    {idea.type     != null && <span className="idea-dialog__meta"> · {idea.type}</span>}
                    {idea.savedAt  != null && <span className="idea-dialog__meta"> · {formatCreatedAtFull(idea.savedAt)}</span>}
                    {idea.status   != null && (
                        <span className={`idea-dialog__status status--${idea.status}`}>
                            <StatusIcon status={idea.status} />
                        </span>
                    )}
                </span>
                <div className="idea-dialog__header-actions" onMouseDown={e => e.stopPropagation()}>
                    <button className="idea-dialog__popout" onClick={handlePopOut} title="Pop out">⤢</button>
                    <button className="idea-dialog__close"  onClick={onClose}>×</button>
                </div>
            </div>

            <div className="idea-dialog__chart">
                <TradingViewChart symbol={idea.asset || 'SPY'} interval={idea.entry_timeframe || idea.timeframe || 'D'} />
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

                {Array.isArray(idea.additional_entries) && idea.additional_entries.length > 0 && (
                    <div className="idea-dialog__field">
                        <span>Additional entries <em>(scale-in)</em></span>
                        {idea.additional_entries.map((ae, i) => {
                            const tree = ae.condition_tree ?? (
                                Array.isArray(ae.conditions) && ae.conditions.length > 0
                                    ? { operator: ae.logic ?? 'AND', children: ae.conditions }
                                    : null
                            )
                            return (
                                <div key={i} style={{ marginBottom: 6 }}>
                                    <span className="idea-dialog__ae-qty">
                                        +{ae.quantity ?? '?'}{ae.triggeredAt ? ' ✅' : ''}
                                    </span>
                                    <ConditionTreeView node={tree} />
                                </div>
                            )
                        })}
                    </div>
                )}

                {idea.notes && (
                    <div className="idea-dialog__field">
                        <span>Notes</span>
                        <p className="idea-dialog__notes">{idea.notes}</p>
                    </div>
                )}
            </div>

            <div className="idea-dialog__footer">
                {onDelete && <button className="idea-dialog__btn idea-dialog__btn--delete" onClick={handleDelete}>Delete</button>}
                {onPlaceOrder && idea.status === 'hit' && !idea.ordersPlacedAt && Array.isArray(idea.accounts) && idea.accounts.length > 0 &&
                  (idea.orderState === 'awaiting_confirm' || idea.orderState == null) && (
                    <button className="idea-dialog__btn idea-dialog__btn--place" onClick={handlePlaceOrder}>Place order</button>
                )}
                {onEdit && !idea.portfolioId && <button className="idea-dialog__btn idea-dialog__btn--save" onClick={handleEditInChat}>Edit in chat</button>}
            </div>
        </div>
    )
}

TradeIdeaDialog.propTypes = {
    idea:     PropTypes.object,
    index:    PropTypes.number,
    onClose:  PropTypes.func.isRequired,
    onEdit:   PropTypes.func,
    onDelete: PropTypes.func,
    onPlaceOrder: PropTypes.func,
}
