// Echo's pure helpers (backend docs/design/echo-pipeline.md) — the Hotlist's Echo tab's words and numbers. Echo is built to
// the simulator design: every event mapped through the chain, every link scored on six factors (high at 8 of 12), checked
// at the 5th session (the flags), watched, and graded against same-sector stand-ins.

/** The Hotlist's view key for Echo's tab. */
export const ECHO = 'echo'

export const GRADE_HORIZONS = [5, 20, 60, 120]

export const STATUS = {
    framed:   ['Recorded', 'found — the map comes next'],
    mapped:   ['Mapped', 'mapped — the score comes next'],
    scored:   ['Scored', 'scored — the market check runs at its 5th session’s close'],
    watching: ['Watching', 'checked at day 5 — under the wave watch'],
    expired:  ['Expired', 'the effect is absorbed — no new flags'],
}

export const FLAG = {
    underreacted_winner: ['Underreacted', 'a high score and a small move against layer 1 by day 5 — the main target'],
    overreacted_loser:   ['Overreacted', 'a hard drop on slow, indirect damage — a rebound candidate'],
    fully_priced:        ['Priced', 'a big move that matches the score — skip'],
}
export const isFlag = (f) => f === 'underreacted_winner' || f === 'overreacted_loser'

export const FACTORS = [
    ['lockIn', 'Lock-in', 'Demand committed for years (budgets, contracts, capex) scores high; a price spike scores low'],
    ['supplyResponse', 'Supply response', 'New capacity takes years to build scores high; adjusts within a season scores low'],
    ['bottleneck', 'Bottleneck', 'Controls scarce capacity scores high; one of many interchangeable suppliers scores low'],
    ['directness', 'Directness', 'Hits revenue now and measurably scores high; slow or indirect scores low'],
    ['exposure', 'Exposure', 'A large share of revenue rides on the link scores high'],
    ['coverage', 'Coverage', 'Few analysts, filed outside the theme, scores high'],
]

export const TYPE_WORDS = {
    demand_shock: 'demand shock', supply_shock: 'supply shock', policy: 'policy', clinical: 'clinical',
    geopolitical: 'geopolitical', capacity_deal: 'capacity deal', confirmation: 'confirmation',
}
export const words = (s) => String(s ?? '').replace(/_/g, ' ')

/** A signed percent, one decimal: 0.034 → "+3.4%". */
export function pct(x) {
    if (!Number.isFinite(x)) return '—'
    const v = Math.round(x * 1000) / 10
    return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
}
export const tone = (x) => (!Number.isFinite(x) ? 'hot-dim' : x > 0 ? 'hot-up' : x < 0 ? 'hot-down' : '')

/** A link's filing evidence in a few words: a stated share, named, or not. */
export function evidenceWords(f) {
    if (!f) return '—'
    if (f.share) return `${f.share.atLeast ? '>' : ''}${(Math.round(f.share.share * 1000) / 10).toFixed(1)}% of revenue`
    if (f.named === true) return 'named in filings'
    if (f.named === false) return 'not named'
    return '—'
}

/** The validation record in one line — always "so far", never the verdict. */
export function recordLine(report) {
    if (!report?.events) return 'Nothing graded yet — the flags are unproven until the validation has its events.'
    const parts = [20, 60, 120].filter(h => report.horizons?.[h]?.vsStandIns?.n).map(h => {
        const v = report.horizons[h].vsStandIns
        return `${h} sessions: flagged ${pct(v.mean)} vs same-sector stand-ins (${v.n} events)`
    })
    return `${parts.length ? `So far — ${parts.join(' · ')}.` : 'Graded at 5 sessions only so far.'} ${report.walkForward?.note ?? ''}`.trim()
}

/** A linked name's tiles for its page (HotlistRowPage `facts`): the link, the score, the day-5 move, the flag. */
export function linkFacts(l) {
    return [
        ['Link', `${words(l.relation)} · layer ${l.layer}`],
        ['Direction', l.direction],
        ['Score', l.total == null ? '—' : `${l.total} / 12${l.high ? ' · high' : ''}`, l.high ? 'hot-up' : null, 'Six factors, 0–2 each; high at 8'],
        ['Day 5', pct(l.check?.signedMove), tone(l.check?.signedMove), 'Its move vs SPY through the 5th session, signed by its direction'],
        ['Volume', Number.isFinite(l.check?.volume?.day5) ? `${l.check.volume.day5.toFixed(1)}×` : '—', null, 'Day 0 to day 5 against its 20-day average'],
        ['Flag', l.flag ? FLAG[l.flag]?.[0] ?? words(l.flag) : '—', isFlag(l.flag) ? 'hot-up' : null, l.flag ? FLAG[l.flag]?.[1] : undefined],
    ]
}

/** Why Echo linked a name, in one sentence: the event, the link, the reason. */
export function echoLine(ev, l) {
    const who = ev.origin ?? ev.tickers?.[0] ?? 'the origin'
    const what = ev.whatChanged ? `${ev.whatChanged} (${ev.date})` : `${who} on ${ev.date}`
    const why = l.why ? ` — ${String(l.why).replace(/[.\s]+$/, '')}` : ''
    return `${what}; ${l.ticker ?? l.name} is its ${words(l.relation)}${why}.`
}

/**
 * The hand-off to the trader (backend echo-pipeline.md Step 6): a REFERENCE — the event and the name — that the server
 * reads back with the link, its score, its flag and the simulator rules' levels. The flags are long-side leads (a
 * winner's continuation, a loser's rebound).
 */
export function echoHandoff(ev, l) {
    if (!ev?.id || !l?.ticker) return null
    // A REFERENCE only (CR 2026-11-19): the server reads the event, the link, its score, flag and levels back — and its
    // own thesis; a client's words would win over them (`seed.thesis ??=`).
    return { ticker: l.ticker, direction: 'long', thesis: null, echo: { event: ev.id } }
}

/** The day-5 yardstick in words — what it was measured against (layer 1, or the origin when layer 1 was unpriced). */
export function yardLine(checked) {
    const y = checked?.yardstick
    if (!y?.from || !Number.isFinite(y.median)) return `Day-5 check (${checked?.checkDay ?? '—'}): no yardstick — nothing to measure the links against.`
    const what = y.from === 'layer 1' ? `layer 1 (${y.n} name${y.n === 1 ? '' : 's'}) moved` : `${y.from} moved`
    return `Day-5 check (${checked.checkDay}): ${what} ${pct(y.median)} its way — the yardstick.`
}
