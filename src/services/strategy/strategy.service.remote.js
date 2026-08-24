import { streamAgent } from '../agentStream'
import { httpService } from '../http.service'

// Pythia (key `strategy`): an SSE top-down stream plus the `tilt` publication log — the house sector
// view. The stream emits a DRAFT tilt in `done` (data.tilt); publishing is a separate, explicit act.
//
// NOT owner-scoped, unlike coverage. A house view is a BROADCAST: `getCurrent` answers the same
// document to everyone, so there is no per-user list to key off and no entityApi wrapper — scoping
// it per user would quietly turn one house view into eleven private opinions.

const BASE = 'api/strategy'

export const TILT_CHANGED = 'strategy-tilt-changed'
const _announce = () => window.dispatchEvent(new CustomEvent(TILT_CHANGED))

export const strategyService = {
    sendStream,
    getCurrentTilt,
    listTilts,
    getTilt,
    publishTilt,
    updateTilt,
    retireTilt,
}

/** Streaming top-down chat. done → { reply, phase, tilt }. */
async function sendStream(messages, opts = {}) {
    const { model, chatState } = opts
    await streamAgent(BASE, { messages, model, chatState }, opts)
}

/** The view in force. `null` is a legitimate answer — the desk may simply not have published yet. */
function getCurrentTilt(benchmark = 'SPX') {
    return httpService.get(`${BASE}/tilt/current?benchmark=${encodeURIComponent(benchmark)}`)
}

/** Published history, newest first — the record the desk is graded on. */
function listTilts({ benchmark = 'SPX', limit = 24 } = {}) {
    return httpService.get(`${BASE}/tilt?benchmark=${encodeURIComponent(benchmark)}&limit=${limit}`)
}

function getTilt(id) { return httpService.get(`${BASE}/tilt/${encodeURIComponent(id)}`) }

/**
 * Publish a new house view, superseding the current one. Refused (422) when a stance contradicts its
 * active weight — `active_bp` is what gets allocated, so a mislabelled row would move a book the
 * wrong way. The response carries `changed`: what actually moved versus the previous view.
 */
async function publishTilt(tilt) {
    const doc = await httpService.post(`${BASE}/tilt`, tilt)
    _announce()
    return doc
}

async function updateTilt(id, patch) {
    const doc = await httpService.put(`${BASE}/tilt/${encodeURIComponent(id)}`, patch)
    _announce()
    return doc
}

/** ARCHIVE: status → retired, trail kept. There is deliberately no delete — see the routes. */
async function retireTilt(id) {
    const doc = await httpService.post(`${BASE}/tilt/${encodeURIComponent(id)}/retire`)
    _announce()
    return doc
}
