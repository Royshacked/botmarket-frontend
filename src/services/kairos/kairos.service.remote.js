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
    updateCall,
    listCalls,
    getCall,
    getPerformance,
    actOnCall,
    deleteCall,
}

// Broadcast so every calls list (the Kairos panel + the Axl Lists Calls tab) refreshes.
const CALLS_CHANGED = 'kairos-calls-changed'
function _announceChange() { window.dispatchEvent(new Event(CALLS_CHANGED)) }
export { CALLS_CHANGED }

async function sendStream(messages, opts = {}) {
    const { model, reasoningEffort, routingMode, currentPhase, signal, accounts = [], mainAccountId = null, chatState, seed } = opts
    await postSSE(
        `${API_BASE}/${BASE}/stream`,
        { messages, model, reasoningEffort, routingMode, currentPhase, accounts, mainAccountId, chatState, seed },
        buildStreamHandlers(opts),
        { signal },
    )
}

// Persist a drafted call. `accounts` are the full marked-account objects (bank icon); the server
// binds the main account's broker + resolves the symbol gate. `chatState` (build conversation +
// draft) is stored so the Calls-tab edit pencil can reopen the call in chat with its history.
async function generateCall(call, accounts = [], mainAccountId = null, chatState = undefined) {
    const saved = await httpService.post(BASE, { call, accounts, mainAccountId, chat_state: chatState })
    _announceChange()
    return saved
}

// Edit in place (parity with updateIdea). Full plan update: pass { call, accounts, mainAccountId,
// chatState } → re-finalize on the existing call. Progressive save mid-edit: pass { chatState }
// alone → just persist the build conversation (no plan change / re-arm).
async function updateCall(id, { call, accounts = [], mainAccountId = null, chatState } = {}) {
    const body = call
        ? { call, accounts, mainAccountId, chat_state: chatState }
        : { chat_state: chatState }
    const res = await httpService.put(`${BASE}/${encodeURIComponent(id)}`, body)
    _announceChange()
    return res
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

// Kairos track record — aggregate of closed calls' outcomes.
async function getPerformance() {
    try { return await httpService.get(`${BASE}/performance`) }
    catch { return null }
}

// Readiness: 'confirm' | 'edit' | 'dismiss'. In-position management (accept a pending card):
// 'move_stop' | 'take_partial' | 'exit_now' | 'let_run'; 'dismiss' on an in-position call clears the
// management card without closing the position. Stop-out re-entry offer: 'reentry' (revive the closed
// call to waiting) | 'decline_reentry' (leave it closed).
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
