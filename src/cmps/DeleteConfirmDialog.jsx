import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'
import { Modal } from './Modal.jsx'
import './TradeIdeas/DeleteIdeaDialog.scss'

/**
 * THE delete confirmation — one look for every "this is gone for good" ask (the triggered idea's, a past session's):
 * the shared Modal shell in the delete dialog's style (`delete-idea__*`), Cancel and a red confirm. Portalled to
 * <body>: a fixed overlay under a backdrop-filter ancestor stops being fixed (the chat column has one).
 *
 * @param {{ title: string, subject?: string, lead: node, confirmLabel: string, deleting?: boolean,
 *           onConfirm: Function, onCancel: Function }} props
 */
export function DeleteConfirmDialog({ title, subject, direction, lead, confirmLabel, deleting = false, onConfirm, onCancel }) {
    return createPortal(
        <Modal ns="delete-idea" busy={deleting} onClose={onCancel} title={title} asset={subject} direction={direction}
            footer={<>
                <button className="delete-idea__btn delete-idea__btn--cancel" onClick={onCancel} disabled={deleting}>Cancel</button>
                <button className="delete-idea__btn delete-idea__btn--confirm" onClick={onConfirm} disabled={deleting}>
                    {deleting ? 'Deleting…' : confirmLabel}
                </button>
            </>}
        >
            <p className="delete-idea__lead">{lead}</p>
        </Modal>,
        document.body,
    )
}

DeleteConfirmDialog.propTypes = {
    title:        PropTypes.string.isRequired,
    subject:      PropTypes.string,
    direction:    PropTypes.string,
    lead:         PropTypes.node.isRequired,
    confirmLabel: PropTypes.string.isRequired,
    deleting:     PropTypes.bool,
    onConfirm:    PropTypes.func.isRequired,
    onCancel:     PropTypes.func.isRequired,
}
