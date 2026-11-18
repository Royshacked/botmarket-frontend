import { useEffect, useRef } from 'react'

// ESC CLOSES THE TOP ONE (moved out of DrawerShell, 2026-11-17). Surfaces that open over the app stack in the order
// they opened; only the last one answers Esc, and only when nothing inside it already handled the key.

const open = []

/**
 * Join the Esc stack: while `isOpen`, this layer answers Esc when it is the most recently opened one, and only when
 * nothing inside already handled the key. DrawerShell uses it; so does any surface that draws its own frame but opens
 * over the app the same way (the Messages drawer, SocialChat — drive:all 2026-11-17: it ignored Esc, and a listener of
 * its own outside this stack let the panel BEHIND it answer first).
 */
export function useEscapeLayer(isOpen, onClose) {
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
}
