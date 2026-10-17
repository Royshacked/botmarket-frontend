import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'

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
 *           modal?: boolean, history?: { field: string, key: string }|null, children?: any }} props
 */
export function DrawerShell({ isOpen, onClose, portalTo = null, label = 'Panel', className = '', modal = false, history = null, children }) {
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
    useEffect(() => {
        if (!isOpen) return
        const before = document.activeElement
        const node = ref.current
        node?.focus({ preventScroll: true })
        return () => {
            const now = document.activeElement
            const lost = !now || now === document.body || node?.contains(now)
            if (lost && before?.isConnected) before.focus?.({ preventScroll: true })
        }
    }, [isOpen])

    // The phone's back gesture closes it, as it closes the in-app entity page. A history entry on the SAME url,
    // carrying the router's own state so react-router reads the pop as a no-op; any close that was not that pop
    // (✕, Esc, another row) steps back over the entry it pushed.
    const historyField = history?.field ?? null
    const historyKey   = history?.key ?? null
    useEffect(() => {
        if (!isOpen || !historyField) return
        let popped = false
        window.history.pushState({ ...(window.history.state ?? {}), [historyField]: historyKey }, '')
        const onPop = () => { popped = true; closeRef.current?.() }
        window.addEventListener('popstate', onPop)
        return () => {
            window.removeEventListener('popstate', onPop)
            if (!popped && window.history.state?.[historyField] === historyKey) window.history.back()
        }
    }, [isOpen, historyField, historyKey])

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
    // A handheld's back gesture: the history-state field it marks its entry with, and its value. Null: no entry.
    history:   PropTypes.shape({ field: PropTypes.string.isRequired, key: PropTypes.string }),
    children:  PropTypes.node,
}
