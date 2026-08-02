// How fast the model is currently reasoning, as a 0–1 intensity.
//
// Thinking deltas already stream live (the provider forwards every `thinking_delta`), but nothing
// surfaced them as ACTIVITY — the status chip showed a flat "thinking…" whether the model was deep
// in a chain of thought or simply waiting on a slow tool. Those look identical from outside and feel
// very different: one is progress, the other is a stall.
//
// Kept out of the hook, and out of React, for two reasons: it is the only part with real logic, and
// deltas arrive far faster than anything should re-render. The hook samples into a ref and reads
// this on a slow timer, so render rate is decoupled from token rate.

// Chars/sec that reads as "flat out". Picked from observed streams rather than theory: thinking runs
// well above this in bursts, and pinning the top of the scale lower makes ordinary reasoning sit at
// full tilt, which tells the user nothing.
const FULL_TILT_CPS = 150

// A gap longer than this means reasoning has stopped rather than paused — the model moved on to a
// tool call or to the visible reply. Long enough to ride out the natural stutter between deltas.
const IDLE_MS = 1200

// The rolling window the rate is measured over. Short enough to feel live, long enough that one
// large delta doesn't spike the reading.
const WINDOW_MS = 2000

/** Drop samples that have fallen out of the window. Mutates for cheapness — it runs on every tick. */
export function pruneSamples(samples, now, windowMs = WINDOW_MS) {
    while (samples.length && now - samples[0].t > windowMs) samples.shift()
    return samples
}

/**
 * Intensity of the reasoning happening right now.
 * @returns {number|null} 0–1 while reasoning is streaming, null when it is not.
 *
 * Never returns 0: a real but slow trickle must still be visibly alive, or the pulse reads as
 * "stopped" at exactly the moment the model is thinking hardest about something difficult.
 */
export function reasoningPulse(samples = [], now = Date.now()) {
    if (!samples.length) return null
    const last = samples[samples.length - 1]
    if (now - last.t > IDLE_MS) return null

    const inWindow = samples.filter(s => now - s.t <= WINDOW_MS)
    if (!inWindow.length) return null

    const chars = inWindow.reduce((sum, s) => sum + s.n, 0)
    // Measure against the elapsed span, not the full window: in the first moments of a burst only
    // 200ms have passed, and dividing by 2s would report a fifth of the true rate.
    const spanMs = Math.max(250, now - inWindow[0].t)
    const cps    = chars / (spanMs / 1000)
    return Math.min(1, Math.max(0.12, cps / FULL_TILT_CPS))
}
