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
    getScreen,
    listAssessments,
    assessNow,
    listThemes,
    proposeThemes,
    setThemeStatus,
    assessTheme,
}

/**
 * Pythia's THEMES (backend pythia-assessment.md §3): value chains of GICS sub-industries, each with its
 * assessment. A trader gets the approved ones; an admin also the proposed and retired.
 */
function listThemes() {
    return httpService.get(`${BASE}/themes`)
}

/** Ask Pythia to propose themes now (admin). → `{ proposed, refused, skipped, cost_usd }`. */
async function proposeThemes(max) {
    const r = await httpService.post(`${BASE}/themes/propose`, max ? { max } : {})
    _announce()
    return r
}

/** Approve or retire a theme (admin). */
async function setThemeStatus(id, status, note = null) {
    const r = await httpService.post(`${BASE}/themes/${encodeURIComponent(id)}/status`, { status, note })
    _announce()
    return r
}

/** Assess one approved theme now (admin). → `{ ok, outcome, doc, cost_usd }`. */
async function assessTheme(id) {
    const r = await httpService.post(`${BASE}/themes/${encodeURIComponent(id)}/assess`, {})
    _announce()
    return r
}

/**
 * Pythia's ASSESSMENTS (backend docs/design/pythia-assessment.md): every assessed industry's verdict —
 * interesting to trade, to invest in, to watch, or to avoid — and the track record of the graded calls.
 * → `{ assessments, record }`.
 */
function listAssessments() {
    return httpService.get(`${BASE}/assessments`)
}

/**
 * Assess one industry now (admin) — a few minutes of research. → `{ ok, outcome, doc, call, cost_usd }`;
 * a refused or failed run rejects with the same body. Announces so the board refetches.
 */
async function assessNow(code) {
    const r = await httpService.post(`${BASE}/assessments/${encodeURIComponent(code)}/run`, {})
    _announce()
    return r
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

/**
 * Pythia's latest WEEKLY SCREEN (backend docs/design/industry-screener.md): every sub-industry's verdict —
 * trade it or not, and on which horizon — with the scores behind it. Null when none is published yet.
 */
async function getScreen() {
    try {
        return await httpService.get(`${BASE}/screen`)
    } catch (err) {
        if (err?.response?.status === 404) return null
        throw err
    }
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
