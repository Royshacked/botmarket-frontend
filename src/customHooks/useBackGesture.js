import { useEffect, useRef } from 'react'

/**
 * THE PHONE'S BACK GESTURE, for anything that covers the screen (a drawer, a page inside one). While `active`, a history
 * entry on the SAME url carries `{ [field]: key }` on top of the router's own state, so react-router reads its pop as a
 * no-op; popping it calls `onBack`. Any other way out (✕, Esc, a button) steps back over the entry it pushed.
 *
 * Entries NEST (code review 2026-10-31: the Hotlist's row page over its panel): a pop that leaves the state still
 * carrying `[field]: key` was an entry pushed above this one — not this one's — and is left alone.
 * Was DrawerShell's own effect; shared since the Hotlist's row page needed the same.
 *
 * ONE WINDOW SWAPPED FOR ANOTHER IS ONE ENTRY (bug 2026-11-01, Roy: "in mobile — in forecast — when clicking board —
 * nothing happens"). history.back() is ASYNC: the map closed and stepped back, the board opened and pushed its entry in
 * the same click, then the late back landed under the board's entry — which read it as the user's back and closed the
 * board. So the step back is owed for one tick, and an entry of the same `field` opening within it takes over the
 * closing one's entry (replaceState) instead of pushing, and the back is cancelled.
 */
let owed = null   // { field, timer } — the step back a closing entry still owes

export function useBackGesture({ active, field, key, onBack }) {
    const backRef = useRef(onBack)
    backRef.current = onBack
    useEffect(() => {
        if (!active || !field) return undefined
        let popped = false
        const entry = { ...(window.history.state ?? {}), [field]: key }
        if (owed?.field === field && window.history.state?.[field] != null) {
            clearTimeout(owed.timer)
            owed = null
            window.history.replaceState(entry, '')
        } else {
            window.history.pushState(entry, '')
        }
        const onPop = () => {
            if (window.history.state?.[field] === key) return
            popped = true
            backRef.current?.()
        }
        window.addEventListener('popstate', onPop)
        return () => {
            window.removeEventListener('popstate', onPop)
            if (popped || window.history.state?.[field] !== key) return
            // Two closing at once (a row page and its panel): the earlier one's back goes now, as both always did.
            if (owed) { clearTimeout(owed.timer); window.history.back() }
            const timer = setTimeout(() => { if (owed?.timer === timer) owed = null; window.history.back() }, 0)
            owed = { field, timer }
        }
    }, [active, field, key])
}
