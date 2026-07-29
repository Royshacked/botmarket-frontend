import { useState } from 'react'
import PropTypes from 'prop-types'
import { posKey } from './PositionsTable.jsx'
import { PositionsCards } from './TradeIdeaCards.jsx'
import { DeleteButton } from '../EntityCard/EntityCard.jsx'
import { ClosePositionDialog } from './ClosePositionDialog.jsx'
import { EditOrdersDialog } from './EditOrdersDialog.jsx'
import './PopoutFooter.scss'

// Shared footer for the idea & call pop-out windows: the positions component + a delete button —
// identical markup/behaviour for both kinds; only the data and the delete handler differ.
//
// Positions are interactive when `closePosition` is supplied (close / edit-orders controls + the
// confirm/edit dialogs, same as the Positions tab); read-only otherwise. `positions` is expected
// pre-filtered to the entity (an idea, or a confirmed call's linked idea). Delete renders only
// when `onDelete` is given.
//
// The positions markup reuses the existing `idea-dialog__*` classes so it matches the idea pop-out
// exactly; extract IdeaDetail's positions block into this component (guarded behind a prop, since
// IdeaDetail is also rendered by the floating TradeIdeaDialog) so both pop-outs share this footer.
export function PopoutFooter({ positions = [], closePosition, onPositionsChanged, onDelete, deleteTitle = 'Delete' }) {
    const interactive = typeof closePosition === 'function'
    // In position → deleting would orphan the open position, so lock the bin (mirrors the
    // list's isDeleteLocked / the backend's 409 reason:'in_position'). `positions` is already
    // scoped to this entity, so a non-empty list means this idea/call is live.
    const inPosition = positions.length > 0
    const [pendingClose,  setPendingClose]  = useState(null)
    const [closingId,     setClosingId]     = useState(null)
    const [editOrdersPos, setEditOrdersPos] = useState(null)

    async function confirmClose() {
        const position = pendingClose
        if (!position) return
        setClosingId(posKey(position))
        try {
            await closePosition(position.broker, position.id, position.accountId)
            setPendingClose(null)
        } catch (err) {
            console.error('[positions] close failed', err)
        } finally {
            setClosingId(null)
        }
    }

    return (
        <div className="popout-footer idea-dialog__positions">
            <div className="popout-footer__head">
                <span className="idea-dialog__section-title">Positions</span>
                {onDelete && (
                    <DeleteButton
                        onClick={onDelete}
                        title={deleteTitle}
                        lockedReason={inPosition ? 'Close the open position before deleting' : null}
                        className="popout-footer__delete"
                    />
                )}
            </div>

            {positions.length > 0 ? (
                <PositionsCards
                    positions={positions}
                    closingId={interactive ? closingId : undefined}
                    onClose={interactive ? setPendingClose : undefined}
                    onEditOrders={interactive ? setEditOrdersPos : undefined}
                />
            ) : (
                <p className="idea-dialog__positions-empty">No open positions</p>
            )}

            {interactive && (
                <>
                    <ClosePositionDialog
                        position={pendingClose}
                        closing={!!pendingClose && closingId === posKey(pendingClose)}
                        onConfirm={confirmClose}
                        onCancel={() => setPendingClose(null)}
                    />
                    {editOrdersPos && (
                        <EditOrdersDialog
                            position={editOrdersPos}
                            onClose={() => setEditOrdersPos(null)}
                            onChanged={onPositionsChanged}
                        />
                    )}
                </>
            )}
        </div>
    )
}

PopoutFooter.propTypes = {
    positions:          PropTypes.array,
    closePosition:      PropTypes.func,
    onPositionsChanged: PropTypes.func,
    onDelete:           PropTypes.func,
    deleteTitle:        PropTypes.string,
}
