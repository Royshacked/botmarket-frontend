// ── Argus's pipeline contract ──────────────────────────────────────────────────
// What this desk accepts, what it emits, and — the part that matters — how it OPENS on what it was
// handed. The brief lives here, with the receiver, not with whoever sent the artifact.
//
// That inversion is the whole reason a pipeline can be reordered. When the sender wrote the brief
// (Atlas's handler composing Argus's opening sentence), the sender had to know the receiver, and
// every hop was a pair. Written here, Argus answers one question — "given a mandate, how do I
// open?" — and the answer is the same whoever asks and wherever the step sits in the chain.
//
// The sender's judgment still crosses: it is in the ARTIFACT (the lens, the industry, the
// constraints, the horizon). This file only decides how to say it in Argus's own job.

import { KIND, firstItem } from '../../services/pipeline/artifact.js'

// A `scan_request` from Kairos: bias + horizon, sometimes a ticker to check rather than discover.
function briefScanRequest(req) {
    const bits = [`direction: ${req.direction}`]
    if (req.style)       bits.push(`horizon: ${req.style}`)
    if (req.period_hint) bits.push(`window: ${req.period_hint}`)
    let msg = req.ticker
        ? `Validate ${req.ticker} for a trade — ${bits.join(', ')}.`
        : `Find me one ticker to trade — ${bits.join(', ')}.`
    if (req.angle_hint) msg += ` Angle: ${req.angle_hint}.`
    // Deliberately no `profile`: the panel already forces 'trading' whenever it is in hand-off mode,
    // and stating the lens in two places is how the two come to disagree.
    return { message: msg }
}

// A `mandate` from Atlas — ONE sleeve. The fan-out hands them over one at a time, because a sleeve's
// ranking only means anything inside its own pond.
//
// This sentence IS the whole brief: Argus never sees Atlas's conversation, so anything the mandate
// decided has to be said out loud here or the screen quietly ranks by its own default instead.
function briefMandate(sr) {
    const bits = [sr.style, sr.cap_band ? `${sr.cap_band}-cap` : null].filter(Boolean)
    // Industry before sector when Atlas named one: it is the binding pond, and burying it after the
    // sector reads as a hint rather than the constraint it is.
    const where = sr.industry
        ? ` in ${sr.industry}${sr.sector ? ` (${sr.sector})` : ''}`
        : (sr.sector ? ` in ${sr.sector}` : '')
    let msg = `Screen for a ${bits.join(' ') || 'quality'} sleeve${where}.`
    if (sr.constraints) msg += ` Constraints: ${sr.constraints}.`
    if (sr.lens)        msg += ` Selection school: ${sr.lens} — echo it back as the list's lens.`
    if (sr.industry)    msg += ` The industry is fixed — screen inside ${sr.industry}, don't widen to the sector.`
    if (sr.note)        msg += ` (${sr.note})`
    return { message: msg, profile: 'investing' }
}

export const scannerContract = {
    agent:   'scanner',
    accepts: [KIND.SCAN_REQUEST, KIND.MANDATE],
    emits:   [KIND.CANDIDATE_LIST],
    // Every hand-off that seeds Argus wants a clean panel — a sleeve's list is its own artifact, and
    // a discovery scan should not open on the last one's transcript. (The desk that SENT them keeps
    // its conversation: only Argus remounts. See scannerResetKey in MainPage.)
    mount:   'fresh',
    // Argus opens on a sentence, so the conveyor delivers the brief as its next turn.
    deliver: 'seed',

    /**
     * @param   {object} artifact  a scan_request or a single-sleeve mandate
     * @returns {{message: string, profile?: string}} the opening turn, plus any panel knob the
     *          brief implies (the lens, which is Argus's own setting and nobody else's to state)
     */
    brief(artifact) {
        const subject = firstItem(artifact) ?? artifact?.context ?? {}
        if (artifact?.kind === KIND.MANDATE)      return briefMandate(subject)
        if (artifact?.kind === KIND.SCAN_REQUEST) return briefScanRequest(subject)
        return null
    },
}
