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
    getChannelState,
    getPredictedChannelState,
    getForecasts,
    getExposure,
    getCandidates,
}

/** Streaming Aether chat. done → { reply }. */
async function sendStream(messages, opts = {}) {
    const { model } = opts
    await streamAgent(BASE, { messages, model }, opts)
}

/** Current channel state snapshot — null until the Python engine has run Phase 1. */
function getChannelState() {
    return httpService.get(`${BASE}/state`)
}

/** News-adjusted predicted channel state between FRED releases — null until B1c has run. */
function getPredictedChannelState() {
    return httpService.get(`${BASE}/predicted-state`)
}

/** Latest forecasts — null until Phase 6. */
function getForecasts() {
    return httpService.get(`${BASE}/forecasts`)
}

/** Name-level channel exposure — null until Phase 3. */
function getExposure(ticker) {
    return httpService.get(`${BASE}/exposure/${encodeURIComponent(ticker)}`)
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
