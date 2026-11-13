// What the work pane is titled — the ITEM being built, never who builds it (backend docs/design/one-axl.md §5, D2,
// 2026-11-13): "NVDA · long swing trade", "Growth book", "NVDA · coverage". Read off the role's state on the session
// (agentState), the same state the surface draws. Nothing open → null, and the caller falls back to the work label
// ("Trade work"). Pure — the tab, the show/hide toggle and the tests all read it here.

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
