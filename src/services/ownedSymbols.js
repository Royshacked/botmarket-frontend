import { isTerminal } from './entityStatus.js'

// THE USER'S OWN NAMES — what every list marks (Roy, 2026-10-28: "in all lists, if a name is already in setups or
// portfolio items or in positions, we need some indication"). Built once, in MainPage, from the lists it already holds
// for the workspace on screen (setups and ideas scoped by inWorkspace, positions scoped inside usePositions) — a name is
// marked for the book the user is standing in, never for another workspace's.

/** The three ways a name is the user's, in the order a badge reads them. */
export const OWNED_KINDS = Object.freeze(['position', 'setup', 'portfolio'])
export const OWNED_LABEL = Object.freeze({ position: 'position', setup: 'setup', portfolio: 'portfolio' })

const _sym = (s) => String(s ?? '').trim().toUpperCase()

/**
 * → Map SYMBOL → { position?: true, setup?: n, portfolio?: [names] }. Pure. A closed setup is not one (the trade is
 * over); a holding is an idea with a portfolioId (closed ones are already out of the workspace's ideas); a position
 * is a broker row.
 */
export function ownedSymbols({ setups = [], ideas = [], positions = [] } = {}) {
    const m = new Map()
    const at = (s) => { const k = _sym(s); if (!k) return null; if (!m.has(k)) m.set(k, {}); return m.get(k) }
    for (const p of positions ?? []) { const o = at(p?.symbol); if (o) o.position = true }
    for (const s of setups ?? []) {
        if (!s || isTerminal(s.status)) continue
        const o = at(s.asset ?? s.symbol); if (o) o.setup = (o.setup ?? 0) + 1
    }
    for (const i of ideas ?? []) {
        if (!i?.portfolioId || i.status === 'closed') continue
        const o = at(i.asset ?? i.symbol); if (!o) continue
        const name = i.portfolioName || 'Portfolio'
        o.portfolio = [...new Set([...(o.portfolio ?? []), name])]
    }
    return m
}

/** What a badge shows for one entry, minus `except` (a list of the user's own kind does not mark its own). Pure. */
export function ownedParts(entry, except = []) {
    if (!entry) return []
    const skip = new Set([except].flat())
    return OWNED_KINDS.filter(k => entry[k] && !skip.has(k))
}

/** The badge's hover, in words. Pure. */
export function ownedTitle(entry, parts) {
    return parts.map(k => k === 'position' ? 'an open position'
        : k === 'setup' ? (entry.setup > 1 ? `in ${entry.setup} of your setups` : 'in your setups')
            : `in ${entry.portfolio.length > 1 ? 'your portfolios' : 'your portfolio'} ${entry.portfolio.join(', ')}`).join(' · ')
}
