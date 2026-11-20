import { MODE_OPTIONS } from '../ChatTimeline/mode.utils.js'

// What the work pane is titled — the ITEM being built, never who builds it (backend docs/design/one-axl.md §5, D2,
// 2026-11-13): "NVDA · long swing trade", "Growth book", "NVDA · coverage". Read off the role's state on the session
// (agentState), the same state the surface draws. Since 2026-11-20 it is the TAB TOOLTIP, not the tab name (paneName,
// below). Nothing open → null. Pure — the tab, the show/hide toggle and the tests all read it here.

const TYPE_WORDS = Object.freeze({
    intraday: 'intraday', day: 'day', short_term_swing: 'short-term swing', swing: 'swing', long_term: 'long-term',
})

const _cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/** The trade being built: "NVDA · long swing trade" — as much of it as is decided. */
function tradeTitle(state) {
    const d = state?.draft
    const asset = String(d?.asset ?? state?.active_asset ?? '').trim().toUpperCase()
    if (!asset) return null
    const dir = d?.direction ? String(d.direction).toLowerCase() : ''
    const type = TYPE_WORDS[d?.type] ?? ''
    return `${asset} · ${[dir, type, 'trade'].filter(Boolean).join(' ')}`
}

/** The book: its plan's name, else its objective ("Growth book"), else what is happening to it. */
function bookTitle(state) {
    const name = String(state?.pendingPlan?.name ?? '').trim()
    if (name) return name
    const objective = String(state?.mandate?.objective ?? '').trim()
    if (objective && objective.split(/\s+/).length <= 3) return `${_cap(objective)} book`
    if (state?.reviewMode) return 'Portfolio review'
    return state?.mandate || state?.pendingPlan ? 'New portfolio' : null
}

const TITLES = {
    mentor:    tradeTitle,
    portfolio: bookTitle,
    analyst:   (s) => (s?.active_symbol ? `${String(s.active_symbol).toUpperCase()} · coverage` : null),
}

/** The item a role's pane holds, or null when it holds nothing nameable yet. */
export function paneTitle(agent, state) {
    try { return TITLES[agent]?.(state ?? null) ?? null } catch { return null }
}

// The NAME on a pane tab and on the chat header's Show/Hide button (style session 2026-11-20, Roy: "trader / portfolio /
// analyst — remove the 'work'"). A builder's tab is the builder, by the mode chip's own short name, so the chip and the
// tab say the same word; the item it holds (paneTitle) moves to the tooltip. Any other pane keeps its own label.
const BUILDER_NAMES = Object.freeze(Object.fromEntries(MODE_OPTIONS.filter(o => o.mode !== 'general').map(o => [o.mode, o.short])))

/**
 * What a pane tab is called: "Trader" / "Portfolio" / "Analyst" for a builder, else `fallback` — the caller's own label
 * for any other pane (the surface's paneLabel, the desk's work). Passed in, so this file stays pure and node-testable.
 */
export function paneName(agent, fallback = null) {
    return BUILDER_NAMES[agent] ?? fallback ?? 'Work'
}

/** The tab's tooltip: the item on it when there is one ("NVDA · long swing trade"), else its name. */
export function paneTooltip(agent, state, fallback = null) {
    return paneTitle(agent, state) ?? paneName(agent, fallback)
}
