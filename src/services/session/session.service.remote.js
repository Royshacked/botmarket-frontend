import { httpService } from '../http.service'
import { SETUPS_CHANGED } from '../mentor/mentor.service.remote'

// The unified chat's session (backend api/sessions — unified-chat plan phases 3–7). One timeline per user per
// scope; every agent speaks in it. A turn is ACCEPTED here (202) and streams on the chat socket
// (`session_delta` / `session_turn`, the settled rows as `session_message`) — useSession folds those.
// Stopping a turn stays the shared POST /api/turns/:turnId/stop (services/turn.service.js).

const BASE = 'api/sessions'

// A commit writes the desk's kind, so the lists of it reload — the same window broadcast the kind's own CRUD sends
// (entityApi). Phase 8b CR: Generate/Arm/Update from the session left the Floor stale until its poll. The other desks'
// kinds join as their surfaces arrive (8c, 8d).
const CHANGE_EVENTS = { mentor: SETUPS_CHANGED }

export const sessionService = {
    /** The user's running session in a scope (created when there is none). */
    async getActive(scope = 'main') {
        const { session } = await httpService.get(`${BASE}/active?scope=${encodeURIComponent(scope)}`)
        return session
    },

    /** "New session": archive the active one and open a fresh one. */
    async startNew(scope = 'main') {
        const { session } = await httpService.post(`${BASE}/new`, { scope })
        return session
    },

    /** The user's sessions in a scope, newest first — the history drawer. */
    async list(scope = 'main') {
        const { sessions } = await httpService.get(`${BASE}?scope=${encodeURIComponent(scope)}`)
        return sessions
    },

    /** A session's rows after `after` (a seq) — an archived session's read, or a first page. */
    async messages(sessionId, { after = 0, limit } = {}) {
        const params = new URLSearchParams({ after: String(after) })
        if (limit) params.set('limit', String(limit))
        const { messages } = await httpService.get(`${BASE}/${encodeURIComponent(sessionId)}/messages?${params}`)
        return messages
    },

    /**
     * Post a turn. `agent` null → the floor-holder answers. `extras` are the per-turn inputs a desk reads:
     * `{ ops, seed, accounts, mainAccountId, brief }`; the clock is added here.
     * @returns {Promise<{ turnId: string, agent: string }>}  the turn is accepted, not done — it streams on the socket
     */
    async turn(sessionId, { text, agent = null, turnId, ...extras }) {
        return httpService.post(`${BASE}/${encodeURIComponent(sessionId)}/turn`, {
            text, agent, turnId, ...extras,
            clientTime: { clientNow: Date.now(), clientTz: Intl.DateTimeFormat().resolvedOptions().timeZone },
        })
    },

    /**
     * Reopen an entity for editing in the live session. A busy desk answers 409 with its agent. `reviewMode` opens a
     * book for its review (Atlas).
     */
    async edit(sessionId, { kind, id, name = null, force = false, reviewMode = false }) {
        return httpService.post(`${BASE}/${encodeURIComponent(sessionId)}/edit`, { kind, id, name, force, reviewMode })
    },

    /**
     * A desk's commit (Generate, Arm, Update, Later…) — the server reads the work from the session, never from here
     * (backend plan §10.2). `rev` is the agent's revision the user was looking at; a stale one answers 409 stale_state.
     * @returns {Promise<object>}  the desk's result `{ <kind>: doc, ... }` and the new `rev`
     */
    async act(sessionId, { agent, action, args = {}, rev }) {
        const res = await httpService.post(`${BASE}/${encodeURIComponent(sessionId)}/act`, { agent, action, args, rev })
        if (CHANGE_EVENTS[agent]) window.dispatchEvent(new Event(CHANGE_EVENTS[agent]))
        return res
    },

    /** A hand edit of a desk's work — validated by the desk, pushed back on the socket. @returns {Promise<{ ok, rev }>} */
    async editState(sessionId, { agent, edit, rev }) {
        return httpService.patch(`${BASE}/${encodeURIComponent(sessionId)}/state`, { agent, edit, rev })
    },

    /** A tap on a decision card (continue, finish, set aside, research, next, reopen, keep…). */
    async continue(sessionId, choice) {
        return httpService.post(`${BASE}/${encodeURIComponent(sessionId)}/continue`, { choice })
    },
}
