import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { resolveForEdit } from '../../services/entityResolve.js'
import { openEntityPopup } from '../EntityCard/entityPopup.js'

// What each kind is called in a sentence. A `setup` is a setup to the user too.
const SHOW_NOUN = { setup: 'setup' }
// The house views a show opens (Roy, 2026-10-19) — the button's words. Exported: the timeline opens these by
// themselves as the reply ends.
// Since 2026-10-22 every Floor list is one too (Roy: Axl presents them when asked) — each opens its
// window over the chat, the same one its chip in the strip opens.
export const VIEW_LABELS = Object.freeze({
    heatmap:    'Open the forecast heat map',
    calendar:   'Open the calendar',
    positions:  'Open your positions',
    orders:     'Open awaiting orders',
    trades:     'Open your trades',
    portfolios: 'Open your portfolios',
    watchlists: 'Open your watchlists',
    hotlist:    'Open the hotlist',
})

/**
 * The button under a reply that offered to SHOW something (Axl's `<show>`, kept on the row — phase 7, J2).
 *
 *   setup   the setup's own window, through the one opener a card click uses (pop-out on a desktop, the
 *           page on a phone). The entity is READ when the row mounts, not when pressed: a handle that
 *           resolves to nothing draws no button, and the press stays synchronous — which keeps
 *           `window.open` inside the user activation a pop-up blocker looks for.
 *   ticket  the order ticket, with the symbol when the user named one — a screen, not a desk.
 *   heatmap / calendar  the house's two views: the forecast heat map (on a company's industry when the ref names
 *           one) and the month calendar. They open by themselves as the reply ends (ChatTimeline); this
 *           button opens them again.
 *
 * It opens a page and ends nothing, so there is no "Not now" beside it.
 */
export function ShowOffer({ show, onOpenTicket, onOpenView }) {
    const [entity, setEntity] = useState(null)
    const kind = show?.kind
    const ref  = show?.ref

    useEffect(() => {
        if (kind !== 'setup' || !ref) return undefined
        let live = true
        resolveForEdit(kind, ref).then(e => { if (live) setEntity(e ?? null) })
        return () => { live = false }
    }, [kind, ref])

    if (kind === 'ticket') {
        return (
            <div className="portfolio-panel__action-bubble">
                <button type="button" className="portfolio-panel__review-btn portfolio-panel__review-btn--update" onClick={() => onOpenTicket?.(ref ?? null)}>
                    Open the order ticket{ref ? ` for ${ref}` : ''}
                </button>
            </div>
        )
    }
    if (VIEW_LABELS[kind]) {
        return (
            <div className="portfolio-panel__action-bubble">
                <button type="button" className="portfolio-panel__review-btn portfolio-panel__review-btn--update" onClick={() => onOpenView?.(kind, ref ?? null)}>
                    {VIEW_LABELS[kind]}{kind === 'heatmap' && ref ? ` on ${ref}` : ''}
                </button>
            </div>
        )
    }
    if (!entity) return null
    const name = entity.asset || entity.symbol || ''
    return (
        <div className="portfolio-panel__action-bubble">
            <button type="button" className="portfolio-panel__review-btn portfolio-panel__review-btn--update" onClick={() => openEntityPopup(kind, entity)}>
                Open the {name ? `${name} ` : ''}{SHOW_NOUN[kind] ?? 'item'}
            </button>
        </div>
    )
}

ShowOffer.propTypes = {
    show:         PropTypes.shape({ kind: PropTypes.string, ref: PropTypes.string }),
    onOpenTicket: PropTypes.func,
    onOpenView:   PropTypes.func,
}
