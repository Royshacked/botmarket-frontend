import PropTypes from 'prop-types'
import { AGENTS, DESKS } from './AxlHub/agentMeta.jsx'
import { LATER_BTN_CLASS } from './LaterButton.jsx'

// The "go to that desk" bubble under a reply that routed — one shell for every panel.
//
// A desk handing the user on (useRouteOffer) is offered, not performed: the reply that carries the
// route is also that desk's last word on the name, and it should be readable before the desk changes
// under them. Axl is the exception and stays one — reception's whole job is to move people, so the
// hub summons on its own after a beat. The label names the desk that will actually open, so a user
// reads "Go to Prometheus · NVDA" and not a pipeline key.
//
// Shared here is the SHELL. What arriving DOES is MainPage's one doorway (handleRoute → the same
// handleAxlPick every hand-off in the app lands on); what a panel does on the way out — clear a
// draft, keep a list — is the panel's, and rides in `onGo`.
export function RouteOffer({ offer, busy = false, onGo, onDismiss }) {
    if (!offer || busy) return null
    const desk = DESKS.find(d => d.key === (offer.edit?.desk ?? offer.route))
    if (!desk) return null
    const brand = AGENTS[desk.entryTab]?.brand ?? desk.label
    return (
        <div className="portfolio-panel__action-bubble">
            <button
                type="button"
                className="portfolio-panel__review-btn portfolio-panel__review-btn--update"
                onClick={() => onGo?.(offer)}
            >
                Go to {brand}{offer.routeSymbol ? ` · ${offer.routeSymbol}` : ''}
            </button>
            <button type="button" className={LATER_BTN_CLASS} onClick={() => onDismiss?.()}>
                Not now
            </button>
        </div>
    )
}

RouteOffer.propTypes = {
    offer:     PropTypes.object,   // { route, routeSymbol, opening, edit } — useRouteOffer's shape
    busy:      PropTypes.bool,     // the panel is still streaming — the offer waits for the reply to land
    onGo:      PropTypes.func,
    onDismiss: PropTypes.func,
}
