import { useSyncExternalStore } from 'react'

// ── Which desk surfaces the side pane holds (unified-chat plan phase 8b, K5) ──
//
// The pane opens from two directions: it FOLLOWS THE FLOOR (Mentor takes the floor → Mentor's surface comes up), and
// a doorway opens it on a desk outright (a "fall back to the desk" path, a desk opened with nothing said yet). The
// doorways live all over MainPage and the cards, so — like the detail panel's — the state is a module store rather
// than something threaded through props.
//
//   tabs    the surfaces open, in the order they were opened — one tab per desk
//   active  the one showing
//   pinned  the user pinned the active tab: the floor moving to another desk adds that desk's tab but does not switch
//   parked  tabs the pane was CLOSED over (closePane) — a surface that keeps its own conversation (Pythia, Aether, the
//           ticket — `keepMounted`) stays mounted, hidden, until its own tab is closed (phase 8e)
//   hidden  `{ tabs, active }` the pane was last CLOSED over — what the chat header's toggle brings back (reopenPane).
//           Closing a desk's own tab is "done with it", not hiding it, so it is not remembered; any open clears it.
//   collapsed  ON A PHONE ONLY (Roy, 2026-10-28): the tabs are open — the desk's surface stays mounted, its buttons sit
//           under the chat (ChatActions) — but the sheet is down, so it does not cover the reply. The floor moving opens
//           a desk collapsed; the user raises it (expandPane) and lowers it (collapsePane). A desktop never sets it.

const EMPTY = { tabs: [], active: null, pinned: false, parked: [], hidden: null, collapsed: false }
let state = Object.freeze({ ...EMPTY })
const subs = new Set()
const set = (next) => { state = Object.freeze(next); subs.forEach(fn => fn()) }
const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn) }
const read = () => state

export const sidePaneState = read

/**
 * Open `agent`'s surface and show it. `{ follow: true }` is the floor moving — a pinned tab is not taken over.
 * `{ collapse: true }` (a phone, following the floor): open it collapsed unless the sheet is already up. A doorway — not
 * a follow — is the user asking for the desk: the sheet comes up.
 */
export function openSurface(agent, { follow = false, collapse = false } = {}) {
    if (!agent) return
    const tabs = state.tabs.includes(agent) ? state.tabs : [...state.tabs, agent]
    const keep = follow && state.pinned && state.active && state.active !== agent
    const sheetUp = state.tabs.length > 0 && !state.collapsed
    const collapsed = follow && collapse ? !sheetUp : false
    if (tabs === state.tabs && (keep || state.active === agent) && collapsed === state.collapsed) return
    set({ ...state, tabs, active: keep ? state.active : agent, hidden: null, collapsed })
}

/** A phone: lower the sheet — the desk stays open, its buttons under the chat. */
export function collapsePane() {
    if (state.tabs.length && !state.collapsed) set({ ...state, collapsed: true })
}

/** A phone: raise the sheet — the desk it was lowered over, or (nothing open) as reopenPane. */
export function expandPane(fallback = null) {
    if (state.tabs.length) { if (state.collapsed) set({ ...state, collapsed: false }); return }
    reopenPane(fallback)
}

/** Close one tab; the pane shows the tab before it, and closes when it was the last. */
export function closeSurface(agent) {
    const i = state.tabs.indexOf(agent)
    if (i < 0) return
    const tabs = state.tabs.filter(t => t !== agent)
    const active = state.active === agent ? (tabs[i - 1] ?? tabs[0] ?? null) : state.active
    set({ tabs, active, pinned: active ? state.pinned && state.active !== agent : false, parked: state.parked.filter(t => t !== agent), hidden: null,
        collapsed: tabs.length ? state.collapsed : false })
}

/** Close the pane — every tab; the ones closed over are parked (a kept surface stays mounted, hidden) and remembered. */
export function closePane() {
    if (!state.tabs.length) return
    set({ tabs: [], active: null, pinned: false, parked: [...new Set([...state.parked, ...state.tabs])], hidden: { tabs: state.tabs, active: state.active }, collapsed: false })
}

/**
 * Bring the pane back (the chat header's toggle): the tabs it was closed over, or — nothing remembered — `fallback`'s
 * surface (the desk holding the floor). A no-op while it is open.
 */
export function reopenPane(fallback = null) {
    if (state.tabs.length) return
    const h = state.hidden
    if (h?.tabs?.length) { set({ ...state, tabs: h.tabs, active: h.active ?? h.tabs[0], hidden: null, collapsed: false }); return }
    openSurface(fallback)
}

export function showSurface(agent) {
    if (state.tabs.includes(agent) && state.active !== agent) set({ ...state, active: agent })
}

export function setPinned(pinned) {
    if (state.pinned !== !!pinned && state.active) set({ ...state, pinned: !!pinned })
}

/** The pane's state — re-renders the caller when it changes. */
export function useSidePane() {
    return useSyncExternalStore(subscribe, read, read)
}

/** Back to empty — a new user (MainPage, on sign-in) must not inherit the last one's tabs (8e CR). */
export function resetSidePane() {
    set({ ...EMPTY })
}
/** Tests: the same. */
export const _resetSidePane = resetSidePane
