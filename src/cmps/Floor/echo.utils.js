// Echo's pure helpers (docs/design/echo-desk.md) — the Hotlist's Echo tab's words and numbers.

/** The Hotlist's view key for Echo's tab. */
export const ECHO = 'echo'

export const ECHO_HORIZONS = [20, 60, 120]

export const STATUS = {
    detected: ['Mapping', 'found tonight — the map comes next'],
    mapped:   ['Mapped', 'the market check runs at its 5th session’s close'],
    late:     ['Missed', 'reached after its 5th session — not mapped, not graded'],
    checked:  ['Grading', 'checked at day 5 — graded at 20, 60 and 120 sessions'],
    done:     ['Graded', 'graded at every horizon'],
}

/** A signed percent, one decimal: 0.034 → "+3.4%". */
export function pct(x) {
    if (!Number.isFinite(x)) return '—'
    const v = Math.round(x * 1000) / 10
    return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
}
export const tone = (x) => (!Number.isFinite(x) ? 'hot-dim' : x > 0 ? 'hot-up' : x < 0 ? 'hot-down' : '')

/** The model's own direction, from the link's note ("confidence high; model's direction gains; …"). */
export function modelDirection(note) {
    return /model's direction (gains|loses|unclear)/.exec(note ?? '')?.[1] ?? null
}

/** Why the direction is what it is: the rule follows the ORIGIN'S MOVE, not the model's reading of the news. */
export function directionLine(ev) {
    const who = ev.origin ?? ev.tickers?.[0] ?? 'The origin'
    const way = ev.effect === 'up' ? 'rose' : 'fell'
    const same = ev.effect === 'up' ? 'gain' : 'lose'
    const other = ev.effect === 'up' ? 'lose' : 'gain'
    return `${who} ${way} on the event, so its suppliers and infrastructure are expected to ${same} with it and its substitutes to ${other}; peers and customers could go either way. Where the model read it differently, its own call is shown beside it.`
}

/** A linked name's tiles for its page (HotlistRowPage `facts`): the link, the rule's direction, day 5, the grades. */
export function linkFacts(l) {
    const own = modelDirection(l.note)
    return [
        ['Link', `${l.relation}${l.layer ? ` · layer ${l.layer}` : ''}`],
        ['Direction', `${l.direction}${own && own !== l.direction ? ` (model: ${own})` : ''}`],
        ['Day 5', pct(l.reaction), tone(l.reaction), 'Against SPY through the 5th session, signed by the direction'],
        ...ECHO_HORIZONS.map(h => [`${h}d`, pct(l.spread?.[h]), tone(l.spread?.[h]), `From the day-5 close to ${h} sessions, against SPY and minus the same-sector stand-ins`]),
    ]
}

/** Why Echo linked a name, in one sentence: the event, the link, the reason. */
export function echoLine(ev, l) {
    const who = ev.origin ?? ev.tickers?.[0] ?? 'the origin'
    const what = `${who} (${(ev.tickers ?? []).join('/') || '—'}) ${ev.effect === 'up' ? 'rose' : 'fell'} on its ${ev.date} results`
    const why = l.why ? ` — ${String(l.why).replace(/[.\s]+$/, '')}` : ''
    return `${what}; ${l.ticker ?? l.name} is its ${l.relation}${why}.`
}

/** The record so far, in one line per horizon graded. */
export function recordLine(record) {
    if (!record) return null
    const parts = ECHO_HORIZONS.filter(h => record[h]?.n).map(h => `${h} sessions: ${pct(record[h].mean)} over ${record[h].n} (${Math.round(record[h].positive * 100)}% positive)`)
    const head = parts.length ? `So far — ${parts.join(' · ')}.` : 'Nothing graded yet.'
    return `${head} The verdict reads once, on the first ${record.verdictAt} events graded at 120 sessions (${record.gradedAt120} so far).`
}
