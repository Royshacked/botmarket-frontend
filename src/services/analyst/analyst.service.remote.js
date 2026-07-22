import { httpService } from '../http.service'
import { API_BASE } from '../config'
import { postSSE, buildStreamHandlers } from '../sse.util'

// Analyst remote service. Mirrors kairos.service.remote: an SSE research stream plus CRUD for the
// artifact (here `coverage`). The stream emits a DRAFT coverage in `done` (data.coverage); the user
// clicks "Initiate coverage" to persist (initiateCoverage). The living book is read via listCoverage.

const BASE = 'api/analyst'

export const analystService = {
    sendStream,
    initiateCoverage,
    listCoverage,
    getCoverage,
    updateCoverage,
    retireCoverage,
}

// Broadcast so every coverage view refreshes.
const COVERAGE_CHANGED = 'analyst-coverage-changed'
function _announceChange() { window.dispatchEvent(new Event(COVERAGE_CHANGED)) }
export { COVERAGE_CHANGED }

// Streaming research chat. `seed` (a structured Argus investing candidate) pre-seeds the research on
// a hand-off turn; `brokerContext` gives the analyst the user's book. done → { reply, phase, coverage }.
async function sendStream(messages, opts = {}) {
    const { model, reasoningEffort, signal, chatState, seed, brokerContext } = opts
    await postSSE(
        `${API_BASE}/${BASE}/stream`,
        { messages, model, reasoningEffort, chatState, seed, brokerContext },
        buildStreamHandlers(opts),
        { signal },
    )
}

// Persist a drafted coverage (initiation is an event — one per name; a duplicate → 409 already_covered).
async function initiateCoverage(coverage) {
    const saved = await httpService.post(`${BASE}/coverage`, { coverage })
    _announceChange()
    return saved
}

async function listCoverage({ sector, status } = {}) {
    try {
        const qs = new URLSearchParams()
        if (sector) qs.set('sector', sector)
        if (status) qs.set('status', status)
        const q = qs.toString()
        const data = await httpService.get(`${BASE}/coverage${q ? `?${q}` : ''}`)
        return Array.isArray(data) ? data : []
    } catch { return [] }
}

async function getCoverage(id) {
    try { return await httpService.get(`${BASE}/coverage/${encodeURIComponent(id)}`) }
    catch { return null }
}

// In-place update of a live thesis (appends a revision server-side). `patch` = the changed fields
// (+ optional revision_kind / revision_note).
async function updateCoverage(id, patch) {
    const res = await httpService.put(`${BASE}/coverage/${encodeURIComponent(id)}`, { patch })
    _announceChange()
    return res
}

async function retireCoverage(id) {
    const res = await httpService.delete(`${BASE}/coverage/${encodeURIComponent(id)}`)
    _announceChange()
    return res
}
