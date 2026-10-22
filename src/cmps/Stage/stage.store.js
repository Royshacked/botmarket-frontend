import { useSyncExternalStore } from 'react'

// ── The stage's ORDER — which of its three channels is on top (docs/design/floor-stage.md) ──
//
// The stage is the right half of the chat column on the Floor. Three channels can put something on it — `panel` (a
// list, or an item opened over it: detailPanel.store), `surface` (a desk's working surface: sidePane.store) and
// `chart` (the live chart: chartSurface.service) — and each keeps its own state. This store keeps only their ORDER,
// most recent last: a channel that opens something comes to the front (Roy, 2026-10-22: "if the user asks for a chart
// it appears instead of the list item … closing it, we are back to what was there"). The stage shows the most recent
// channel that holds anything; `visible` is that channel, set by the Stage, so a covered layer's drawer can stand
// aside (Esc goes to the layer on screen).

const CHANNELS = Object.freeze(['panel', 'surface', 'chart'])
// `staged`: a stage is on screen (the Floor on a desktop) — see `closeForHandOff`.
let state = Object.freeze({ order: CHANNELS, visible: null, staged: false })
const subs = new Set()
const set = (next) => { state = Object.freeze(next); subs.forEach(fn => fn()) }
const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn) }
const read = () => state

export const stageState = read

/** A channel opened something: it goes on top. */
export function bringToFront(channel) {
    if (!CHANNELS.includes(channel) || state.order.at(-1) === channel) return
    set({ ...state, order: [...state.order.filter(c => c !== channel), channel] })
}

/** The most recent channel holding something, given which ones do (`{ panel, surface, chart }` → bool). Pure. */
export function topChannel(order, has) {
    for (let i = order.length - 1; i >= 0; i--) if (has[order[i]]) return order[i]
    return null
}

/** The Stage reports what it shows. Null: nothing (or no stage — not the Floor, a phone). */
export function setVisible(channel) {
    if (state.visible !== channel) set({ ...state, visible: channel })
}

export function useStage() {
    return useSyncExternalStore(subscribe, read, read)
}

/**
 * Is `channel` the one on screen? True when no stage decides (another design, a phone): then nothing is covered.
 * Read by the panel's and the pane's drawers, so Esc reaches only the layer the user is looking at.
 */
export function useOnStage(channel) {
    const { visible } = useStage()
    return visible == null || visible === channel
}

/** The Stage says whether it is on screen (mounted, and not a phone). */
export function setStaged(on) {
    if (state.staged !== !!on) set({ ...state, staged: !!on })
}

/**
 * A HAND-OFF from a panel — Build with Mentor, Ask Argus, a calendar row to Mentor, a coverage edit — closes the panel
 * only where it COVERS THE CHAT (another design, a phone): the desk it hands to must not open under it. On the stage it
 * stays: the desk's surface covers it, and closing that surface comes back to it (Roy, 2026-10-22).
 */
export function closeForHandOff(close) {
    if (!state.staged) close?.()
}

/** Tests. */
export function _resetStage() { set({ order: CHANNELS, visible: null, staged: false }) }
