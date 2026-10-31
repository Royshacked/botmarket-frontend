import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'
import { useBackGesture } from '../../customHooks/useBackGesture.js'

// ── The drawer's mechanics, shared (unified-chat plan phase 8b, K5) ──────────
//
// What every surface that opens OVER the app needs and must not get wrong a second way: Esc closes it, focus goes in
// on open and back to the opener on close, a handheld's back gesture closes it, and it renders where its caller says
// (portalled, or in place). The detail panel (DetailPanel) and the side pane (SidePane) are both built on it — share
// the pipe; what each one LOOKS like stays its own.
//
// ESC CLOSES THE TOP ONE. Two can be open at once (a detail panel docked over the chat while Mentor's surface is
// beside it), and one Esc closing both would throw away the one the user was not looking at. Open shells stack in
// the order they opened; only the last one answers Esc.

const open = []

/**
 * @param {{ isOpen: boolean, onClose: Function, portalTo?: Element|null, label?: string, className?: string,
 *           modal?: boolean, autoFocus?: boolean, history?: { field: string, key: string }|null, children?: any }} props
 */
export function DrawerShell({ isOpen, onClose, portalTo = null, label = 'Panel', className = '', modal = false, autoFocus = true, history = null, children }) {
    const ref = useRef(null)
    // The latest close, read at fire time — the listeners below are registered once per opening.
    const closeRef = useRef(onClose)
    closeRef.current = onClose

    useEffect(() => {
        if (!isOpen) return
        const token = {}
        open.push(token)
        // Unless something inside (a confirm dialog, a select) already handled it.
        const onKey = (e) => {
            if (e.key !== 'Escape' || e.defaultPrevented || open.at(-1) !== token) return
            e.preventDefault()
            closeRef.current?.()
        }
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('keydown', onKey)
            const i = open.indexOf(token)
            if (i >= 0) open.splice(i, 1)
        }
    }, [isOpen])

    // Focus into the shell on open and back to whatever had it on close — the opener, normally — so a keyboard
    // reader is not stranded behind a surface they cannot Tab into. Only when focus would otherwise be lost (it was
    // in the shell, which is gone): a click on another row has already put focus where the user wants it.
    // `autoFocus` false leaves focus where it is: a docked pane that opens on its own (the floor moved) must not pull
    // the user out of the chat input mid-sentence (phase 8b CR).
    useEffect(() => {
        if (!isOpen) return
        const before = document.activeElement
        const node = ref.current
        if (autoFocus) node?.focus({ preventScroll: true })
        return () => {
            const now = document.activeElement
            const lost = !now || now === document.body || node?.contains(now)
            if (lost && before?.isConnected) before.focus?.({ preventScroll: true })
        }
    }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps -- autoFocus is read at open

    // The phone's back gesture closes it, as it closes the in-app entity page (useBackGesture: a history entry on the
    // same url; any close that was not that pop — ✕, Esc, another row — steps back over the entry it pushed).
    useBackGesture({ active: isOpen, field: history?.field ?? null, key: history?.key ?? null, onBack: () => closeRef.current?.() })

    if (!isOpen) return null
    const node = (
        <section ref={ref} className={className} role="dialog" aria-modal={modal} aria-label={label} tabIndex={-1}>
            {children}
        </section>
    )
    return portalTo ? createPortal(node, portalTo) : node
}

DrawerShell.propTypes = {
    isOpen:    PropTypes.bool.isRequired,
    onClose:   PropTypes.func.isRequired,
    // Where it renders — a slot, or <body> for a full page. Null renders in place.
    portalTo:  PropTypes.object,
    label:     PropTypes.string,
    className: PropTypes.string,
    modal:     PropTypes.bool,
    // Take focus on open (the default) — false for a surface that opens beside what the user is doing.
    autoFocus: PropTypes.bool,
    // A handheld's back gesture: the history-state field it marks its entry with, and its value. Null: no entry.
    history:   PropTypes.shape({ field: PropTypes.string.isRequired, key: PropTypes.string }),
    children:  PropTypes.node,
}
