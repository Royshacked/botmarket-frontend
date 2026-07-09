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
    actOnCall,
}

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
    return httpService.post(BASE, { call, accounts, mainAccountId })
}

async function listCalls() {
    try {
        const data = await httpService.get(BASE)
        return Array.isArray(data) ? data : []
    } catch { return [] }
}

// action ∈ 'confirm' | 'edit' | 'dismiss'
async function actOnCall(id, action) {
    return httpService.post(`${BASE}/${encodeURIComponent(id)}/action`, { action })
}
