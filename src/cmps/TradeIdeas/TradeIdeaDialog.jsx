import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { IdeaDetail } from './IdeaDetail.jsx'
import { formatCreatedAtFull, brokerSymbolLabel, isDeleteLocked } from './tradeIdea.utils.js'
import { StatusIcon } from '../StatusIcon.jsx'

// ── Dialog ────────────────────────────────────────────────────────────────────

const DIALOG_W = 880
const DIALOG_H = 700

export function TradeIdeaDialog({ idea, index = 0, positions = [], onClose, onEdit, onDelete, onPlaceOrder, onClosePosition, onRefreshPositions }) {
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

            <IdeaDetail
                idea={idea}
                positions={positions}
                closePosition={onClosePosition}
                onPositionsChanged={onRefreshPositions}
            />

            <div className="idea-dialog__footer">
                {onDelete && (
                    <button
                        className="idea-dialog__btn idea-dialog__btn--delete"
                        onClick={handleDelete}
                        disabled={isDeleteLocked(idea)}
                        title={isDeleteLocked(idea) ? 'Live on the broker — close the position first to delete' : undefined}
                    >Delete</button>
                )}
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
    positions: PropTypes.array,
    onClose:  PropTypes.func.isRequired,
    onEdit:   PropTypes.func,
    onDelete: PropTypes.func,
    onPlaceOrder: PropTypes.func,
    onClosePosition:    PropTypes.func,
    onRefreshPositions: PropTypes.func,
}
