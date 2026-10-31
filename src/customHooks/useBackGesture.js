import { useEffect, useRef } from 'react'

/**
 * THE PHONE'S BACK GESTURE, for anything that covers the screen (a drawer, a page inside one). While `active`, a history
 * entry on the SAME url carries `{ [field]: key }` on top of the router's own state, so react-router reads its pop as a
 * no-op; popping it calls `onBack`. Any other way out (✕, Esc, a button) steps back over the entry it pushed.
 *
 * Entries NEST (code review 2026-10-31: the Hotlist's row page over its panel): a pop that leaves the state still
 * carrying `[field]: key` was an entry pushed above this one — not this one's — and is left alone.
 * Was DrawerShell's own effect; shared since the Hotlist's row page needed the same.
 */
export function useBackGesture({ active, field, key, onBack }) {
    const backRef = useRef(onBack)
    backRef.current = onBack
    useEffect(() => {
        if (!active || !field) return undefined
        let popped = false
        window.history.pushState({ ...(window.history.state ?? {}), [field]: key }, '')
        const onPop = () => {
            if (window.history.state?.[field] === key) return
            popped = true
            backRef.current?.()
        }
        window.addEventListener('popstate', onPop)
        return () => {
            window.removeEventListener('popstate', onPop)
            if (!popped && window.history.state?.[field] === key) window.history.back()
        }
    }, [active, field, key])
}
