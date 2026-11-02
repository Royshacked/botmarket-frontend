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

/**
 * The longest a closed window's copy stays. It goes when its animation ENDS (detail-panel-out, 180ms) — a timer of the
 * animation's own length fired before a heavy window's close was even painted (the drive, 2026-11-02: Calendar and the
 * Hotlist showed no way out) — and this is only the fallback, for a copy whose animation never runs.
 */
export const LEAVE_MS = 1000
const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

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

    // Esc, focus in and back, and a handheld's back gesture are the shared drawer's (DrawerShell).
    const handheld = isOpen && isHandheld()
    const slot = isOpen && !handheld ? document.getElementById(SLOT_ID) : null
    const mode = slot ? 'docked' : 'page'
    const shellClass = `detail-panel detail-panel--${mode}${container ? ' detail-panel--list' : ''}${bare ? ' detail-panel--bare' : ''}${className ? ` ${className}` : ''}`

    // THE WAY OUT IS ANIMATED TOO (Roy, 2026-11-02: the Positions window's arrival "on every mounting or unmounting of
    // the detail window" — once, here, for every list and page). Closed — ✕, Esc, the back gesture, another panel —
    // the window stays on screen as an INERT copy playing the arrival backwards until it ends, its content still in it; the
    // store already says closed, so nothing waits on it (the history entry, focus, the next panel). Going UNDER a row's
    // panel is not leaving: that list is kept, hidden, as before.
    //
    // The copy is set IN THE RENDER that closes (React's "adjust state while rendering"), not in an effect after it: an
    // effect let one frame through with no window at all, and the copy then came back at full opacity — Roy saw "a
    // double blink before settling" (2026-11-02).
    const shell = isOpen ? { portalTo: slot ?? document.body, className: shellClass } : null
    const [last, setLast] = useState({ isOpen, isUnder, shell })
    const [leaving, setLeaving] = useState(null)
    if (last.isOpen !== isOpen || last.isUnder !== isUnder || (shell && (shell.portalTo !== last.shell?.portalTo || shell.className !== last.shell?.className))) {
        // Under: hidden, so closed from there (closing everything) it has nothing on screen to animate out.
        const goes = !isOpen && !isUnder && last.isOpen && last.shell && !reducedMotion()
        setLeaving(goes ? last.shell : null)
        setLast({ isOpen, isUnder, shell })
    }
    // The fallback, for a copy whose animation never ends (it goes on animationend — below).
    useEffect(() => {
        if (!leaving) return undefined
        const t = setTimeout(() => setLeaving(null), LEAVE_MS)
        return () => clearTimeout(t)
    }, [leaving])
    const ghost = Boolean(leaving) && !isOpen && !isUnder

    const content = isOpen || isUnder || ghost ? createPortal(children, host) : null

    // Kept under a row's panel: the content stays MOUNTED (it renders that panel), off screen.
    if (isUnder && !isOpen) return <>{content}<HostSlot host={host} className="detail-panel__kept" hidden /></>

    // The bar and the body — the open shell's, or the leaving copy's (never both: the shell renders nothing closed).
    const frame = (
        <>
            {bare
                // A whole Floor list: ONE thin bar, the same on every list (Roy, 2026-10-31: "the header style of calendar
                // should be the header style of all the rest of the lists") — the list's name, its own controls if it has
                // any (the Calendar's months, the Hotlist's days, the map's way back) with what they act on, and the ✕.
                // (2026-10-22 to 10-31 a list without controls had no bar, only a corner ✕.)
                ? (
                    <div className="detail-panel__bar">
                        <span className="detail-panel__title detail-panel__bar-title">{title}</span>
                        {meta && <div className="detail-panel__meta">{meta}</div>}
                        {actions && <div className="detail-panel__actions">{actions}</div>}
                        <button type="button" className="detail-panel__close" onClick={close} aria-label="Close" title="Close (Esc)">✕</button>
                    </div>
                )
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
        </>
    )

    // A fragment in every state, the content first: that fixed spot is what keeps it mounted across open ↔ under.
    return (
        <>
        {content}
        {ghost && createPortal(
            <section className={`${leaving.className} detail-panel--leaving`} aria-hidden="true" inert
                onAnimationEnd={(e) => { if (e.target === e.currentTarget) setLeaving(null) }}>{frame}</section>,
            leaving.portalTo,
        )}
        <DrawerShell
            isOpen={isOpen}
            onClose={close}
            portalTo={slot ?? (isOpen ? document.body : null)}
            label={typeof title === 'string' ? title : kicker || 'Detail'}
            className={shellClass}
            modal={mode === 'page'}
            history={handheld ? { field: 'detailPanel', key: id } : null}
        >
            {frame}
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
