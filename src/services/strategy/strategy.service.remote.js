import { streamAgent } from '../agentStream'
import { httpService } from '../http.service'

// Pythia (key `strategy`) — the industry desk since 2026-10-05: an SSE stream plus the house INDUSTRY
// VIEWS, one per GICS sub-industry (backend docs/design/pythia-industry-questions.md). The stream emits
// DRAFTS in `done` (data.views); publishing one is a separate, explicit act.
//
// NOT owner-scoped. The views are a BROADCAST: the same answers for everyone. Admin-only routes.

const BASE = 'api/strategy'

export const INDUSTRIES_CHANGED = 'strategy-industries-changed'
const _announce = () => window.dispatchEvent(new CustomEvent(INDUSTRIES_CHANGED))

export const strategyService = {
    sendStream,
    listIndustries,
    getIndustry,
    publishIndustry,
}

/** Streaming industry-desk chat. done → { reply, phase, views }. */
async function sendStream(messages, opts = {}) {
    const { model, chatState } = opts
    await streamAgent(BASE, { messages, model, chatState }, opts)
}

/**
 * Every GICS sub-industry: the engine's measured first read (grades, cyclical flag, triggers, the level
 * it is answered at) and, beside it, the house's answer (`view`, null while unanswered).
 */
function listIndustries() {
    return httpService.get(`${BASE}/industries`)
}

/** One sub-industry by its 8-digit GICS code: its measurements and the house view with its trail. */
function getIndustry(code) {
    return httpService.get(`${BASE}/industries/${encodeURIComponent(code)}`)
}

/**
 * Publish a drafted answer. Refused (422) when it does not hold up against the measured numbers — a
 * grade that departs from the code's read without `override_reason`, a grade outside the vocabulary,
 * or a missing rationale.
 */
async function publishIndustry(code, draft) {
    const doc = await httpService.post(`${BASE}/industries/${encodeURIComponent(code)}`, draft)
    _announce()
    return doc
}
