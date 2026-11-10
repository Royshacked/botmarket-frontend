// The rules Argus's surface draws by — pure, so each is tested on its own (unified-chat plan phase 8d). Moved from
// ScannerPanel with their reasons; the panel is gone, the rules are the same.

// Famous scan angles (the "what") — thesis picks for the opening. `label` is what the user sees; `phrase` is the noun
// phrase composed into the message so Argus slots it in as the scan's angle. Multi-select: several combine into one
// scan (false breaks + cyclic windows). The user can always type any other thesis.
export const ANGLES = [
    { label: 'Momentum',           phrase: 'momentum setups' },
    { label: 'Breakouts',          phrase: 'breakout setups' },
    { label: 'False breaks',       phrase: 'false breakouts / failed breakdowns' },
    { label: 'Cyclic windows',     phrase: 'recurring-interval price cycles (repeating peak-to-trough timing)' },
    { label: 'Calendar patterns',  phrase: 'seasonal / calendar patterns (time-of-year tendencies)' },
    { label: 'Top movers',         phrase: 'today\'s top movers' },
    { label: 'Squeeze plays',      phrase: 'short-squeeze candidates' },
    { label: 'Sector rotation',    phrase: 'sector-rotation plays' },
    { label: 'Oversold bounce',    phrase: 'oversold bounce setups' },
]

/**
 * The message the chosen angles compose. One angle → "Scan for X"; several → the intersection thesis ("names that fit
 * both / all of these"), so Argus looks for names satisfying every selected setup.
 */
export function anglePrompt(labels) {
    const phrases = ANGLES.filter(a => labels.includes(a.label)).map(a => a.phrase)
    if (phrases.length === 0) return ''
    if (phrases.length === 1) return `Scan for ${phrases[0]}`
    const tail = phrases.length === 2 ? 'names that fit both angles' : 'names that fit all of these angles'
    return `Scan for ${phrases.join(' + ')} — ${tail}`
}

// What a flag means on a kept name. Every one of these is a name that SURVIVED the Prometheus read: the flag is the
// caveat it carries, never a rejection — those are reported separately and are gone from the list.
export const READ_FLAG = {
    unclear:   'unsettled',
    direction: 'direction?',
    unread:    'not read',
    // Not one of the read's own flags — derived here, because only this side knows both directions. Argus emits the
    // direction the TAPE supports; the read answers the direction the RECORD supports across every event naming the
    // name. The arrow stays Argus's (the tape is what you would trade) and the disagreement rides beside it.
    side:      'record disagrees',
}

/**
 * The flag a kept candidate wears: the read's own, or — failing that — a direction the record settled the other way
 * from the tape. The read's flags win: "we could not settle it" is a bigger caveat than "we settled it differently".
 */
export function readFlagFor(c) {
    if (c?.prometheus?.flag) return c.prometheus.flag
    const tape   = c?.direction
    const record = c?.prometheus?.direction
    const settled = record === 'long' || record === 'short'
    return settled && (tape === 'long' || tape === 'short') && tape !== record ? 'side' : null
}

const DROP_REASON = { contradicted: 'contradicted', priced_in: 'priced in' }

/**
 * "MOS and 2 more contradicted, APD priced in" — the names, because a count alone is unarguable. A dropped row is the
 * server's (`verdict` on the row, scanner.actions.applyRead); a raw read row nests it under `read`.
 */
export function summariseDropped(dropped = []) {
    const by = {}
    for (const d of dropped) {
        const verdict = d.verdict ?? d.read?.verdict
        const k = verdict === 'priced_in' ? 'priced_in' : verdict === 'contradicted' ? 'contradicted' : 'short'
        ;(by[k] ??= []).push(d.ticker)
    }
    return Object.entries(by)
        .map(([k, names]) => `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` +${names.length - 3}` : ''} ${DROP_REASON[k] ?? 'short'}`)
        .join('; ')
}

/** The list's tickers as one key — the read belongs to exactly this list (a re-emitted list is read again). */
export const listKey = (scan) => (scan?.candidates?.length ? scan.candidates.map(c => String(c?.ticker ?? '').toUpperCase()).join(',') : null)
