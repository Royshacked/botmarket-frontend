import { streamAgent } from '../agentStream'
import { httpService } from '../http.service'

// Aether (key `aether`): admin-only SSE stream over the event-exposure desk plus read-only
// broadcast endpoints. No publication step — purely conversational, no artifacts to commit.
//
// The read endpoints mirror the backend GET routes and are UNSCOPED: a run is a house-layer
// broadcast, the same pattern as the strategy desk's tilt.

const BASE = 'api/aether'

export const aetherService = {
    sendStream,
    getCandidates,
    getScorecard,
    quickRead,
    startDiscovery,
    getDiscoveryStatus,
}

/** Streaming Aether chat. done → { reply }. */
async function sendStream(messages, opts = {}) {
    const { model } = opts
    await streamAgent(BASE, { messages, model }, opts)
}

/**
 * Event candidates, grouped by the event that produced them.
 *
 * Survivors only by default. Every candidate is stored server-side, including the ones
 * a gate dropped and why, but the screen wants the shortlist.
 */
function getCandidates({ days = 30, includeDropped = false } = {}) {
    const q = new URLSearchParams({ days: String(days) })
    if (includeDropped) q.set('includeDropped', 'true')
    return httpService.get(`${BASE}/candidates?${q}`)
}

/**
 * What the names did — graded at expiry by the engine's nightly refresh. Null when the
 * engine has never written a card, which is "the nightly has not run yet", not "empty".
 */
async function getScorecard() {
    try {
        return await httpService.get(`${BASE}/scorecard`)
    } catch (err) {
        if (err?.response?.status === 404) return null
        throw err
    }
}

/**
 * Prometheus's quick read on one name from one event: credible, priced in, or contradicted.
 * A model call — a few cents — on the caller's budget, on the model the caller's AI menu names
 * (the server gates a candidate to an admin and falls back to Sonnet 5). Resolves to the read,
 * which is also attached to the candidate on the next list refresh. Returns the stored read
 * when one exists, so pressing twice costs once.
 */
function quickRead(runId, ticker, { model } = {}) {
    return httpService.post(`${BASE}/quickread`, { run_id: runId, ticker, ...(model ? { model } : {}) })
}

/**
 * Start a discovery run. ADMIN ONLY — the server enforces it; the button is merely hidden.
 *
 * Resolves as soon as the run is GOING, not when it finishes: a run is minutes of Opus
 * calls and EDGAR requests. 409 means one is already in flight, which is an answer rather
 * than a failure, so the caller should say so instead of showing an error.
 */
function startDiscovery({ maxRuns = 5, hours = 168, top = 5 } = {}) {
    return httpService.post(`${BASE}/discover`, { maxRuns, hours, top })
}

/** Whether a run is going, and how the last one ended. Admin only. */
function getDiscoveryStatus() {
    return httpService.get(`${BASE}/discover`)
}
