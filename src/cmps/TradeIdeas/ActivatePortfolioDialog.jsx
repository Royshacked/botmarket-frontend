import PropTypes from 'prop-types'
import { createPortal } from 'react-dom'
import { Modal } from '../Modal.jsx'
import './ActivatePortfolioDialog.scss'

/**
 * Pre-activation gate for a portfolio.
 *
 * Portfolio ideas are naked / immediate entries, so activating fires them all at
 * market at once — the last gate before real exposure. Rather than go straight to
 * the broker, offer a final Atlas review of the freshly constructed book:
 *
 *   • Review first — open the portfolio in the Atlas chat in review mode
 *     (a pre-activation review); the book stays pending until it is re-activated.
 *   • Activate now — skip the review and fire every waiting idea at market.
 *
 * Rendered through a portal so the modal escapes the portfolio table row.
 */
export function ActivatePortfolioDialog({ name, count = 0, manual = false, onReview, onActivate, onClose }) {
    return createPortal(
        <Modal
            ns="activate-portfolio"
            onClose={onClose}
            label="Activate portfolio"
            title={<>
                Activate portfolio
                {name && <span className="activate-portfolio__name">{name}</span>}
            </>}
            footer={<>
                <button
                    className="activate-portfolio__btn activate-portfolio__btn--review"
                    onClick={onReview}
                    title="Open the portfolio in chat for a pre-activation review"
                >Review first</button>
                <button
                    className="activate-portfolio__btn activate-portfolio__btn--activate"
                    onClick={onActivate}
                >Activate now</button>
            </>}
        >
            <p className="activate-portfolio__lead">
                {manual
                    ? <>Posts an entry card for {count === 1 ? 'the leg' : `all ${count} legs`} — you enter each at your own broker and record your fills in social chat. Want Atlas to review the book first?</>
                    : <>This fires {count === 1 ? 'the idea' : `all ${count} ideas`} at market now — the last gate before real exposure. Want Atlas to review the book first?</>
                }
            </p>
        </Modal>,
        document.body,
    )
}

ActivatePortfolioDialog.propTypes = {
    name:       PropTypes.string,
    count:      PropTypes.number,
    manual:     PropTypes.bool,
    onReview:   PropTypes.func.isRequired,
    onActivate: PropTypes.func.isRequired,
    onClose:    PropTypes.func.isRequired,
}
