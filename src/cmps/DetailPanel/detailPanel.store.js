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

// ── A list, then a row of it: one step back (Roy, 2026-10-22) ──
// Since every Floor list opens as a panel (the columns went), a row INSIDE a list panel can open a
// panel of its own — a Pythia industry from the Forecast board. One-open-at-a-time would close the
// list, and with it the row that renders the new panel (a closed DetailPanel unmounts its content),
// so the new panel would vanish as it opened. A CONTAINER panel (a whole list — `container` on the
// DetailPanel) opened over by a non-container is kept UNDER it instead: still mounted, hidden, and
// back on screen when the row's panel closes. One level: a container opened from anywhere replaces
// the stack (switching lists from the strip is a switch, not a step in).
const containers = new Set()
let under = null

/** A DetailPanel that holds a whole list. Returns its release. */
export function registerContainer(id) {
    containers.add(id)
    return () => containers.delete(id)
}

export const activePanel = () => active
/** The list panel kept under the open row panel, or null. */
export const underPanel = () => under

export function openPanel(id) {
    if (!id || active === id) return
    if (containers.has(id)) under = null
    else if (active && containers.has(active)) under = active
    active = id
    // Back where the user came from: the way back is spent.
    returnTo = null
    emit()
}

// ── The way back (Roy, 2026-10-24: "when I finish, I need a way to go back to the list") ──
// A list's hand-off (the Hotlist's "Ask Argus", "Build with Mentor") closes the list and opens a desk in the chat.
// It leaves a note of where it came from; the chat offers "‹ Back to <label>" while the note stands, and opening any
// panel — that one, or another — spends it. The chat also clears it once the user moves on from where the hand-off
// landed (`from` / `at`, kept by the chat; code review 2026-10-24: it stayed on every chat until a reload).
let returnTo = null
/** Leave the way back to a list panel: `{ panel, label, from?, at? }`, or null to clear it. */
export function setReturnTo(next) {
    returnTo = next?.panel ? { ...next, label: next.label ?? 'the list' } : null
    emit()
}
export const returnToPanel = () => returnTo
/**
 * Where the way back stands as the chat moves, `here` being its desk and session. Pure → the way back to keep (the same
 * object when nothing changes), or null to spend it. It notes where the chat was when it appeared (`from`); the first
 * move after that is where the hand-off LANDED (`at`); a move from there — another session, another desk — spends it.
 */
export function nextReturnTo(rt, here) {
    if (!rt) return rt
    if (!rt.from) return { ...rt, from: here }
    if (!rt.at) return here !== rt.from ? { ...rt, at: here } : rt
    return here !== rt.at ? null : rt
}
/** Is a panel's host rendered right now — would opening it show anything? */
export const panelMounted = (id) => mounts.has(id)
/** The way back, or null — re-renders the caller when it changes. */
export function useReturnTo() {
    return useSyncExternalStore(subscribe, returnToPanel, returnToPanel)
}

/**
 * Close `id` — or, with no id, whichever panel is open (and any list kept under it). Closing a panel
 * that is not open is a no-op. Closing a row's panel opened over a list goes back to the list.
 */
export function closePanel(id) {
    if (active === null || (id != null && active !== id)) return
    // Back to the list only while something still renders it (its desk may have gone meanwhile).
    active = id != null && under && under !== id && mounts.has(under) ? under : null
    under = null
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

/** The list panel kept under the open one — re-renders the caller when it changes. */
export function useUnderPanel() {
    return useSyncExternalStore(subscribe, underPanel, underPanel)
}

/** One row's view of the store. */
export function useDetailPanel(id) {
    const isOpen = useActivePanel() === id
    const isUnder = useUnderPanel() === id
    return {
        isOpen,
        // A list kept mounted under a row's panel (see `under` above).
        isUnder,
        open:   () => openPanel(id),
        close:  () => closePanel(id),
        toggle: () => togglePanel(id),
    }
}
