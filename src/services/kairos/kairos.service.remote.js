import { streamAgent } from '../agentStream'
import { makeEntityApi } from '../entityApi'

// Kairos: an SSE build stream plus CRUD for its artifact — a "call". The stream emits a DRAFT call
// in `done` (data.call); the user clicks Generate to persist. Transport is the shared entityApi;
// what stays here is Kairos's own judgment, above all the action verbs.

const BASE = 'api/kairos'

const api = makeEntityApi({ base: BASE, changeEvent: 'kairos-calls-changed' })
export const CALLS_CHANGED = api.changeEvent

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

async function sendStream(messages, opts = {}) {
    const { model, accounts = [], mainAccountId = null, chatState, seed } = opts
    await streamAgent(BASE, { messages, model, accounts, mainAccountId, chatState, seed }, opts)
}

// Persist a drafted call. `accounts` are the full marked-account objects (bank icon); the server
// binds the main account's broker + resolves the symbol gate. `chatState` (build conversation +
// draft) is stored so the Calls-tab edit pencil can reopen the call in chat with its history.
function generateCall(call, accounts = [], mainAccountId = null, chatState = undefined) {
    return api.post('', { call, accounts, mainAccountId, chat_state: chatState })
}

// Edit in place (parity with updateIdea). Full plan update: pass { call, accounts, mainAccountId,
// chatState } → re-finalize on the existing call. Progressive save mid-edit: pass { chatState }
// alone → just persist the build conversation (no plan change / re-arm).
function updateCall(id, { call, accounts = [], mainAccountId = null, chatState } = {}) {
    return api.put(id, call ? { call, accounts, mainAccountId, chat_state: chatState } : { chat_state: chatState })
}

function listCalls() { return api.list() }

// One call incl. its monitor_state.timeline — the pop-out polls this for the live journal.
function getCall(id) { return api.get(id) }

// Kairos track record — aggregate of closed calls' outcomes.
function getPerformance() { return api.getPath('/performance') }

// Readiness: 'confirm' | 'edit' | 'dismiss'. In-position management (accept a pending card):
// 'move_stop' | 'take_partial' | 'exit_now' | 'let_run'; 'dismiss' on an in-position call clears the
// management card without closing the position. Stop-out re-entry offer: 'reentry' (revive the closed
// call to waiting) | 'decline_reentry' (leave it closed).
function actOnCall(id, action) { return api.post(`/${encodeURIComponent(id)}/action`, { action }) }

function deleteCall(id) { return api.remove(id) }
