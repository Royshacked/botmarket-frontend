import { useCallback, useEffect, useReducer, useRef } from 'react'
import { chatWsService } from '../services/chat/chatWs.service'
import { sessionService } from '../services/session/session.service.remote'
import { chatService } from '../services/chat/chat.service'
import { sessionReducer, emptySession, SESSION_EVENTS } from '../services/session/sessionReducer.js'
import { newTurnId, stopTurn } from '../services/turn.service'
import { apiError } from '../services/http.service'
import { openChart } from '../services/chartSurface.service'

// How long a press made before the session has loaded waits for it (a card or a calendar row clicked as the page
// opens) — then it answers as not open, rather than hanging.
const READY_MS = 10000

/**
 * The user's live session in one scope — the unified chat's ONE client (plan phase 7, J6).
 *
 * Loads the active session, then keeps it in step from the chat socket: a `session_sync` (with the last
 * seq we hold) on load and on every `connected`, so a reconnect replays exactly what it missed. Turns are
 * posted and stream back on the socket; Stop is the shared turn stop; a decision tap is `choose`. There is
 * no per-desk continue — a stopped turn is just a turn, and the next message is the next turn.
 *
 * The socket is connected by the app header (useChatWs); this only listens and sends.
 *
 * @param {'main'|'strategy'|'aether'} [scope]
 * @param {{ ws?: object, api?: object, cards?: object }} [deps]  test seams
 */
export function useSession(scope = 'main', { ws = chatWsService, api = sessionService, cards = chatService } = {}) {
    const [state, dispatch] = useReducer(sessionReducer, { ...emptySession, scope })
    const ref = useRef(state)
    ref.current = state

    const sync = useCallback(() => {
        const s = ref.current
        if (s.sessionId) ws.send('session_sync', { sessionId: s.sessionId, afterSeq: s.lastSeq })
    }, [ws])

    const load = useCallback(async (fetch) => {
        try {
            const session = await fetch()
            dispatch({ type: 'load', session })
        } catch (err) {
            dispatch({ type: 'loadFailed', message: apiError(err, 'Could not open the chat') })
        }
    }, [])

    useEffect(() => { load(() => api.getActive(scope)) }, [api, scope, load])

    // A new session id (first load, New session, another tab archived ours) → replay from the start.
    useEffect(() => { if (state.sessionId) sync() }, [state.sessionId, sync])

    // EARLY PRESSES WAIT FOR THE SESSION (phase 8b bug hunt #2). A doorway can fire before the active session has
    // loaded — a card, a calendar row, a pencil clicked as the page opens — and used to be dropped without a word
    // (a turn) or refused as "not open" (a reopen). Each call waits for the session id instead, up to READY_MS.
    const waiters = useRef([])
    useEffect(() => { if (state.sessionId) waiters.current.splice(0).forEach(done => done(true)) }, [state.sessionId])
    const ready = useCallback(() => {
        if (ref.current.sessionId) return Promise.resolve(true)
        return new Promise(resolve => {
            const done = (ok) => { clearTimeout(timer); resolve(ok) }
            const timer = setTimeout(() => { waiters.current = waiters.current.filter(w => w !== done); resolve(false) }, READY_MS)
            waiters.current.push(done)
        })
    }, [])
    useEffect(() => () => { waiters.current.splice(0).forEach(done => done(false)) }, [])

    // Archived elsewhere (another tab pressed New) → follow it to the session that replaced it.
    useEffect(() => {
        if (state.status === 'archived' && state.next) load(() => api.getActive(scope))
    }, [state.status, state.next, api, scope, load])

    useEffect(() => {
        const handlers = SESSION_EVENTS.map(event => [event, (data) => {
            // A chart the user asked for docks above the input — the shared chart surface, not a row.
            if (event === 'session_delta' && data?.type === 'chart' && data.data?.live && data.sessionId === ref.current.sessionId) openChart(data.data)
            dispatch({ type: event, data })
        }])
        handlers.forEach(([e, h]) => ws.on(e, h))
        ws.on('connected', sync)
        return () => {
            handlers.forEach(([e, h]) => ws.off(e, h))
            ws.off('connected', sync)
        }
    }, [ws, sync])

    /** Post a turn. `agent` null → whoever holds the floor answers. `extras`: ops, seed, accounts, mainAccountId, brief. */
    const send = useCallback(async (text, { agent = null, ...extras } = {}) => {
        if (!String(text ?? '').trim() || !(await ready())) return false
        const s = ref.current
        const turnId = newTurnId()
        dispatch({ type: 'sending', turnId, agent: agent ?? s.floor ?? 'axl', text: String(text).trim() })
        try {
            await api.turn(s.sessionId, { text, agent, turnId, ...extras })
            dispatch({ type: 'accepted', turnId })
            return true
        } catch (err) {
            dispatch({ type: 'sendFailed', turnId, message: apiError(err, 'That message did not go through') })
            return false
        }
    }, [api, ready])

    const stop = useCallback(() => stopTurn(ref.current.live?.turnId), [])
    /** Take back a message that is still waiting behind another turn (the server cancels it unrun). */
    const cancelQueued = useCallback(() => stopTurn(ref.current.queuedTurn?.turnId), [])

    /** A tap on a decision card. @returns {Promise<string|null>} an error to show, or null */
    const choose = useCallback(async (choice) => {
        try { await api.continue(ref.current.sessionId, choice); return null }
        catch (err) { return apiError(err, 'That choice is not open any more') }
    }, [api])

    const startNew = useCallback(() => load(() => api.startNew(scope)), [api, scope, load])

    /**
     * A card row's button (dismiss, done, opened): drawn at once, then written through the card's own
     * conversation — the same resolve the social chat uses, which echoes `message_resolved` to every screen.
     */
    const resolveCard = useCallback(async (row, { status = 'dismissed', outcome = null } = {}) => {
        const { msgId, conversationId } = row?.ref ?? {}
        if (!msgId || !conversationId) return
        dispatch({ type: 'message_resolved', data: { id: msgId, status, resolveOutcome: outcome } })
        try { await cards.resolveMessage(conversationId, msgId, { status, outcome }) }
        catch (err) { console.error('[useSession] card resolve failed', err) }
    }, [cards])

    // ── A desk's surface: commits, hand edits, reopening (plan phase 8b; the contract is backend plan §10.2) ──
    //
    // Every press names the agent's REVISION the user was looking at, read here at press time. The answer's revision
    // (or a stale_state's current one) is folded straight in, so the next press does not wait on the socket frame.
    // Outcomes are VALUES, never throws: `{ ok: true, result }` or `{ ok: false, reason, message, extra, status }` —
    // the surface says the refusal in its own words, and the AVOID / busy asks read `reason` and `extra`.
    //
    // A STALE refusal also asks the socket for a replay (phase 8b bug hunt #1): the refusal means the state on screen
    // is not the server's — a frame was late or lost — and the press after it must be made on what the user can SEE,
    // not on the revision alone. The replay brings the agents' states with it, and the surface redraws.
    const _outcome = useCallback((agent, err, fallback) => {
        const data = err?.response?.data ?? {}
        if (data.reason === 'stale_state') {
            if (agent && Number.isInteger(data.rev)) dispatch({ type: 'rev', agent, rev: data.rev })
            sync()
        }
        // The words are `message`; everything past the reason is the refusal's extra (avoid names, failures, the rev).
        const { error: _e, reason, ...extra } = data
        return { ok: false, reason: reason ?? null, message: apiError(err, fallback), extra, status: err?.response?.status ?? null }
    }, [sync])

    /** A desk's commit — `generate`, `update`, `later`, Mentor's `arm`… @returns {Promise<object>} an outcome */
    const commit = useCallback(async (agent, action, args = {}) => {
        if (!(await ready())) return { ok: false, reason: 'not_found', message: 'The chat is not open yet', extra: {} }
        const s = ref.current
        try {
            const { rev, ...result } = await api.act(s.sessionId, { agent, action, args, rev: s.agentRev?.[agent] ?? 0 })
            if (Number.isInteger(rev)) dispatch({ type: 'rev', agent, rev })
            return { ok: true, result }
        } catch (err) {
            return _outcome(agent, err, 'That did not go through')
        }
    }, [api, _outcome, ready])

    /** A hand edit of a desk's work (a draft field, Argus's lens, a Prometheus read). @returns {Promise<object>} an outcome */
    const edit = useCallback(async (agent, change) => {
        if (!(await ready())) return { ok: false, reason: 'not_found', message: 'The chat is not open yet', extra: {} }
        const s = ref.current
        try {
            const { rev } = await api.editState(s.sessionId, { agent, edit: change, rev: s.agentRev?.[agent] ?? 0 })
            if (Number.isInteger(rev)) dispatch({ type: 'rev', agent, rev })
            return { ok: true, result: {} }
        } catch (err) {
            return _outcome(agent, err, 'That change did not go through')
        }
    }, [api, _outcome, ready])

    /**
     * Reopen a saved item at the desk that owns it (a pencil, a card). A desk holding other unsaved work answers
     * `busy` with its agent — the caller asks the user, then repeats with `force`. @returns {Promise<object>} an outcome
     */
    const reopen = useCallback(async (kind, id, { name = null, force = false, reviewMode = false } = {}) => {
        if (!(await ready())) return { ok: false, reason: 'not_found', message: 'The chat is not open yet', extra: {} }
        const s = ref.current
        try {
            return { ok: true, result: await api.edit(s.sessionId, { kind, id, name, force, reviewMode }) }
        } catch (err) {
            return _outcome(null, err, 'Could not open that')
        }
    }, [api, _outcome, ready])

    return { ...state, send, stop, cancelQueued, choose, startNew, resolveCard, commit, edit, reopen }
}
