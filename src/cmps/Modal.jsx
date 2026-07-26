import PropTypes from 'prop-types'

/**
 * The shared dialog shell: backdrop → centred panel → header (title / × ) → body → footer.
 * Six dialogs hand-rolled this identical structure, and the copies had already drifted —
 * none of them carried `role="dialog"` / `aria-modal`, so every one was invisible to screen
 * readers. Fixing it here fixes it for all of them.
 *
 * `ns` is the BEM namespace the caller's stylesheet already targets ('close-position',
 * 'delete-idea', …) — the shell emits `{ns}__backdrop`, `{ns}`, `{ns}__header` and so on,
 * so no SCSS had to move and each dialog keeps its own look.
 *
 * Backdrop click and the × close, EXCEPT while `busy` — mid-flight requests (placing an
 * order, closing a position) must not be dismissable out from under the user.
 *
 * AuthModal deliberately does NOT use this: it is a blocking gate with no dismiss path.
 *
 * @param {string}   ns        BEM namespace for this dialog's existing styles
 * @param {Function} onClose   backdrop click / × / cancel
 * @param {boolean}  [busy]    request in flight — freezes dismissal
 * @param {node}     [title]   header title content
 * @param {string}   [asset]   renders the standard `{ns}__asset` chip — pass `x ?? '—'`,
 *                             since an undefined value omits the chip entirely
 * @param {string}   [direction] renders the standard `{ns}__direction` chip
 * @param {string}   [label]   accessible name; falls back to `title` when it's a string
 * @param {node}     [footer]  action buttons
 */
export function Modal({ ns, onClose, busy = false, title = null, asset, direction, label, children, footer = null }) {
    const ariaLabel = label ?? (typeof title === 'string' ? title : undefined)

    return (
        <div className={`${ns}__backdrop`} onClick={busy ? undefined : onClose}>
            <div
                className={ns}
                role="dialog"
                aria-modal="true"
                aria-label={ariaLabel}
                onClick={e => e.stopPropagation()}
            >
                <div className={`${ns}__header`}>
                    <span className={`${ns}__title`}>
                        {title}
                        {asset !== undefined && <span className={`${ns}__asset`}>{asset ?? '—'}</span>}
                        {direction && <span className={`${ns}__direction direction--${direction}`}>{direction}</span>}
                    </span>
                    <button className={`${ns}__close`} onClick={onClose} disabled={busy}>×</button>
                </div>

                <div className={`${ns}__body`}>{children}</div>

                {footer && <div className={`${ns}__footer`}>{footer}</div>}
            </div>
        </div>
    )
}

Modal.propTypes = {
    ns:        PropTypes.string.isRequired,
    onClose:   PropTypes.func.isRequired,
    busy:      PropTypes.bool,
    title:     PropTypes.node,
    asset:     PropTypes.string,
    direction: PropTypes.string,
    label:     PropTypes.string,
    children:  PropTypes.node,
    footer:    PropTypes.node,
}
