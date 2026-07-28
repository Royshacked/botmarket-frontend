import { streamAgent } from '../agentStream'
import { makeEntityApi } from '../entityApi'

// Analyst: an SSE research stream plus CRUD for its artifact — `coverage`, the living per-name
// thesis. The stream emits a DRAFT coverage in `done` (data.coverage); the user clicks
// "Initiate coverage" to persist. Transport is the shared entityApi.

const BASE = 'api/analyst'

const api = makeEntityApi({ base: `${BASE}/coverage`, changeEvent: 'analyst-coverage-changed' })
export const COVERAGE_CHANGED = api.changeEvent

export const analystService = {
    sendStream,
    initiateCoverage,
    listCoverage,
    getCoverage,
    updateCoverage,
    retireCoverage,
}

// Streaming research chat. `seed` (a structured Argus investing candidate) pre-seeds the research on
// a hand-off turn; `brokerContext` gives the analyst the user's book. done → { reply, phase, coverage }.
async function sendStream(messages, opts = {}) {
    const { model, reasoningEffort, chatState, seed, brokerContext } = opts
    await streamAgent(BASE, { messages, model, reasoningEffort, chatState, seed, brokerContext }, opts)
}

// Initiation is an EVENT — one per name; a duplicate → 409 already_covered.
const initiateCoverage = (coverage) => api.post('', { coverage })

const listCoverage = ({ sector, status } = {}) =>
    api.list({ ...(sector ? { sector } : {}), ...(status ? { status } : {}) })

const getCoverage = (id) => api.get(id)

// In-place update of a live thesis (appends a revision server-side). `patch` = the changed fields
// (+ optional revision_kind / revision_note).
const updateCoverage = (id, patch) => api.put(id, { patch })

const retireCoverage = (id) => api.remove(id)
