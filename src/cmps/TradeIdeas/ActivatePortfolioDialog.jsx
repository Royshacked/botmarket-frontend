import PropTypes from 'prop-types'
import { createPortal } from 'react-dom'
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
        <div className="activate-portfolio__backdrop" onClick={onClose}>
            <div className="activate-portfolio" onClick={e => e.stopPropagation()}>
                <div className="activate-portfolio__header">
                    <span className="activate-portfolio__title">
                        Activate portfolio
                        {name && <span className="activate-portfolio__name">{name}</span>}
                    </span>
                    <button className="activate-portfolio__close" onClick={onClose}>×</button>
                </div>

                <div className="activate-portfolio__body">
                    <p className="activate-portfolio__lead">
                        {manual
                            ? <>Posts an entry card for {count === 1 ? 'the leg' : `all ${count} legs`} — you enter each at your own broker and record your fills in social chat. Want Atlas to review the book first?</>
                            : <>This fires {count === 1 ? 'the idea' : `all ${count} ideas`} at market now — the last gate before real exposure. Want Atlas to review the book first?</>
                        }
                    </p>
                </div>

                <div className="activate-portfolio__footer">
                    <button
                        className="activate-portfolio__btn activate-portfolio__btn--review"
                        onClick={onReview}
                        title="Open the portfolio in chat for a pre-activation review"
                    >Review first</button>
                    <button
                        className="activate-portfolio__btn activate-portfolio__btn--activate"
                        onClick={onActivate}
                    >Activate now</button>
                </div>
            </div>
        </div>,
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
