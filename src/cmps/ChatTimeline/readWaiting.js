// THE READS THIS CHAT IS WAITING ON (Roy, 2026-11-14) — the analyst's research on a name takes minutes in the house's one
// line, and after the trader's one sentence the chat went quiet. The session carries them (backend session.setWaiting:
// set when the read is asked for, its count kept current as runs settle, cleared when it lands); this says them.
//
// By ROLE, never a name (one-axl.md). A line older than STALE_MS is not drawn: a read lost to a restart would otherwise
// say "reading" for ever (the next turn on the name clears or re-sets it).

export const STALE_MS = 6 * 3_600_000

const _time = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const _fresh = (now) => ([, w]) => !(Number.isFinite(w?.since) && now - w.since > STALE_MS)
const _oldest = ([, a], [, b]) => (a.since ?? 0) - (b.since ?? 0)

/**
 * Background work that says ITSELF (the event analyst mapping an event — modes-and-builders.md step 2) → the line UNDER
 * the prompt box, with a build's (Roy, 2026-11-22: "the echo pulsing building was in chat box and not under user prompt
 * box"). `[{ key, text, title }]` — a short line by role; the backend's whole sentence as its title. Oldest first. Pure.
 */
export function behindLines(waiting, now = Date.now()) {
    return Object.entries(waiting ?? {})
        .filter(([, w]) => w?.text && !w.symbol).filter(_fresh(now)).sort(_oldest)
        .map(([key, w]) => ({ key, text: w.kind === 'echo_map' && w.label ? `Event analyst · mapping ${w.label}` : w.text, title: w.text }))
}

/** `waiting` (the session's map) → the analyst's reads, said in the thread: `[{ key, text }]`, oldest first. Pure but for the clock's locale. */
export function readWaitingLines(waiting, now = Date.now()) {
    return Object.entries(waiting ?? {})
        .filter(([, w]) => w?.symbol).filter(_fresh(now)).sort(_oldest)
        .map(([key, w]) => {
            const what = w.kind === 'catalyst' ? 'its catalyst' : 'the business'
            const on = w.horizon ? ` for the ${w.horizon} trade` : ''
            const where = w.running && !w.ahead ? 'reading it now'
                : w.ahead > 0 ? `${w.ahead} name${w.ahead === 1 ? '' : 's'} ahead in line`
                    // A place the backend does not know (a read just queued) is "in line", never claimed as next (CR).
                    : w.ahead === 0 ? 'next in line' : 'in line'
            const asked = Number.isFinite(w.since) ? ` · asked ${_time(w.since)}` : ''
            return { key, text: `The analyst is reading ${w.symbol}${on} (${what}) — ${where}${asked}. The build carries on when it lands.` }
        })
}
