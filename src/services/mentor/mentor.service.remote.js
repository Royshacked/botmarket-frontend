import { streamAgent, clientTimeContext } from '../agentStream'
import { makeEntityApi } from '../entityApi'

// Mentor (Pipeline F): an SSE build stream plus CRUD for its artifact — a "setup".
//
// Transport is the shared entityApi; what stays here is Mentor's own judgment. Two things differ
// from the call flow and both are deliberate:
//   • no `currentPhase` — Mentor has no phases, so there is no step number to send back. Progress
//     rides on `coverage` instead (cumulative, order-free).
//   • Generate and Arm are SEPARATE. A generated setup sits at 'waiting' and is NOT monitored;
//     arming is what starts Talos spending price fetches and assessments on it.

const BASE = 'api/mentor'

const api = makeEntityApi({ base: 'api/setups', changeEvent: 'mentor-setups-changed' })
export const SETUPS_CHANGED = api.changeEvent

export const mentorService = {
    sendStream,
    generateSetup,
    updateSetup,
    saveChatState,
    listSetups,
    getSetup,
    armSetup,
    disarmSetup,
    actOnSetup,
    deleteSetup,
}

/**
 * Stream a build turn. `chatState` carries the live worksheet forward:
 *   { active_asset, draft, coverage }
 * The draft is echoed back into the system prompt, so an omitted field survives a thin re-emit.
 */
async function sendStream(messages, opts = {}) {
    const { model, reasoningEffort, routingMode, accounts = [], mainAccountId = null, chatState, seed } = opts
    // `seed` is the Argus hand-off, sent on the hand-off turn only. Named explicitly because this
    // body is an allow-list, not a spread — an unlisted field is dropped without a word.
    await streamAgent(BASE, { messages, model, reasoningEffort, routingMode, accounts, mainAccountId, chatState, seed, ...clientTimeContext() }, opts)
}

/**
 * Persist a drafted setup → status 'waiting' (created, NOT yet monitored).
 * `accounts` are the full marked-account objects (bank icon); the server binds the main account's
 * broker, resolves the symbol gate, and stamps mode + event_risk. Never author those client-side.
 */
function generateSetup(setup, accounts = [], mainAccountId = null, chatState = undefined) {
    return api.post('/generate', { setup, accounts, mainAccountId, chat_state: chatState })
}

/** Edit an existing setup in place. Pre-position this re-arms it; in position it is a light edit. */
function updateSetup(id, setup, accounts = [], mainAccountId = null, chatState = undefined) {
    return api.post('/generate', { setup, accounts, mainAccountId, chat_state: chatState, updateId: id })
}

/**
 * Progressive save mid-edit: persist the build CONVERSATION alone, with no plan rewrite. Parity
 * with kairos's `updateCall({ chatState })`, and the distinction matters more here than there —
 * routing this through updateSetup would re-run the readiness gate, re-bind the venue from the
 * currently-marked accounts, and send a WATCHED setup back to 'waiting' on every turn. Talos would
 * stop watching a live setup because the user asked Mentor a question about it.
 *
 * The plan itself is written when the user presses "Update setup" — that is what an edit IS.
 */
function saveChatState(id, chatState) {
    return api.patch(id, { chat_state: chatState })
}

function listSetups(status = null) { return api.list(status ? { status } : undefined) }

/** One setup incl. monitor_state.timeline — the detail view polls this for Talos's live journal. */
function getSetup(id) { return api.get(id) }

/**
 * Arm: 'waiting' → 'looking'. This is the real gate — the server re-runs the full readiness check,
 * so a setup whose broker disconnected after Generate is refused here rather than polled forever.
 * The rejection reason comes back as `cannot_arm_<reason>`; surface it, don't swallow it.
 */
function armSetup(id) { return api.patch(id, { status: 'looking' }) }

/** Disarm: back to 'waiting'. Talos stops watching; the setup is kept. */
function disarmSetup(id) { return api.patch(id, { status: 'waiting' }) }

/**
 * Act on Talos's in-position management card: accept the pending proposal (`move_stop` |
 * `take_partial` | `exit_now`) or `dismiss` it and keep the position running.
 *
 * `add_leg` is NOT an action here — Talos parks that leg as a pending ORDER, so it is taken by
 * confirming the order like any other entry. The server answers `confirm_order` if asked, rather
 * than placing the size a second time.
 */
function actOnSetup(id, action) { return api.post(`/${encodeURIComponent(id)}/action`, { action }) }

/** Delete. A live position is delete-locked server-side (409-ish `in_position`). */
function deleteSetup(id) { return api.remove(id) }
