import PropTypes from 'prop-types'
import { Modal } from '../Modal.jsx'
import { confirmCopy, EXECUTE_ERRORS } from './queuedAction.contract.js'
import './QueuedActionDialog.scss'

/**
 * Confirm a QUEUED action before it goes to the broker.
 *
 * Deliberately not the OrderConfirmDialog. That one exists because an entry has things left to
 * decide — levels, size, which account, the risk that comes out of them. A queued trim has none of
 * that: it was decided in full while the market was shut, and the only open question is whether it
 * still stands now that the market has moved overnight. So this is a plain "this is what will
 * happen, go / don't", and the sentence differs per verb (queuedAction.contract owns the copy).
 *
 * There is no market-closed gate here. The server's own hours gate is the authority, and it answers
 * `market_closed` by re-queueing the row rather than failing it — a check in this dialog could only
 * ever disagree with that, and would disagree in the direction of blocking something the server
 * would happily have run.
 */
export function QueuedActionDialog({ row, running, error, onConfirm, onCancel }) {
    if (!row) return null
    const copy = confirmCopy(row)

    return (
        <Modal
            ns="queued-action"
            busy={running}
            onClose={onCancel}
            title={copy.title}
            asset={row.asset ?? '—'}
            direction={row.direction ?? undefined}
            footer={<>
                <button
                    className="queued-action__btn queued-action__btn--cancel"
                    onClick={onCancel}
                    disabled={running}
                >Not now</button>
                <button
                    className="queued-action__btn queued-action__btn--confirm"
                    onClick={onConfirm}
                    disabled={running}
                >{running ? 'Working…' : copy.cta}</button>
            </>}
        >
            <p className="queued-action__body">{copy.body}</p>
            {error && (
                <p className="queued-action__error">{EXECUTE_ERRORS[error] ?? error}</p>
            )}
        </Modal>
    )
}

QueuedActionDialog.propTypes = {
    row:       PropTypes.object,
    running:   PropTypes.bool,
    error:     PropTypes.string,
    onConfirm: PropTypes.func.isRequired,
    onCancel:  PropTypes.func.isRequired,
}
