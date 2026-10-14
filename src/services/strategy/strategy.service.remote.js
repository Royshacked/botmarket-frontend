import { streamAgent } from '../agentStream'
import { httpService, apiError } from '../http.service'

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
    getWeek,
    runWeek,
    listAssessments,
    getAssessmentDetail,
    getForecastMap,
    getIndustryCompanies,
    assessNow,
    listThemes,
    proposeThemes,
    setThemeStatus,
    assessTheme,
    isRunning,
    runError,
}

// ─── Pythia's long admin runs (code review 2026-10-11) ───────────────────────
// Assess now, Propose themes and a theme's Assess run for up to 10 minutes on the server. Two things went
// wrong with them: the client's default 30-second timeout reported a run that was still going as failed
// (inviting a second paid click), and the busy state lived in the button, so switching tabs and back
// re-armed it. So each run gets a timeout past the server's own, and the in-flight set lives HERE, in the
// module, where a remounted button still sees it. The server refuses a second run too (409).

const LONG_RUN_MS = 11 * 60 * 1000
const _inFlight = new Set()

/** Is this run (`industry:<code>`, `theme:<id>`, `propose_themes`) in flight from this page? */
function isRunning(key) {
    return _inFlight.has(key)
}

async function _longRun(key, fn) {
    if (_inFlight.has(key)) {
        const err = new Error('already running')
        err.code = 'already_running'
        throw err
    }
    _inFlight.add(key)
    try {
        return await fn()
    } catch (err) {
        // A client-side timeout says nothing about the server's run, which may still land.
        if (err?.code === 'ECONNABORTED') err.stillRunning = true
        throw err
    } finally {
        _inFlight.delete(key)
        _announce()
    }
}

/** The words for a failed run: the server's detail, else the shared reader of its error. */
function runError(err) {
    if (err?.code === 'already_running' || err?.response?.status === 409) return 'already running — wait for it to finish'
    if (err?.stillRunning) return 'still running on the server — the board refreshes when it lands'
    const d = err?.response?.data
    return d?.detail ? String(d.detail).slice(0, 200) : apiError(err)
}

/**
 * Pythia's THEMES (backend pythia-assessment.md §3): value chains of GICS sub-industries, each with its
 * assessment. A trader gets the approved ones; an admin also the proposed and retired.
 */
function listThemes() {
    return httpService.get(`${BASE}/themes`)
}

/** Ask Pythia to propose themes now (admin). → `{ proposed, refused, skipped, cost_usd }`. */
function proposeThemes(max) {
    return _longRun('propose_themes', () => httpService.post(`${BASE}/themes/propose`, max ? { max } : {}, { timeout: LONG_RUN_MS }))
}

/** Approve or retire a theme (admin). */
async function setThemeStatus(id, status, note = null) {
    const r = await httpService.post(`${BASE}/themes/${encodeURIComponent(id)}/status`, { status, note })
    _announce()
    return r
}

/** Assess one approved theme now (admin). → `{ ok, outcome, doc, cost_usd }`. */
function assessTheme(id) {
    return _longRun(`theme:${id}`, () => httpService.post(`${BASE}/themes/${encodeURIComponent(id)}/assess`, {}, { timeout: LONG_RUN_MS }))
}

/**
 * Pythia's ASSESSMENTS (backend docs/design/pythia-assessment.md): every assessed industry's verdict —
 * interesting to trade, to invest in, to watch, or to avoid — and the track record of the graded calls.
 * → `{ assessments, record }`. LIGHT rows (backend assessment-light-list.md): only what a closed row shows — an opened
 * row reads the rest through getAssessmentDetail.
 */
function listAssessments() {
    return httpService.get(`${BASE}/assessments?view=rows`)
}

/** One assessment whole, for an opened row: an industry by its code, a theme by its id. → the document, or null. */
function getAssessmentDetail(row) {
    const s = row?.subject ?? {}
    return s.kind === 'theme'
        ? httpService.get(`${BASE}/assessments/theme/${encodeURIComponent(s.id)}`)
        : httpService.get(`${BASE}/assessments/${encodeURIComponent(s.code)}`)
}

/**
 * The Forecasts heat map (Roy, 2026-10-14): every sub-industry's latest move against the market, Pythia's verdict
 * where there is one, and how many of its names Prometheus covers. → `{ asof, tiles, unmapped }`.
 */
function getForecastMap() {
    return httpService.get(`${BASE}/map`)
}

/** One sub-industry's companies, largest first, each marked covered. → `{ code, name, level, level_name, companies }`. */
function getIndustryCompanies(code) {
    return httpService.get(`${BASE}/industries/${encodeURIComponent(code)}/companies`)
}

/**
 * Assess one industry now (admin) — a few minutes of research. → `{ ok, outcome, doc, call, cost_usd }`;
 * a refused or failed run rejects with the same body. Announces so the board refetches.
 */
function assessNow(code) {
    return _longRun(`industry:${code}`, () => httpService.post(`${BASE}/assessments/${encodeURIComponent(code)}/run`, {}, { timeout: LONG_RUN_MS }))
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
 * Pythia's latest WEEK (backend pythia-assessment.md §8): what the change scan flagged and why, what was assessed
 * with its outcome, what waits for next week. Null before the first one. An admin's copy carries the spend and
 * `running` (a week in progress on the server).
 */
function getWeek() {
    return httpService.get(`${BASE}/weekly`)
}

/**
 * Run the week now (admin). The server answers at once (202) and works for many minutes; the board follows it
 * through getWeek. `force` runs a finished week again — the scan then flags only what is still due.
 */
async function runWeek({ force = false } = {}) {
    const r = await httpService.post(`${BASE}/weekly/run`, force ? { force: true } : {})
    _announce()
    return r
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
