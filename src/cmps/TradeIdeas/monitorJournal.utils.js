// ── Monitor-journal reading helpers ────────────────────────────────────────────
// The pure half of MonitorJournal.jsx, kept beside it (like tradeIdea.utils.js beside the cards):
// a module that exports both components and plain functions breaks Fast Refresh for every importer.

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
 * One entry, read through BOTH field vocabularies. Talos briefly wrote `{kind, next_at, read}` where
 * Hermes writes `{reason, next_check_at, note}`, and those entries are still in live docs — so a
 * setup armed before the shared builder renders instead of showing a blank bubble. They age out of
 * the journal cap on their own; this tolerance can go with them.
 */
export function readEntry(e) {
    return {
        at:      e?.at ?? null,
        reason:  e?.reason ?? e?.kind ?? 'wake',
        price:   e?.price ?? null,
        verdict: e?.verdict ?? null,
        note:    e?.note ?? e?.read ?? null,
        fetched: e?.fetched ?? null,
        axes:    e?.axes ?? null,
        // The guard half (docs/desks/talos-guards.md). Absent on every entry written before guards
        // and on every wake that had nothing to say about them — the backend omits rather than nulls
        // them, so `?? null` is what makes both eras read the same here.
        fired:   e?.fired ?? null,
        armed:   Array.isArray(e?.armed) ? e.armed : null,
        skipped: Number(e?.skipped) > 0 ? Number(e.skipped) : 0,
    }
}

/**
 * A guard as one short human line: "↑311.5" / "↓305" / "@312", plus a bare interval for the
 * unconditional heartbeat.
 *
 * The arrow carries the direction because a level with no side reads as a number rather than as a
 * crossing, and that distinction is the whole of what a guard says. `any` is a TOUCH — reached from
 * either direction — so it takes `@` rather than an arrow it would have to pick a side for.
 */
export function guardLabel(g) {
    if (!g) return null
    // ABSENT MUST NOT BECOME ZERO. `Number(null)` is 0 and 0 is finite, so a plain `Number(g.price)`
    // reads an unconditional backstop — which carries no price at all — as a level at 0, and the
    // heartbeat renders as "↑0 after 240m". The backend's `num()` helper exists for this exact trap
    // (services/setup.schema.js); this is its client-side twin.
    const level = g.price == null || g.price === '' ? NaN : Number(g.price)
    if (!Number.isFinite(level)) {
        return Number(g.after_min) > 0 ? `in ${g.after_min}m` : null
    }
    const mark = g.direction === 'below' ? '↓' : g.direction === 'any' ? '@' : '↑'
    // The time term only shows when there IS one: a conjunctive guard is "not before 30m, and only
    // above 305", and hiding the first half would make it read as an immediate interrupt.
    const when = Number(g.after_min) > 0 ? ` after ${g.after_min}m` : ''
    return `${mark}${level}${when}`
}
