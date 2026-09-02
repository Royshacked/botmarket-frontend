import { streamAgent } from '../agentStream'
import { httpService } from '../http.service'

// Aether (key `aether`): admin-only SSE stream over the channel-graph desk plus three read-only
// broadcast endpoints. No publication step — purely conversational, no artifacts to commit.
//
// The read endpoints mirror the backend GET routes and are UNSCOPED: channel state, regime, and
// name exposure are shared data (Python writes them house-wide), not per-user records.

const BASE = 'api/aether'

export const aetherService = {
    sendStream,
    getChannelState,
    getForecasts,
    getExposure,
    getShockFeed,
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

/** Latest forecasts — null until Phase 6. */
function getForecasts() {
    return httpService.get(`${BASE}/forecasts`)
}

/** Name-level channel exposure — null until Phase 3. */
function getExposure(ticker) {
    return httpService.get(`${BASE}/exposure/${encodeURIComponent(ticker)}`)
}

/** Shock feed — predicted_signals (channel-level) + opportunities (ticker-level, actionable). */
function getShockFeed() {
    return httpService.get(`${BASE}/shock-feed`)
}
