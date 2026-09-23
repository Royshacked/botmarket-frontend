// ── Monitor-journal reading helpers ────────────────────────────────────────────
// The pure half of TalosJournal.jsx, kept beside it (like tradeIdea.utils.js beside the cards):
// a module that exports both components and plain functions breaks Fast Refresh for every importer.

import { isTerminal, isUnarmed } from '../../services/entityStatus.js'

/**
 * Round over-precise prices inside a journal string — the model sometimes emits raw floats like
 * "33.2445543465656" in its prose. Cap decimals by magnitude (equities 2dp, forex ~4dp, sub-$1 6dp)
 * and only ever SHORTEN (min with the actual count) so clean numbers like "33.24" or "4.5%" are
 * left untouched. Matches only numbers with 3+ decimals, so integers and short decimals are skipped.
 */
export function tidyPrices(text) {
    if (!text) return text
    return text.replace(/\d+\.\d{3,}/g, (m) => {
        const n = Number(m)
        if (!Number.isFinite(n)) return m
        const abs = Math.abs(n)
        const cap = abs >= 10 ? 2 : abs >= 1 ? 4 : 6
        return n.toFixed(Math.min(m.split('.')[1].length, cap))
    })
}

/**
 * The first sentence of a monitor's prose, or null.
 *
 * Both monitors write for a JOURNAL — a `read` is a sentence, an `edit_proposal.why` is sometimes
 * several. The re-draw doorways quote that reason back as the user's own opening turn (redrawAsk /
 * remapAsk), and a pasted paragraph stops reading as something a person would have typed. Lives
 * here, with tidyPrices, because it is the same kind of thing: monitor prose, made fit to show.
 *
 * The terminator must be followed by whitespace or the end, so a price ("closed at 241.5, past…")
 * is never mistaken for a full stop.
 */
export function firstSentence(text) {
    const s = String(text ?? '').trim()
    if (!s) return null
    const cut = s.search(/[.!?](\s|$)/)
    return (cut > 0 ? s.slice(0, cut) : s).trim() || null
}

/**
 * A guard as one short human line: "↑311.5" / "↓305" / "@312".
 *
 * The arrow carries the direction because a level with no side reads as a number rather than as a
 * crossing, and that distinction is the whole of what a guard says. `any` is a TOUCH — reached from
 * either direction — so it takes `@` rather than an arrow it would have to pick a side for.
 */
export function guardLabel(g) {
    if (!g) return null
    // ABSENT MUST NOT BECOME ZERO. `Number(null)` is 0 and 0 is finite, so a plain `Number(g.price)`
    // would read a guard with no price as a level at 0. The backend's `num()` helper exists for this
    // exact trap (services/setup.schema.js); this is its client-side twin.
    const level = g.price == null || g.price === '' ? NaN : Number(g.price)
    if (!Number.isFinite(level)) return null
    const mark = g.direction === 'below' ? '↓' : g.direction === 'any' ? '@' : '↑'
    return `${mark}${level}`
}

/**
 * When Talos looks next, as one short phrase: "in 12 min" · "in 3 h" · "at 13:30" · "Mon 21 Sep,
 * 13:30". Null when the stamp is missing or unreadable.
 *
 * The date is part of the answer past today. A daily setup read on Friday's close parks itself on
 * Monday's, and "at 13:30" for that read is a lie by omission — the user reads it as this afternoon.
 * `now` is injectable so the label is testable.
 */
export function nextReadLabel(iso, now = Date.now()) {
    const ms = Date.parse(iso)
    if (!Number.isFinite(ms)) return null
    const diff = ms - now
    if (diff <= 0) return 'any moment'
    const min = Math.round(diff / 60_000)
    if (min < 60) return `in ${min} min`
    const hr = Math.round(min / 60)
    if (hr < 6)  return `in ${hr} h`
    const then = new Date(ms), today = new Date(now)
    const time = then.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    if (then.toDateString() === today.toDateString()) return `at ${time}`
    return `${then.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`
}

/**
 * The next call — what the head of the journal says above the newest row (TalosJournal.jsx), and
 * what the folded journal's tail says on the setup pop-out. ONE of the two fields is set:
 *
 *   when      armed / awaiting confirm / in position: `next_check_at`, the stamp the monitor wrote
 *             ("in 12 min", "Mon 21 Sep, 13:30"). A NULL stamp on a watched setup is "any moment":
 *             arming and a pre-position edit clear it so the loop picks the setup up on its very
 *             next tick (setups.service), and "—" there read as nothing scheduled right after Arm.
 *   standing  why there is no next call: not armed, or in position with every exit resting
 *             (dormant — nothing to read until an edit adds a rule)
 *
 * Neither on a closed setup. A stale stamp from an earlier arm is NOT shown on an unarmed one —
 * "any moment" over a setup nobody is watching would be a lie.
 */
export function nextCall(setup, now = Date.now()) {
    const ms = setup?.monitor_state ?? {}
    const st = setup?.status
    if (isTerminal(st)) return { when: null, standing: null, tier: null, properIn: null }
    if (isUnarmed(st))  return { when: null, standing: 'not armed', tier: null, properIn: null }
    if (ms.dormant)     return { when: null, standing: 'dormant — every exit rests at the broker', tier: null, properIn: null }
    return {
        when: nextReadLabel(ms.next_check_at, now) ?? 'any moment',
        standing: null,
        // WHAT the next wake actually costs (backend talos.tiers). "next read" stopped meaning one
        // thing on 2026-09-23: a wake is now the full read, a cheap numbers-only check, or nothing
        // at all, and telling someone "next read in 15 minutes" when it is a numbers check sets the
        // wrong expectation about what will have been looked at.
        tier: nextTier(ms),
        // How many closes until the next PROPER look, when that is not the next wake. Null when the
        // next wake is itself the expensive one — there is nothing extra to say.
        properIn: nextTier(ms) === 'expensive' ? null : (Number(ms.expensive_due) || null),
    }
}

/**
 * What the next wake will cost. Mirrors the backend's `tierFor` for the steady-state cases only —
 * a first look, an expiry review and a fired guard are all decided at wake time and cannot be known
 * from here, so this answers the common case and errs towards `expensive`, which is what an unread
 * or freshly-armed setup actually gets.
 */
export function nextTier(ms = {}) {
    if (!(Number(ms.expensive_due) > 0)) return 'expensive'
    return ms.watch ? 'cheap' : 'asleep'
}

/** The next call as one phrase: "next read in 12 min" · "not armed" · null. */
export function nextCallLine(setup, now = Date.now()) {
    const { when, standing, tier } = nextCall(setup, now)
    if (!when) return standing
    return tier === 'expensive' ? `next read ${when}` : `next check ${when}`
}
