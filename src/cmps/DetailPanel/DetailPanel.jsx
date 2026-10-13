import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'

import { isHandheld } from '../EntityCard/entityPopup.js'
import { closePanel, retainPanel, useDetailPanel } from './detailPanel.store.js'
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
    const panelRef = useRef(null)

    // Closed with its row — see retainPanel.
    useEffect(() => retainPanel(id), [id])

    // Esc closes — unless something inside (a confirm dialog, a select) already handled it.
    useEffect(() => {
        if (!isOpen) return
        const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) close() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, id])

    // Focus into the panel on open and back to whatever had it on close — the row, normally — so a
    // keyboard reader is not stranded in the list behind a panel they cannot Tab into.
    // Only when focus would otherwise be lost (it was in the panel, which is gone): a click on another
    // row has already put focus where the user wants it, and taking it back to the old row is wrong.
    useEffect(() => {
        if (!isOpen) return
        const before = document.activeElement
        const panel = panelRef.current
        panel?.focus({ preventScroll: true })
        return () => {
            const now = document.activeElement
            const lost = !now || now === document.body || panel?.contains(now)
            if (lost && before?.isConnected) before.focus?.({ preventScroll: true })
        }
    }, [isOpen])

    const handheld = isOpen && isHandheld()
    // The phone's back gesture closes it, as it closes the in-app entity page. A history entry on
    // the SAME url, carrying the router's own state so react-router reads the pop as a no-op; any
    // close that was not that pop (✕, Esc, another row) steps back over the entry it pushed.
    useEffect(() => {
        if (!handheld) return
        let popped = false
        window.history.pushState({ ...(window.history.state ?? {}), detailPanel: id }, '')
        const onPop = () => { popped = true; closePanel(id) }
        window.addEventListener('popstate', onPop)
        return () => {
            window.removeEventListener('popstate', onPop)
            if (!popped && window.history.state?.detailPanel === id) window.history.back()
        }
    }, [handheld, id])

    if (!isOpen) return null

    const slot = handheld ? null : document.getElementById(SLOT_ID)
    const mode = slot ? 'docked' : 'page'

    return createPortal(
        <section
            ref={panelRef}
            className={`detail-panel detail-panel--${mode}${className ? ` ${className}` : ''}`}
            role="dialog"
            aria-modal={mode === 'page'}
            aria-label={typeof title === 'string' ? title : kicker || 'Detail'}
            tabIndex={-1}
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
        </section>,
        slot ?? document.body,
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
