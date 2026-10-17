// The unified chat's client state, folded from the session socket (unified-chat plan phase 7, J6).
//
// One pure reducer, so every frame's effect is testable without a socket or React:
//   session_replay   the rows after our last seq + the floor, status and any turn running now (a reconnect)
//   session_message  one settled row — a user turn, a reply, a hand-off, a decision, a card
//   session_removed  rows a stopped turn took back
//   session_state    a patch: one agent's working state, the floor, the chain, "archived → next"
//   session_delta    the running turn's stream: tokens, reasoning, the tool chip, a phase
//   session_turn     the running turn's lifecycle: started / done / stopped / refused / error
//   message_resolved a card's state moved (done, dismissed, superseded) — matched on the card row's msgId
//
// Rows are kept in seq order and de-duplicated by seq, so a replay that overlaps a live push is harmless.
// Frames for another session are ignored: a frame names its session, and the user may have two (main and
// an admin scope) open.

export const emptySession = Object.freeze({
    sessionId: null, scope: 'main', status: null, next: null,
    rows: [], lastSeq: 0,
    live: null,          // { turnId, agent, text, reasoning, tool, phase, status: 'queued' | 'running' }
    queuedTurn: null,    // { turnId, agent, text } — the user spoke while another turn ran; it waits its turn
    lastTurn: null,      // { turnId, agent, status, payload, reason, message } — the last turn that ENDED
    floor: 'axl', agentState: {}, chain: null,
    loadError: null,     // the session could not be opened (network, server down)
})

const ENDED = new Set(['done', 'stopped', 'refused', 'error'])

/** Merge rows by seq (newer copy wins), in order. */
function mergeRows(rows, incoming) {
    if (!incoming?.length) return rows
    const bySeq = new Map(rows.map(r => [r.seq, r]))
    for (const m of incoming) if (Number.isFinite(m?.seq)) bySeq.set(m.seq, { ...bySeq.get(m.seq), ...m })
    return [...bySeq.values()].sort((a, b) => a.seq - b.seq)
}

const maxSeq = (rows, prev) => rows.reduce((n, r) => Math.max(n, r.seq), prev)

function liveFor(state, turnId, agent) {
    return state.live?.turnId === turnId
        ? state.live
        : { turnId, agent, text: '', reasoning: '', tool: null, phase: null, status: 'running' }
}

/** Set the live turn; the user's queued turn leaves the queue when it is the one now running. */
const withLive = (state, live) => ({ ...state, live, queuedTurn: state.queuedTurn?.turnId === live?.turnId ? null : state.queuedTurn })

/**
 * @param {typeof emptySession} state
 * @param {{ type: string, [k: string]: any }} action
 */
export function sessionReducer(state, action) {
    switch (action.type) {
        // A session header from REST (the active one, a new one) — a fresh timeline.
        case 'load': {
            const s = action.session
            if (!s) return state
            return {
                ...emptySession, sessionId: s.sessionId, scope: s.scope ?? state.scope, status: s.status ?? 'active',
                floor: s.floor ?? 'axl', agentState: s.agentState ?? {}, chain: s.chain ?? null,
            }
        }

        case 'loadFailed':
            return { ...state, loadError: action.message ?? 'Could not open the chat' }

        // The user pressed send. Nothing running → the turn is ours before the server says a word, so Stop
        // works at once. Another turn running (a chain step, a slow reply) → it QUEUES behind that one — the
        // server runs turns one at a time and pauses a chain for it (G4) — and shows as waiting.
        case 'sending':
            if (state.live && state.live.turnId !== action.turnId) {
                return { ...state, queuedTurn: { turnId: action.turnId, agent: action.agent, text: action.text ?? '' } }
            }
            return { ...state, live: { ...liveFor(state, action.turnId, action.agent), status: 'queued' } }

        // The POST itself failed (network, 4xx) — nothing is running or waiting for it.
        case 'sendFailed': {
            const ours = state.live?.turnId === action.turnId ? state.live : state.queuedTurn?.turnId === action.turnId ? state.queuedTurn : null
            if (!ours) return state
            return {
                ...state,
                live:       state.live?.turnId === action.turnId ? null : state.live,
                queuedTurn: state.queuedTurn?.turnId === action.turnId ? null : state.queuedTurn,
                lastTurn:   { turnId: action.turnId, agent: ours.agent, status: 'error', message: action.message ?? null },
            }
        }
    }

    const d = action.data
    if (!d || (d.sessionId && d.sessionId !== state.sessionId)) {
        // message_resolved names a card, not a session — it is handled below for any session.
        if (action.type !== 'message_resolved') return state
    }

    switch (action.type) {
        case 'session_replay': {
            if (d.error) return state
            const rows = mergeRows(state.rows, d.messages)
            // The server's running turn wins over whatever we were showing; nothing running → a turn we showed
            // ended while we were away — unless it is the one we just sent, which the server may not have yet.
            const live = d.running
                ? (state.live?.turnId === d.running.turnId ? state.live : { turnId: d.running.turnId, agent: d.running.agent, text: '', reasoning: '', tool: null, phase: null, status: 'running' })
                : (state.live?.status === 'queued' ? state.live : null)
            return { ...withLive(state, live), rows, lastSeq: maxSeq(rows, state.lastSeq), floor: d.floor ?? state.floor, status: d.status ?? state.status }
        }

        case 'session_message': {
            const m = d.message
            if (!m) return state
            const rows = mergeRows(state.rows, [m])
            // The reply landed as a row: the streaming bubble's words are now the row's — stop drawing them twice.
            const live = state.live && m.role === 'assistant' && m.agent === state.live.agent && (m.kind ?? 'msg') === 'msg'
                ? { ...state.live, text: '', reasoning: '' }
                : state.live
            return { ...state, rows, lastSeq: maxSeq(rows, state.lastSeq), live }
        }

        case 'session_removed': {
            const gone = new Set(d.seqs ?? [])
            return { ...state, rows: state.rows.filter(r => !gone.has(r.seq)) }
        }

        case 'session_state': {
            let next = state
            if (d.archived) next = { ...next, status: 'archived', next: d.next ?? null }
            if ('floor' in d) next = { ...next, floor: d.floor ?? 'axl' }
            if ('chain' in d) next = { ...next, chain: d.chain ?? null }
            if (d.agent) next = { ...next, agentState: { ...next.agentState, [d.agent]: d.state ?? null } }
            return next
        }

        case 'session_delta': {
            const live = liveFor(state, d.turnId, d.agent)
            const data = d.data ?? {}
            switch (d.type) {
                case 'token':     return withLive(state, { ...live, status: 'running', tool: null, text: live.text + (data.text ?? '') })
                case 'reasoning': return withLive(state, { ...live, status: 'running', reasoning: live.reasoning + (data.text ?? '') })
                case 'status':    return withLive(state, { ...live, status: 'running', tool: data.tool ?? null })
                case 'phase':     return withLive(state, { ...live, status: 'running', phase: data.phase ?? null })
                default:          return state.live?.turnId === d.turnId ? state : withLive(state, live)
            }
        }

        case 'session_turn': {
            if (d.status === 'started') return withLive(state, { ...liveFor(state, d.turnId, d.agent), status: 'running' })
            if (!ENDED.has(d.status)) return state
            const lastTurn = { turnId: d.turnId, agent: d.agent, status: d.status, payload: d.payload ?? null, reason: d.reason ?? null, message: d.message ?? null }
            return {
                ...state, lastTurn,
                live:       state.live?.turnId === d.turnId ? null : state.live,
                // A queued turn stopped before it ran (Stop on a waiting message) leaves the queue too.
                queuedTurn: state.queuedTurn?.turnId === d.turnId ? null : state.queuedTurn,
            }
        }

        case 'message_resolved': {
            if (!d?.id) return state
            let hit = false
            const rows = state.rows.map(r => {
                if (r.kind !== 'card' || r.ref?.msgId !== d.id) return r
                hit = true
                const card = r.card ?? {}
                return { ...r, card: {
                    ...card, status: d.status ?? card.status, resolveOutcome: d.resolveOutcome ?? card.resolveOutcome ?? null,
                    resolveNote: d.resolveNote ?? card.resolveNote ?? null,
                    payload: d.payloadPatch ? { ...(card.payload ?? {}), ...d.payloadPatch } : (card.payload ?? null),
                } }
            })
            return hit ? { ...state, rows } : state
        }

        default:
            return state
    }
}

/** Every socket event the reducer folds — useSession subscribes to exactly these. */
export const SESSION_EVENTS = Object.freeze(['session_replay', 'session_message', 'session_removed', 'session_state', 'session_delta', 'session_turn', 'message_resolved'])

/**
 * A row as the shared ChatBubble reads it (`{ role, content, reasoning?, streaming? }`) — a user turn or an
 * agent's prose. Hand-offs, decisions, cards and sealed lines render their own rows.
 */
export function bubbleOf(row) {
    return { role: row.role, content: row.content ?? '' }
}

/**
 * The tap options under the LAST reply — only while that reply is still the last word. A user turn, a decision,
 * a hand-off or a reopened context after it means the conversation moved on; a background card arriving
 * does not (it is an alert beside the conversation, not a turn in it).
 */
export function lastTapOptions(rows) {
    for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i]
        const kind = r.kind ?? 'msg'
        if (kind === 'card') continue
        if (r.role === 'assistant' && kind === 'msg') return r.ref?.suggestions ?? []
        return []
    }
    return []
}
