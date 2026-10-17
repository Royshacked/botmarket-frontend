import { useCallback, useEffect, useReducer, useRef } from 'react'
import { chatWsService } from '../services/chat/chatWs.service'
import { sessionService } from '../services/session/session.service.remote'
import { chatService } from '../services/chat/chat.service'
import { sessionReducer, emptySession, SESSION_EVENTS } from '../services/session/sessionReducer.js'
import { newTurnId, stopTurn } from '../services/turn.service'
import { apiError } from '../services/http.service'
import { openChart } from '../services/chartSurface.service'

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
        const s = ref.current
        if (!s.sessionId || !String(text ?? '').trim()) return false
        const turnId = newTurnId()
        dispatch({ type: 'sending', turnId, agent: agent ?? s.floor ?? 'axl' })
        try {
            await api.turn(s.sessionId, { text, agent, turnId, ...extras })
            return true
        } catch (err) {
            dispatch({ type: 'sendFailed', turnId, message: apiError(err, 'That message did not go through') })
            return false
        }
    }, [api])

    const stop = useCallback(() => stopTurn(ref.current.live?.turnId), [])

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

    return { ...state, send, stop, choose, startNew, resolveCard }
}
