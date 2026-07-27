import { httpService } from '../http.service'
import { streamAgent, clientTimeContext } from '../agentStream'

// Mentor remote service (Pipeline F). Mirrors kairos.service.remote: an SSE build stream plus CRUD
// for the artifact — here a "setup". The stream emits a DRAFT setup in `done` (data.setup) or a
// candidate offer (data.setups); the user presses Generate to persist, then Arm to start Talos.
//
// Two things differ from the call flow and both are deliberate:
//   • no `currentPhase` — Mentor has no phases, so there is no step number to send back. Progress
//     rides on `coverage` instead (cumulative, order-free).
//   • Generate and Arm are SEPARATE. A generated setup sits at 'waiting' and is NOT monitored;
//     arming is what starts Talos spending price fetches and assessments on it.

const BASE   = 'api/mentor'
const SETUPS = 'api/setups'

export const mentorService = {
    sendStream,
    generateSetup,
    updateSetup,
    listSetups,
    getSetup,
    armSetup,
    disarmSetup,
    deleteSetup,
}

// Broadcast so every setups list refreshes (the Mentor panel + any Axl list tab).
const SETUPS_CHANGED = 'mentor-setups-changed'
function _announceChange() { window.dispatchEvent(new Event(SETUPS_CHANGED)) }
export { SETUPS_CHANGED }

/**
 * Stream a build turn. `chatState` carries the live worksheet forward:
 *   { active_asset, draft, coverage }
 * The draft is echoed back into the system prompt, so an omitted field survives a thin re-emit.
 */
async function sendStream(messages, opts = {}) {
    const { model, reasoningEffort, routingMode, accounts = [], mainAccountId = null, chatState } = opts
    await streamAgent(BASE, { messages, model, reasoningEffort, routingMode, accounts, mainAccountId, chatState, ...clientTimeContext() }, opts)
}

/**
 * Persist a drafted setup → status 'waiting' (created, NOT yet monitored).
 * `accounts` are the full marked-account objects (bank icon); the server binds the main account's
 * broker, resolves the symbol gate, and stamps mode + event_risk. Never author those client-side.
 */
async function generateSetup(setup, accounts = [], mainAccountId = null, chatState = undefined) {
    const saved = await httpService.post(`${SETUPS}/generate`, { setup, accounts, mainAccountId, chat_state: chatState })
    _announceChange()
    return saved
}

/** Edit an existing setup in place. Pre-position this re-arms it; in position it is a light edit. */
async function updateSetup(id, setup, accounts = [], mainAccountId = null, chatState = undefined) {
    const saved = await httpService.post(`${SETUPS}/generate`, {
        setup, accounts, mainAccountId, chat_state: chatState, updateId: id,
    })
    _announceChange()
    return saved
}

async function listSetups(status = null) {
    try {
        const data = await httpService.get(SETUPS, status ? { status } : undefined)
        return Array.isArray(data) ? data : []
    } catch { return [] }
}

/** One setup incl. monitor_state.timeline — the detail view polls this for Talos's live journal. */
async function getSetup(id) {
    try { return await httpService.get(`${SETUPS}/${encodeURIComponent(id)}`) }
    catch { return null }
}

/**
 * Arm: 'waiting' → 'looking'. This is the real gate — the server re-runs the full readiness check,
 * so a setup whose broker disconnected after Generate is refused here rather than polled forever.
 * The rejection reason comes back as `cannot_arm_<reason>`; surface it, don't swallow it.
 */
async function armSetup(id) {
    const res = await httpService.patch(`${SETUPS}/${encodeURIComponent(id)}`, { status: 'looking' })
    _announceChange()
    return res
}

/** Disarm: back to 'waiting'. Talos stops watching; the setup is kept. */
async function disarmSetup(id) {
    const res = await httpService.patch(`${SETUPS}/${encodeURIComponent(id)}`, { status: 'waiting' })
    _announceChange()
    return res
}

/** Delete. A live position is delete-locked server-side (409-ish `in_position`). */
async function deleteSetup(id) {
    const res = await httpService.delete(`${SETUPS}/${encodeURIComponent(id)}`)
    _announceChange()
    return res
}
