import { httpService } from '../http.service'
import { API_BASE } from '../config'
import { postSSE, buildStreamHandlers } from '../sse.util'

// Kairos remote service. Mirrors scanner.service.remote: an SSE build stream plus CRUD for the
// artifact (here a "call"). The stream emits a DRAFT call in `done` (data.call); the user clicks
// Generate to persist (generateCall); readiness cards are acted on via actOnCall.

const BASE = 'api/kairos'

export const kairosService = {
    sendStream,
    generateCall,
    listCalls,
    getCall,
    actOnCall,
    deleteCall,
}

// Broadcast so every calls list (the Kairos panel + the Axl Lists Calls tab) refreshes.
const CALLS_CHANGED = 'kairos-calls-changed'
function _announceChange() { window.dispatchEvent(new Event(CALLS_CHANGED)) }
export { CALLS_CHANGED }

async function sendStream(messages, opts = {}) {
    const { model, reasoningEffort, routingMode, currentPhase, signal, accounts = [] } = opts
    await postSSE(
        `${API_BASE}/${BASE}/stream`,
        { messages, model, reasoningEffort, routingMode, currentPhase, accounts },
        buildStreamHandlers(opts),
        { signal },
    )
}

// Persist a drafted call. `accounts` are the full marked-account objects (bank icon); the server
// binds the main account's broker + resolves the symbol gate.
async function generateCall(call, accounts = [], mainAccountId = null) {
    const saved = await httpService.post(BASE, { call, accounts, mainAccountId })
    _announceChange()
    return saved
}

async function listCalls() {
    try {
        const data = await httpService.get(BASE)
        return Array.isArray(data) ? data : []
    } catch { return [] }
}

// One call incl. its monitor_state.timeline — the pop-out polls this for the live journal.
async function getCall(id) {
    try { return await httpService.get(`${BASE}/${encodeURIComponent(id)}`) }
    catch { return null }
}

// action ∈ 'confirm' | 'edit' | 'dismiss'
async function actOnCall(id, action) {
    const res = await httpService.post(`${BASE}/${encodeURIComponent(id)}/action`, { action })
    _announceChange()
    return res
}

async function deleteCall(id) {
    const res = await httpService.delete(`${BASE}/${encodeURIComponent(id)}`)
    _announceChange()
    return res
}
