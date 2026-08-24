import PropTypes from 'prop-types'
import { Modal } from '../Modal.jsx'
import './DeleteIdeaDialog.scss'

/**
 * Confirmation dialog for deleting a 'hit' idea — one that has fired and is awaiting
 * the user's order confirmation. Nothing is placed at the broker yet, so the delete
 * is safe, but it discards the pending entry — so we confirm intent in a custom
 * dialog rather than letting the bin remove it in one click.
 */
export function DeleteIdeaDialog({ idea, deleting, onConfirm, onCancel }) {
    if (!idea) return null

    return (
        <Modal
            ns="delete-idea"
            busy={deleting}
            onClose={onCancel}
            title="Delete triggered idea"
            asset={idea.asset ?? '—'}
            direction={idea.direction}
            footer={<>
                <button
                    className="delete-idea__btn delete-idea__btn--cancel"
                    onClick={onCancel}
                    disabled={deleting}
                >Cancel</button>
                <button
                    className="delete-idea__btn delete-idea__btn--confirm"
                    onClick={onConfirm}
                    disabled={deleting}
                >{deleting ? 'Deleting…' : 'Delete idea'}</button>
            </>}
        >
            <p className="delete-idea__lead">
                This idea has <strong>triggered</strong> and is waiting for your order
                confirmation. Deleting it discards the pending entry — no order has been
                placed at the broker, so nothing is closed, but the idea is gone for good.
            </p>
        </Modal>
    )
}

DeleteIdeaDialog.propTypes = {
    idea:      PropTypes.object,
    deleting:  PropTypes.bool,
    onConfirm: PropTypes.func.isRequired,
    onCancel:  PropTypes.func.isRequired,
}
