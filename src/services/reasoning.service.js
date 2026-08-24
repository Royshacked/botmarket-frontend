// The reasoning-segment model — one place, because two layers need it and they must agree.
//
// A turn can contain the thinking of TWO models: the desk's own, and the reasoning sidecar it
// consults for one bounded decision (backend services/deepThink.service.js). They arrive on the
// SAME SSE event, distinguished by a `source` label, and are kept as ordered segments rather than
// one concatenated string — because the chronology (desk thinks → consults → resumes) is the part
// that makes a second model's advice readable instead of looking like the desk contradicting itself.
//
// `useChatStream` builds the list as deltas arrive; `ChatReasoning` renders it. Neither owns the
// shape, so it lives here rather than in whichever of them happened to need it first.

/** The label for thinking with no stated owner — every pre-sidecar caller and payload. */
export const DESK = 'desk'

/**
 * Fold one reasoning delta into the segment list, coalescing runs from the same thinker.
 *
 * Coalescing is what keeps this cheap: deltas arrive many per second, but a turn has a handful of
 * SEGMENTS, so each delta rebuilds an array of ~3 entries whose strings are shared by reference —
 * not a copy of the transcript. A new array (never a mutation) because this goes into React state.
 *
 * @param {null|{source:string,text:string}[]} segments  the list so far
 * @param {string} source  who is thinking
 * @param {string} text    the delta
 * @returns {{source:string,text:string}[]}  a new, non-empty list
 */
export function appendReasoning(segments, source, text) {
    const list = segments ?? []
    const last = list[list.length - 1]
    if (last?.source === source) {
        return [...list.slice(0, -1), { source, text: last.text + text }]
    }
    return [...list, { source, text }]
}

/**
 * Normalize whatever a message carries into segments.
 *
 * Accepts a plain STRING as well: turns persisted before segments existed hold one, and history has
 * to keep rendering rather than silently going blank. Empty-text segments are dropped so a caller
 * never has to decide whether a blank block is worth drawing.
 *
 * @param {null|string|{source:string,text:string}[]} reasoning
 * @returns {{source:string,text:string}[]}
 */
export function toReasoningSegments(reasoning) {
    if (!reasoning) return []
    if (typeof reasoning === 'string') return [{ source: DESK, text: reasoning }]
    return reasoning.filter(s => s?.text)
}
