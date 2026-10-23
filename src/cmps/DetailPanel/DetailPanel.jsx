import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'

import { isHandheld } from '../EntityCard/entityPopup.js'
import { DrawerShell } from '../DrawerShell/DrawerShell.jsx'
import { retainPanel, registerContainer, useDetailPanel } from './detailPanel.store.js'
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

// Where the content's host node shows: the open panel's body, or a hidden slot while the panel is kept under. Attached
// before paint, so a panel coming back from under never shows empty for a frame (the SidePane's KeptSlot).
function HostSlot({ host, className, hidden = false }) {
    const ref = useRef(null)
    useLayoutEffect(() => {
        const slot = ref.current
        slot?.appendChild(host)
        return () => { if (host.parentNode === slot) slot.removeChild(host) }
    }, [host])
    return <div ref={ref} className={className} hidden={hidden} />
}
HostSlot.propTypes = { host: PropTypes.object.isRequired, className: PropTypes.string, hidden: PropTypes.bool }

export function DetailPanel({ id, kicker = '', title, meta = null, actions = null, className = '', container = false, bare = false, children }) {
    const { isOpen, isUnder, close } = useDetailPanel(id)

    // Closed with its row — see retainPanel.
    useEffect(() => retainPanel(id), [id])
    // A whole list: a row's panel opened from it keeps it underneath (detailPanel.store).
    useEffect(() => (container ? registerContainer(id) : undefined), [id, container])

    // THE CONTENT RENDERS IN ONE PLACE IN THE TREE, open or kept under (bug 2026-10-23: a theme from the board's Themes
    // tab never opened). It used to render inside the shell's body when open and inside a hidden div when kept — two
    // different trees, so going under REMOUNTED the list: the board's tab reset to Assessed, the Themes tab and the row
    // whose panel had just opened unmounted, and retainPanel closed that panel. Now it is portaled into one host node
    // from a fixed spot, and only the node moves — the SidePane's kept tabs, the same mechanism.
    const [host] = useState(() => Object.assign(document.createElement('div'), { className: 'detail-panel__content' }))
    const content = isOpen || isUnder ? createPortal(children, host) : null

    // Kept under a row's panel: the content stays MOUNTED (it renders that panel), off screen.
    if (isUnder && !isOpen) return <>{content}<HostSlot host={host} className="detail-panel__kept" hidden /></>

    // Esc, focus in and back, and a handheld's back gesture are the shared drawer's (DrawerShell).
    const handheld = isOpen && isHandheld()
    const slot = isOpen && !handheld ? document.getElementById(SLOT_ID) : null
    const mode = slot ? 'docked' : 'page'

    // A fragment in every state, the content first: that fixed spot is what keeps it mounted across open ↔ under.
    return (
        <>
        {content}
        <DrawerShell
            isOpen={isOpen}
            onClose={close}
            portalTo={slot ?? (isOpen ? document.body : null)}
            label={typeof title === 'string' ? title : kicker || 'Detail'}
            className={`detail-panel detail-panel--${mode}${container ? ' detail-panel--list' : ''}${bare ? ' detail-panel--bare' : ''}${className ? ` ${className}` : ''}`}
            modal={mode === 'page'}
            history={handheld ? { field: 'detailPanel', key: id } : null}
        >
            {bare
                // A whole Floor list (Roy, 2026-10-22: "without header"): no bar — the list starts at the top, a small ✕ in
                // the corner. A list with controls of its own (the Hotlist's views, the Calendar's months, the map's way
                // back) keeps them in one thin row, with what they act on beside them — the month, the map's industry —
                // since ‹ › with no month named is a control with nothing to say.
                ? (actions || meta
                    ? (
                        <div className="detail-panel__bar">
                            <span className="detail-panel__title detail-panel__bar-title">{title}</span>
                            {meta && <div className="detail-panel__meta">{meta}</div>}
                            {actions && <div className="detail-panel__actions">{actions}</div>}
                            <button type="button" className="detail-panel__close" onClick={close} aria-label="Close" title="Close (Esc)">✕</button>
                        </div>
                    )
                    : <button type="button" className="detail-panel__close detail-panel__close--corner" onClick={close} aria-label="Close" title="Close (Esc)">✕</button>)
                : (
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
                )}
            <HostSlot host={host} className="detail-panel__body" />
        </DrawerShell>
        </>
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
    // A whole list (a Floor list), not one item: a row's panel opened from it keeps it under; it takes the full width.
    container: PropTypes.bool,
    // No header bar — a corner ✕ (and the list's own controls, if any, in one thin row). The title still names the
    // dialog for a screen reader.
    bare:      PropTypes.bool,
    children:  PropTypes.node,
}
