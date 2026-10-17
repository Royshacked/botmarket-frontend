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

const EMPTY = { tabs: [], active: null, pinned: false, parked: [] }
let state = Object.freeze({ ...EMPTY })
const subs = new Set()
const set = (next) => { state = Object.freeze(next); subs.forEach(fn => fn()) }
const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn) }
const read = () => state

export const sidePaneState = read

/** Open `agent`'s surface and show it. `{ follow: true }` is the floor moving — a pinned tab is not taken over. */
export function openSurface(agent, { follow = false } = {}) {
    if (!agent) return
    const tabs = state.tabs.includes(agent) ? state.tabs : [...state.tabs, agent]
    const keep = follow && state.pinned && state.active && state.active !== agent
    if (tabs === state.tabs && (keep || state.active === agent)) return
    set({ ...state, tabs, active: keep ? state.active : agent })
}

/** Close one tab; the pane shows the tab before it, and closes when it was the last. */
export function closeSurface(agent) {
    const i = state.tabs.indexOf(agent)
    if (i < 0) return
    const tabs = state.tabs.filter(t => t !== agent)
    const active = state.active === agent ? (tabs[i - 1] ?? tabs[0] ?? null) : state.active
    set({ tabs, active, pinned: active ? state.pinned && state.active !== agent : false, parked: state.parked.filter(t => t !== agent) })
}

/** Close the pane — every tab; the ones closed over are parked (a kept surface stays mounted, hidden). */
export function closePane() {
    if (!state.tabs.length) return
    set({ tabs: [], active: null, pinned: false, parked: [...new Set([...state.parked, ...state.tabs])] })
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
