// What Talos is DOING to this setup, derived for display. Pure — no React, no fetch.
//
// The monitor runs a three-tier cascade and, until now, the pop-out showed none of it: the user saw
// the plan and a journal of sentences, with no way to tell whether the thing was being watched
// closely, cheaply, or at all. The data was all there; nothing read it.
//
// ONE RULE RUNS THROUGH THIS FILE: report what the monitor actually recorded, never what the
// document merely implies.
//
//   • `armed_zone_id` is NOT "price is in a zone". It is the last zone that TRIPPED, and nothing
//     clears it when price leaves — reading it as a live position-in-band would tell the user a
//     setup is at its entry hours after price walked away.
//   • The honest live signal is the LAST JOURNAL ENTRY, which is the monitor's own account of its
//     most recent wake: `scheduled` means it measured price outside every zone, `zone_trip` means
//     inside one. That is a fact it wrote down, not an inference.
//
// See botmarket-backend/monitoring/talos.monitor.service.js for the tiers themselves.

import { isArmed, isUnarmed } from '../../services/entityStatus.js'
import { tidyPrices } from './monitorJournal.utils.js'

const toNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : null)

// Prices reach this panel straight off the document, and the model's own prose is not the only
// source of over-precise floats — a tick can arrive as 241.20000000000002. The journal already owns
// the rounding, so this uses it rather than growing a second, subtly different one.
const price = (v) => (toNum(v) == null ? null : tidyPrices(String(toNum(v))))

/** The monitor's most recent wake, or null before the first one. */
export function lastWake(setup) {
    const t = setup?.monitor_state?.timeline
    return Array.isArray(t) && t.length ? t[t.length - 1] : null
}

/** Is the setup on the poll — i.e. is any of this running at all? */
export const isWatched = isArmed

/**
 * Does this panel apply at all?
 *
 * The whole cascade answers ONE question — is this the moment to get in — so it is meaningless past
 * entry. It also cannot simply be left on: `monitor_state.last_assessment` is written by the
 * READINESS read and never by the in-position one (that writes `position_state.last_management`), so
 * a live position would sit here showing the read that got it IN, timestamped and captioned as
 * though it were current. The management card above already covers a position; this steps aside.
 */
export const showsWatch = (status) => isArmed(status) || isUnarmed(status)

// What the last wake tells us about where price stood relative to the zones. `null` when the
// monitor has not yet said anything either way (its first wake, or a wake that never looked at
// price — a shut market, a setup that isn't live yet).
const ZONE_STANDING = {
    scheduled:      { inZone: false, text: 'outside every zone' },
    momentum_pulse: { inZone: false, text: 'well outside every zone' },
    zone_trip:      { inZone: true,  text: 'in a zone' },
}

/**
 * The three tiers, each with whether it is live right now and the one fact that makes it legible.
 *
 * Tier 2 reports its ANCHOR rather than a countdown, because that is what it actually is: a price
 * the next material move is measured from, not a timer. A user who can see the anchor can work out
 * for themselves why the monitor is or isn't interested.
 */
export function tiers(setup) {
    const ms      = setup?.monitor_state ?? {}
    const watched = isWatched(setup?.status)
    const wake    = lastWake(setup)
    const standing = ZONE_STANDING[wake?.reason] ?? null

    return [
        {
            key: 'gate', n: 1, name: 'Zone gate',
            // Always on while the setup is polled — it is arithmetic, it costs nothing, and it runs
            // every wake whatever else happens.
            active: watched,
            detail: standing
                ? `price ${standing.text}${price(wake?.price) != null ? ` at ${price(wake.price)}` : ''}`
                : 'waiting for its first look',
        },
        {
            key: 'pulse', n: 2, name: 'Move watch',
            // Only meaningful pre-entry and out of zone: inside a zone the gate above has it, and
            // past entry the position path takes over. Needs a seeded anchor to measure from.
            active: watched && standing?.inZone === false && toNum(ms.pulse_anchor_px) != null,
            detail: price(ms.pulse_anchor_px) != null
                ? `anchored at ${price(ms.pulse_anchor_px)} — a big move from there earns a full read`
                : 'no anchor yet',
        },
        {
            key: 'read', n: 3, name: 'Full read',
            // "Active" means there is an opinion on record, not that a model is running right now.
            active: !!ms.last_assessment,
            // WHAT EARNS ONE, not what it said. The read itself is rendered directly below this
            // list with its verdict, rung and time — repeating any of that here would make the
            // cascade a second, worse copy of the block under it. The escalation RULE is the one
            // thing nothing else on the page says.
            detail: 'paid for when price reaches a zone, or leaves the map',
        },
    ]
}

/**
 * The conditions the last read GRADED, joined back to what they say.
 *
 * The assessment stores only `{id, met, note}` — the wording lives on the setup — so this is the
 * join, and it is keyed on the scenario the read actually judged (`scenario_id`). Using the armed or
 * projected premise instead would print a rival's triggers next to another premise's answers.
 *
 * `met` is three-state on purpose: 'unchecked' means the monitor could not look, which is a reason
 * to go and get the data, where 'no' is a reason to wait. Never collapse them.
 */
export function conditionRows(setup) {
    const last = setup?.monitor_state?.last_assessment
    if (!last) return []

    const scenario = (setup?.scenarios ?? []).find(s => s?.id === last.scenario_id) ?? null
    const declared = [...(setup?.conditions ?? []), ...(scenario?.conditions ?? [])]
    const graded   = new Map((last.conditions ?? []).map(c => [c?.id, c]))

    return declared.map(c => ({
        id:     c.id,
        text:   c.text,
        weight: c.weight === 'primary' ? 'primary' : 'confirming',
        met:    graded.get(c.id)?.met ?? 'unchecked',
        note:   graded.get(c.id)?.note ?? null,
    }))
}

/**
 * How close this is, as a word — the "wait / almost / ready" the user asked for.
 *
 * DERIVED, NOT A VERDICT. Talos's menu is enter|wait|stand_aside|edit|let_expire and anything off it
 * is coerced to `wait` server-side, so "almost" could not be added there without becoming a silent
 * `wait`. It is a reading of the graded conditions instead:
 *
 *   ready   the read said enter.
 *   almost  every PRIMARY trigger is present and it still isn't an enter — either a confirming
 *           condition is short, or Talos declined for something it saw beyond the conditions
 *           (event risk, a broad-market read). Worth surfacing precisely because the plan looks
 *           fulfilled and the answer is still no.
 *   null    nothing to add; the verdict already says it.
 *
 * A setup with no primary condition can never be "almost": there is no trigger to be present, so
 * the claim would rest on nothing.
 */
export function readiness(setup) {
    const last = setup?.monitor_state?.last_assessment
    if (!last?.verdict) return null
    if (last.verdict === 'enter') return 'ready'
    if (last.verdict !== 'wait') return null   // stand_aside / edit / let_expire are their own answer

    const primaries = conditionRows(setup).filter(r => r.weight === 'primary')
    if (!primaries.length) return null
    return primaries.every(r => r.met === 'yes') ? 'almost' : null
}

/**
 * The timeframe the CHART should show: whatever Talos chose to look at next, falling back to the
 * rung the setup was drawn on.
 *
 * The point is that the user sees what the monitor sees. A setup authored on the 1hr whose read has
 * climbed to the 4hr for structure should not be shown an hourly chart while its journal talks
 * about a four-hour close.
 */
export function watchTimeframe(setup) {
    return setup?.monitor_state?.timeframe || setup?.timeframe || 'day'
}
