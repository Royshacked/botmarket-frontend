// The Forecasts heat map's arithmetic (Roy, 2026-10-14). Pure — the panel (ForecastPanel.jsx) renders what these say.
//
// A tile's COLOUR is how far the sub-industry has moved against the market over the chosen window; Pythia's verdict
// is a badge ON the colour, never the colour itself — the verdicts are not a scale (swing and long term are different
// books, not more and less bullish), so painting them on one gradient would say something Pythia never said.

import { verdictKey } from '../Radar/assessmentWords.js'

/** The windows a reader can colour by. `scale` is the move that reads as full colour in that window. */
export const WINDOWS = [
    { key: 'rel_1m',     label: '1m',  long: '1-month',  scale: 0.10 },
    { key: 'rel_3m',     label: '3m',  long: '3-month',  scale: 0.20 },
    { key: 'excess_12m', label: '12m', long: '12-month', scale: 0.40 },
    { key: 'excess_24m', label: '24m', long: '24-month', scale: 0.80 },
]
/** 3 months is the default (Roy, 2026-10-14): the window closest to a swing's horizon. */
export const DEFAULT_WINDOW = 'rel_3m'
export const windowOf = (key) => WINDOWS.find(w => w.key === key) ?? WINDOWS[1]

/** The verdict filters; `all` shows every tile at full strength. No case has no chip — it is what the rest is. */
export const FILTERS = [
    { key: 'all',       label: 'All' },
    { key: 'swing',     label: 'For swing' },
    { key: 'long_term', label: 'For long term' },
    { key: 'watch',     label: 'Watch' },
    { key: 'avoid',     label: 'Avoid' },
]
const BADGE = { swing: 'S', long_term: 'L', watch: 'W', avoid: 'A' }

/** A tile's verdict in today's word, or null when Pythia has not assessed it. */
export const tileVerdict = (tile) => (tile?.assessment?.verdict ? verdictKey(tile.assessment.verdict) : null)

/** The corner badge letter — none for no case or an unassessed tile. */
export const badgeOf = (tile) => BADGE[tileVerdict(tile)] ?? null

/** The tile's move in the window, or null. */
export const moveOf = (tile, windowKey) => {
    const v = tile?.moves?.[windowKey]
    return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * How strongly to colour a move: -4..4 (sign = direction), 0 for a move too small to tint, null with no number. A
 * quarter of the window's scale per step, capped at full colour.
 */
export function heatLevel(v, scale) {
    if (typeof v !== 'number' || !Number.isFinite(v) || !(scale > 0)) return null
    const frac = Math.abs(v) / scale
    if (frac < 0.125) return 0
    return Math.sign(v) * Math.min(4, Math.ceil(frac * 4))
}

/** "+12%" / "−4%" / "—". */
export function pctText(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return '—'
    const r = Math.round(v * 100)
    return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r)}%`
}

/** An assessment past its reassessment date is shown faded — due, not current. */
export function isStale(tile, now = Date.now()) {
    const e = tile?.assessment?.expires_at
    return Boolean(e) && Date.parse(e) <= now
}

export const matchesFilter = (tile, filter) => !filter || filter === 'all' || tileVerdict(tile) === filter

/**
 * Tiles by GICS sector, then — inside a sector — siblings of one GICS industry side by side, then by name. Each
 * sector carries its verdict counts and its covered-name count. Sectors alphabetical; a tile with no sector last.
 */
export function groupBySector(tiles) {
    const by = new Map()
    for (const t of tiles ?? []) {
        const s = t?.sector ?? 'Unclassified'
        if (!by.has(s)) by.set(s, [])
        by.get(s).push(t)
    }
    const str = (v) => String(v ?? '')
    return [...by.entries()]
        .sort(([a], [b]) => (a === 'Unclassified') - (b === 'Unclassified') || a.localeCompare(b))
        .map(([sector, list]) => {
            const counts = { swing: 0, long_term: 0, watch: 0, avoid: 0 }
            let covered = 0
            for (const t of list) {
                const v = tileVerdict(t)
                if (v in counts) counts[v]++
                covered += t.covered ?? 0
            }
            const sorted = [...list].sort((a, b) => str(a.industry).localeCompare(str(b.industry)) || str(a.name).localeCompare(str(b.name)))
            return { sector, tiles: sorted, counts, covered }
        })
}

const COUNT_WORD = { swing: 'swing', long_term: 'long term', watch: 'watch', avoid: 'avoid' }
/** "2 swing · 1 avoid · 3 covered" — only what is there. */
export function sectorLine({ counts, covered }) {
    const parts = Object.entries(counts).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${COUNT_WORD[k]}`)
    if (covered > 0) parts.push(`${covered} covered`)
    return parts.join(' · ')
}

/** "$412B" / "$3.1B" / "$640M" / "" */
export function capText(v) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return ''
    if (v >= 1e11) return `$${Math.round(v / 1e9)}B`
    if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
    return `$${Math.round(v / 1e6)}M`
}
