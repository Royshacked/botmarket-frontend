import PropTypes from 'prop-types'
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
        <div className="delete-idea__backdrop" onClick={deleting ? undefined : onCancel}>
            <div className="delete-idea" onClick={e => e.stopPropagation()}>
                <div className="delete-idea__header">
                    <span className="delete-idea__title">
                        Delete triggered idea
                        <span className="delete-idea__asset">{idea.asset ?? '—'}</span>
                        <span className={`delete-idea__direction direction--${idea.direction}`}>
                            {idea.direction ?? ''}
                        </span>
                    </span>
                    <button className="delete-idea__close" onClick={onCancel} disabled={deleting}>×</button>
                </div>

                <div className="delete-idea__body">
                    <p className="delete-idea__lead">
                        This idea has <strong>triggered</strong> and is waiting for your order
                        confirmation. Deleting it discards the pending entry — no order has been
                        placed at the broker, so nothing is closed, but the idea is gone for good.
                    </p>
                </div>

                <div className="delete-idea__footer">
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
                </div>
            </div>
        </div>
    )
}

DeleteIdeaDialog.propTypes = {
    idea:      PropTypes.object,
    deleting:  PropTypes.bool,
    onConfirm: PropTypes.func.isRequired,
    onCancel:  PropTypes.func.isRequired,
}
