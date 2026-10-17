import { useEffect } from 'react'
import PropTypes from 'prop-types'

import { isHandheld } from '../EntityCard/entityPopup.js'
import { DrawerShell } from '../DrawerShell/DrawerShell.jsx'
import { retainPanel, useDetailPanel } from './detailPanel.store.js'
import './DetailPanel.scss'

// ── The detail panel: one surface for "read this item properly" ──────────────
//
// The Floor's lists are one line per row, and some rows carry a PAGE behind them — a coverage
// thesis with its kill-criteria, an events-radar name with its evidence and Prometheus's read, a
// Pythia assessment. Those used to open as drawers inside the 27%-wide list column, at 10–12px,
// where a page of reading does not fit. This is where they open instead (Roy, 2026-10-13).
//
// WHERE IT LANDS:
//   • desktop — over the CHAT column (DetailPanelSlot), the widest column on screen. Not a modal:
//     the book and the lists stay live beside it, and the chat underneath stays MOUNTED, so a stream
//     in flight is still there when the panel closes. Esc or ✕ closes it; another row replaces it.
//   • handheld (or no slot mounted) — full-screen over the app, like the in-app entity page
//     (EntityDetailHost), and the phone's back gesture closes it.
//
// SAME WINDOW, NEVER A POP-OUT. The content stays rendered by the row that owns it — this is a
// portal, not a hand-off — so every action inside keeps working exactly as it did in the drawer:
// a quick read lands in the list's state, Trade with Mentor seeds the chat, a jump opens another
// event. A pop-out window would be a second copy of the app with none of that wired.
//
// THE SHELL IS SHARED, THE CONTENT IS NOT. Header, close, scroll, sizing and the header's `actions`
// slot (where features every panel gets will go) live here; what the panel says stays with the list
// that owns the item, because only it knows what the item is.

export const SLOT_ID = 'detail-panel-slot'

/** Mounted once, inside `.workspace__chat` — the place a desktop panel docks. */
export function DetailPanelSlot() {
    return <div id={SLOT_ID} className="detail-panel-slot" />
}

export function DetailPanel({ id, kicker = '', title, meta = null, actions = null, className = '', children }) {
    const { isOpen, close } = useDetailPanel(id)

    // Closed with its row — see retainPanel.
    useEffect(() => retainPanel(id), [id])

    // Esc, focus in and back, and a handheld's back gesture are the shared drawer's (DrawerShell).
    const handheld = isOpen && isHandheld()
    const slot = isOpen && !handheld ? document.getElementById(SLOT_ID) : null
    const mode = slot ? 'docked' : 'page'

    return (
        <DrawerShell
            isOpen={isOpen}
            onClose={close}
            portalTo={slot ?? (isOpen ? document.body : null)}
            label={typeof title === 'string' ? title : kicker || 'Detail'}
            className={`detail-panel detail-panel--${mode}${className ? ` ${className}` : ''}`}
            modal={mode === 'page'}
            history={handheld ? { field: 'detailPanel', key: id } : null}
        >
            <header className="detail-panel__head">
                <div className="detail-panel__titles">
                    {kicker && <span className="detail-panel__kicker">{kicker}</span>}
                    <h2 className="detail-panel__title">{title}</h2>
                    {meta && <div className="detail-panel__meta">{meta}</div>}
                </div>
                {actions && <div className="detail-panel__actions">{actions}</div>}
                <button type="button" className="detail-panel__close" onClick={close} aria-label="Close" title="Close (Esc)">
                    ✕
                </button>
            </header>
            <div className="detail-panel__body">{children}</div>
        </DrawerShell>
    )
}

DetailPanel.propTypes = {
    // The store key — unique across the app, chosen by the owning row (`coverage:AAPL`).
    id:        PropTypes.string.isRequired,
    // The desk it came from, small, above the title.
    kicker:    PropTypes.string,
    title:     PropTypes.node.isRequired,
    // The row's chips (rating, verdict, status) — the facts the reader opened it from.
    meta:      PropTypes.node,
    // Header buttons. The slot for what every panel will share.
    actions:   PropTypes.node,
    className: PropTypes.string,
    children:  PropTypes.node,
}
