import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sessionReducer, emptySession, lastTapOptions } from './sessionReducer.js'

// Every frame the session socket sends, folded (unified-chat plan phase 7, J6).

const S = 'ses_1'
const loaded = sessionReducer(emptySession, { type: 'load', session: { sessionId: S, scope: 'main', status: 'active', floor: 'axl', agentState: { mentor: { draft: 1 } } } })
const row = (seq, over = {}) => ({ seq, agent: 'axl', role: 'assistant', kind: 'msg', content: `r${seq}`, ...over })
const fold = (state, ...actions) => actions.reduce(sessionReducer, state)

test('load: a fresh timeline from the header', () => {
    assert.equal(loaded.sessionId, S)
    assert.equal(loaded.floor, 'axl')
    assert.deepEqual(loaded.agentState, { mentor: { draft: 1 } })
    assert.deepEqual(loaded.rows, [])
    const failed = sessionReducer(loaded, { type: 'loadFailed', message: 'down' })
    assert.equal(failed.loadError, 'down')
    assert.equal(sessionReducer(failed, { type: 'load', session: { sessionId: 'x' } }).loadError, null)
})

test('rows merge by seq — in order, de-duplicated, a replay overlapping a push is harmless', () => {
    const s = fold(loaded,
        { type: 'session_message', data: { sessionId: S, message: row(2) } },
        { type: 'session_replay', data: { sessionId: S, messages: [row(1), row(2), row(3)], floor: 'mentor', status: 'active', running: null } },
    )
    assert.deepEqual(s.rows.map(r => r.seq), [1, 2, 3])
    assert.equal(s.lastSeq, 3)
    assert.equal(s.floor, 'mentor')
})

test('frames for another session are ignored', () => {
    const s = sessionReducer(loaded, { type: 'session_message', data: { sessionId: 'other', message: row(1) } })
    assert.equal(s, loaded)
})

test('a turn: sending → started → tokens → the reply row → done; Stop has the id from the first moment', () => {
    let s = sessionReducer(loaded, { type: 'sending', turnId: 't1', agent: 'axl' })
    assert.deepEqual([s.live.turnId, s.live.status], ['t1', 'queued'])
    s = fold(s,
        { type: 'session_turn', data: { sessionId: S, turnId: 't1', agent: 'axl', status: 'started' } },
        { type: 'session_delta', data: { sessionId: S, turnId: 't1', agent: 'axl', type: 'status', data: { tool: 'get_news' } } },
        { type: 'session_delta', data: { sessionId: S, turnId: 't1', agent: 'axl', type: 'reasoning', data: { text: 'hm' } } },
        { type: 'session_delta', data: { sessionId: S, turnId: 't1', agent: 'axl', type: 'token', data: { text: 'Hel' } } },
        { type: 'session_delta', data: { sessionId: S, turnId: 't1', agent: 'axl', type: 'token', data: { text: 'lo' } } },
    )
    assert.deepEqual([s.live.status, s.live.text, s.live.reasoning, s.live.tool], ['running', 'Hello', 'hm', null])
    s = sessionReducer(s, { type: 'session_message', data: { sessionId: S, message: row(1, { content: 'Hello' }) } })
    assert.equal(s.live.text, '', 'the row now carries the words — not drawn twice')
    assert.equal(s.live.turnId, 't1', 'still running until done')
    s = sessionReducer(s, { type: 'session_turn', data: { sessionId: S, turnId: 't1', agent: 'axl', status: 'done', payload: { suggestions: ['A'] } } })
    assert.equal(s.live, null)
    assert.deepEqual(s.lastTurn, { turnId: 't1', agent: 'axl', status: 'done', payload: { suggestions: ['A'] }, reason: null, message: null })
})

test('stopped / refused / error end the turn; another turn’s end leaves ours running', () => {
    const running = sessionReducer(loaded, { type: 'session_turn', data: { sessionId: S, turnId: 't1', agent: 'mentor', status: 'started' } })
    for (const status of ['stopped', 'refused', 'error']) {
        const s = sessionReducer(running, { type: 'session_turn', data: { sessionId: S, turnId: 't1', agent: 'mentor', status, reason: 'x', message: 'm' } })
        assert.equal(s.live, null)
        assert.equal(s.lastTurn.status, status)
    }
    const other = sessionReducer(running, { type: 'session_turn', data: { sessionId: S, turnId: 't0', agent: 'axl', status: 'done' } })
    assert.equal(other.live.turnId, 't1')
})

test('a chain turn the client never sent shows up live from its first frame', () => {
    const s = sessionReducer(loaded, { type: 'session_delta', data: { sessionId: S, turnId: 'chn_1_1', agent: 'mentor', type: 'token', data: { text: 'On it' } } })
    assert.deepEqual([s.live.turnId, s.live.agent, s.live.text], ['chn_1_1', 'mentor', 'On it'])
})

test('the POST failing clears the queued turn and keeps the reason', () => {
    const s = fold(loaded, { type: 'sending', turnId: 't1', agent: 'axl' }, { type: 'sendFailed', turnId: 't1', message: 'offline' })
    assert.equal(s.live, null)
    assert.equal(s.lastTurn.message, 'offline')
})

test('replay: a turn running on the server is shown; one we showed that ended while away is cleared', () => {
    const s = sessionReducer(loaded, { type: 'session_replay', data: { sessionId: S, messages: [], running: { turnId: 't9', agent: 'scanner', text: 'scan' } } })
    assert.deepEqual([s.live.turnId, s.live.agent], ['t9', 'scanner'])
    const after = sessionReducer(s, { type: 'session_replay', data: { sessionId: S, messages: [], running: null } })
    assert.equal(after.live, null)
})

test('removed rows go; state patches: an agent’s state, the floor, the chain, archived → next', () => {
    let s = fold(loaded, { type: 'session_message', data: { sessionId: S, message: row(1) } }, { type: 'session_message', data: { sessionId: S, message: row(2) } })
    s = sessionReducer(s, { type: 'session_removed', data: { sessionId: S, seqs: [2] } })
    assert.deepEqual(s.rows.map(r => r.seq), [1])
    s = fold(s,
        { type: 'session_state', data: { sessionId: S, agent: 'mentor', state: { draft: 2 } } },
        { type: 'session_state', data: { sessionId: S, floor: 'mentor' } },
        { type: 'session_state', data: { sessionId: S, chain: { id: 'c', status: 'awaiting', awaiting: { agent: 'axl', choices: ['continue'] } } } },
    )
    assert.deepEqual(s.agentState.mentor, { draft: 2 })
    assert.equal(s.floor, 'mentor')
    assert.equal(s.chain.status, 'awaiting')
    s = sessionReducer(s, { type: 'session_state', data: { sessionId: S, archived: true, next: 'ses_2' } })
    assert.deepEqual([s.status, s.next], ['archived', 'ses_2'])
})

test('a card resolves by its msgId — status, outcome, and the review’s payload patch', () => {
    const card = row(1, { kind: 'card', agent: 'portfolio', ref: { msgId: 'm1' }, card: { status: 'pending', payload: { portfolioId: 'p1' } } })
    let s = sessionReducer(loaded, { type: 'session_message', data: { sessionId: S, message: card } })
    s = sessionReducer(s, { type: 'message_resolved', data: { id: 'm1', conversationId: 'c', status: 'done', resolveOutcome: 'updated', payloadPatch: { nextReviewAt: 99 } } })
    assert.equal(s.rows[0].card.status, 'done')
    assert.equal(s.rows[0].card.resolveOutcome, 'updated')
    assert.deepEqual(s.rows[0].card.payload, { portfolioId: 'p1', nextReviewAt: 99 })
    assert.equal(sessionReducer(s, { type: 'message_resolved', data: { id: 'nope', status: 'done' } }), s, 'not ours → same state')
})

test('tap options: only under the last reply, gone once the user has answered', () => {
    const withTaps = [row(1, { role: 'user', content: 'hi' }), row(2, { ref: { suggestions: ['A', 'B'] } })]
    assert.deepEqual(lastTapOptions(withTaps), ['A', 'B'])
    assert.deepEqual(lastTapOptions([...withTaps, row(3, { role: 'user', content: 'A' })]), [])
    assert.deepEqual(lastTapOptions([...withTaps, row(3, { kind: 'card' })]), ['A', 'B'], 'a card arriving does not hide them')
    assert.deepEqual(lastTapOptions([]), [])
})

// ─── Phase 7 CR ───────────────────────────────────────────────────────────────

test('speaking while a turn runs queues behind it; it becomes live when the server starts it', () => {
    let s = sessionReducer(loaded, { type: 'session_turn', data: { sessionId: S, turnId: 'chn_1', agent: 'mentor', status: 'started' } })
    s = sessionReducer(s, { type: 'sending', turnId: 't2', agent: 'mentor', text: 'wait, use AMD' })
    assert.equal(s.live.turnId, 'chn_1', 'the running turn keeps the screen')
    assert.deepEqual(s.queuedTurn, { turnId: 't2', agent: 'mentor', text: 'wait, use AMD' })
    s = sessionReducer(s, { type: 'session_turn', data: { sessionId: S, turnId: 'chn_1', agent: 'mentor', status: 'done' } })
    assert.equal(s.live, null)
    assert.equal(s.queuedTurn.turnId, 't2', 'still waiting until the server starts it')
    s = sessionReducer(s, { type: 'session_turn', data: { sessionId: S, turnId: 't2', agent: 'mentor', status: 'started' } })
    assert.equal(s.live.turnId, 't2')
    assert.equal(s.queuedTurn, null)
})

test('a queued turn that fails to post, or is stopped before it runs, leaves the queue', () => {
    const running = sessionReducer(loaded, { type: 'session_turn', data: { sessionId: S, turnId: 'a', agent: 'axl', status: 'started' } })
    const queued = sessionReducer(running, { type: 'sending', turnId: 'b', agent: 'axl', text: 'x' })
    const failed = sessionReducer(queued, { type: 'sendFailed', turnId: 'b', message: 'offline' })
    assert.equal(failed.queuedTurn, null)
    assert.equal(failed.live.turnId, 'a')
    assert.equal(failed.lastTurn.message, 'offline')
    const stopped = sessionReducer(queued, { type: 'session_turn', data: { sessionId: S, turnId: 'b', agent: 'axl', status: 'stopped', queued: true } })
    assert.equal(stopped.queuedTurn, null)
})

test('replay: the server’s running turn wins over a stale one; a turn we just sent survives an empty replay', () => {
    const stale = sessionReducer(loaded, { type: 'session_turn', data: { sessionId: S, turnId: 'old', agent: 'axl', status: 'started' } })
    const s = sessionReducer(stale, { type: 'session_replay', data: { sessionId: S, messages: [], running: { turnId: 'new', agent: 'mentor' } } })
    assert.deepEqual([s.live.turnId, s.live.agent], ['new', 'mentor'])
    const justSent = sessionReducer(loaded, { type: 'sending', turnId: 't1', agent: 'axl' })
    assert.equal(sessionReducer(justSent, { type: 'session_replay', data: { sessionId: S, messages: [], running: null } }).live.turnId, 't1')
})

test('tap options vanish once a decision, hand-off or reopened context follows the reply', () => {
    const reply = row(2, { ref: { suggestions: ['A'] } })
    for (const kind of ['decision', 'handoff', 'sealed']) assert.deepEqual(lastTapOptions([reply, row(3, { kind })]), [], kind)
})
