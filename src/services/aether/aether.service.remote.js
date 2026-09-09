import { streamAgent } from '../agentStream'
import { httpService } from '../http.service'

// Aether (key `aether`): admin-only SSE stream over the event-exposure desk plus read-only
// broadcast endpoints. No publication step — purely conversational, no artifacts to commit.
//
// The read endpoints mirror the backend GET routes and are UNSCOPED: channel state, regime, and
// name exposure are shared data (Python writes them house-wide), not per-user records.

const BASE = 'api/aether'

export const aetherService = {
    sendStream,
    getCandidates,
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
 * Start a discovery run. ADMIN ONLY — the server enforces it; the button is merely hidden.
 *
 * Resolves as soon as the run is GOING, not when it finishes: a run is minutes of Opus
 * calls and EDGAR requests. 409 means one is already in flight, which is an answer rather
 * than a failure, so the caller should say so instead of showing an error.
 */
function startDiscovery({ maxRuns = 2, hours = 36, top = 5 } = {}) {
    return httpService.post(`${BASE}/discover`, { maxRuns, hours, top })
}

/** Whether a run is going, and how the last one ended. Admin only. */
function getDiscoveryStatus() {
    return httpService.get(`${BASE}/discover`)
}
