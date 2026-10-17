import { httpService } from '../http.service'

// The unified chat's session (backend api/sessions — unified-chat plan phases 3–7). One timeline per user per
// scope; every agent speaks in it. A turn is ACCEPTED here (202) and streams on the chat socket
// (`session_delta` / `session_turn`, the settled rows as `session_message`) — useSession folds those.
// Stopping a turn stays the shared POST /api/turns/:turnId/stop (services/turn.service.js).

const BASE = 'api/sessions'

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

    /** Reopen an entity for editing in the live session. A busy desk answers 409 with its agent. */
    async edit(sessionId, { kind, id, name = null, force = false }) {
        return httpService.post(`${BASE}/${encodeURIComponent(sessionId)}/edit`, { kind, id, name, force })
    },

    /** A tap on a decision card (continue, finish, set aside, research, next, reopen, keep…). */
    async continue(sessionId, choice) {
        return httpService.post(`${BASE}/${encodeURIComponent(sessionId)}/continue`, { choice })
    },
}
