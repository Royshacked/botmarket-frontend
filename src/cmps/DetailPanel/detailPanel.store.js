import { useSyncExternalStore } from 'react'

// ── Which detail panel is open — ONE, across the whole app ───────────────────
//
// The lists that open a DetailPanel (coverage, the events radar's names, Pythia's industries,
// assessments and themes) live in different desks and different components, and each used to hold
// its own `open` flag for an inline drawer. A panel is not inline: they all land in the SAME place
// (the chat column), so two open flags would stack two panels in one corner. The flag moves here,
// keyed by an id the owning row chooses (`coverage:AAPL`, `aether:<run>|<ticker>`, …), and opening
// one is what closes the other.
//
// A module store rather than a context: the openers are spread across trees that share no parent
// short of MainPage, and nothing about "which one is open" belongs in MainPage's state.

let active = null
const subs = new Set()
const emit = () => subs.forEach(fn => fn())
const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn) }

export const activePanel = () => active

export function openPanel(id) {
    if (!id || active === id) return
    active = id
    emit()
}

/** Close `id` — or, with no id, whichever panel is open. Closing a panel that is not open is a no-op. */
export function closePanel(id) {
    if (active === null || (id != null && active !== id)) return
    active = null
    emit()
}

// ── Closed with its row ──
// The row owns the content, so a row that goes away (its desk closed, its event collapsed, the list
// refreshed it out) must take the panel with it — or the store keeps an id nothing renders, and
// reopening the desk springs the panel back open unasked.
//
// COUNTED PER ID, and the close deferred: StrictMode unmounts and remounts every component once in
// development, and a list can replace a row with a new instance under the same id. Either way a
// renderer of that id is mounted again by the time the check runs, and the panel stays.
const mounts = new Map()

/** A DetailPanel for `id` mounted. Returns its release. */
export function retainPanel(id) {
    mounts.set(id, (mounts.get(id) ?? 0) + 1)
    return () => {
        const n = (mounts.get(id) ?? 1) - 1
        if (n > 0) mounts.set(id, n)
        else mounts.delete(id)
        setTimeout(() => { if (!mounts.has(id)) closePanel(id) }, 0)
    }
}

export function togglePanel(id) {
    if (active === id) closePanel(id)
    else openPanel(id)
}

/** The open panel's id, or null — re-renders the caller when it changes. */
export function useActivePanel() {
    return useSyncExternalStore(subscribe, activePanel, activePanel)
}

/** One row's view of the store. */
export function useDetailPanel(id) {
    const isOpen = useActivePanel() === id
    return {
        isOpen,
        open:   () => openPanel(id),
        close:  () => closePanel(id),
        toggle: () => togglePanel(id),
    }
}
