import PropTypes from 'prop-types'
import { DeleteConfirmDialog } from '../DeleteConfirmDialog.jsx'

/**
 * Confirmation dialog for deleting a 'hit' idea — one that has fired and is awaiting
 * the user's order confirmation. Nothing is placed at the broker yet, so the delete
 * is safe, but it discards the pending entry — so we confirm intent in a custom
 * dialog rather than letting the bin remove it in one click. The look is the shared
 * DeleteConfirmDialog's.
 */
export function DeleteIdeaDialog({ idea, deleting, onConfirm, onCancel }) {
    if (!idea) return null

    return (
        <DeleteConfirmDialog
            title="Delete triggered idea"
            subject={idea.asset ?? '—'}
            direction={idea.direction}
            deleting={deleting}
            confirmLabel="Delete idea"
            onConfirm={onConfirm}
            onCancel={onCancel}
            lead={<>
                This idea has <strong>triggered</strong> and is waiting for your order
                confirmation. Deleting it discards the pending entry — no order has been
                placed at the broker, so nothing is closed, but the idea is gone for good.
            </>}
        />
    )
}

DeleteIdeaDialog.propTypes = {
    idea:      PropTypes.object,
    deleting:  PropTypes.bool,
    onConfirm: PropTypes.func.isRequired,
    onCancel:  PropTypes.func.isRequired,
}
