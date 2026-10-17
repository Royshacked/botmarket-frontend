import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// useSession: load, replay on load and on every reconnect, fold the socket, post turns, stop, tap, new
// session (unified-chat plan phase 7, J6). A fake socket and a fake REST client — no network.

const stopTurn = vi.fn(async () => true)
vi.mock('../services/turn.service', () => ({ newTurnId: () => 'turn_x', stopTurn: (...a) => stopTurn(...a) }))
const openChart = vi.fn()
vi.mock('../services/chartSurface.service', () => ({ openChart: (...a) => openChart(...a) }))

const { useSession } = await import('./useSession.js')

function fakeWs() {
    const listeners = {}
    return {
        sent: [],
        on: (e, h) => { (listeners[e] ??= new Set()).add(h) },
        off: (e, h) => listeners[e]?.delete(h),
        send(event, data) { this.sent.push({ event, data }); return true },
        emit: (e, d) => listeners[e]?.forEach(h => h(d)),
        count: (e) => listeners[e]?.size ?? 0,
    }
}

function fakeApi(over = {}) {
    return {
        getActive: vi.fn(async () => ({ sessionId: 's1', scope: 'main', status: 'active', floor: 'axl' })),
        startNew:  vi.fn(async () => ({ sessionId: 's2', scope: 'main', status: 'active', floor: 'axl' })),
        turn:      vi.fn(async () => ({ turnId: 'turn_x', agent: 'axl' })),
        continue:  vi.fn(async () => ({ ok: true })),
        ...over,
    }
}

let ws, api
beforeEach(() => { ws = fakeWs(); api = fakeApi(); stopTurn.mockClear(); openChart.mockClear() })

const mount = () => renderHook(() => useSession('main', { ws, api }))

describe('useSession', () => {
    it('loads the active session and asks for a replay from seq 0', async () => {
        const { result } = mount()
        await waitFor(() => expect(result.current.sessionId).toBe('s1'))
        expect(api.getActive).toHaveBeenCalledWith('main')
        expect(ws.sent).toEqual([{ event: 'session_sync', data: { sessionId: 's1', afterSeq: 0 } }])
    })

    it('a reconnect replays from the last seq it holds', async () => {
        const { result } = mount()
        await waitFor(() => expect(result.current.sessionId).toBe('s1'))
        act(() => ws.emit('session_message', { sessionId: 's1', message: { seq: 7, agent: 'axl', role: 'assistant', kind: 'msg', content: 'hi' } }))
        act(() => ws.emit('connected', null))
        expect(ws.sent.at(-1)).toEqual({ event: 'session_sync', data: { sessionId: 's1', afterSeq: 7 } })
    })

    it('send posts the turn with its id and extras; the turn is live (stoppable) at once', async () => {
        const { result } = mount()
        await waitFor(() => expect(result.current.sessionId).toBe('s1'))
        await act(() => result.current.send('Trade it', { accounts: ['a1'] }))
        expect(api.turn).toHaveBeenCalledWith('s1', { text: 'Trade it', agent: null, turnId: 'turn_x', accounts: ['a1'] })
        expect(result.current.live).toMatchObject({ turnId: 'turn_x', status: 'queued' })
        act(() => { result.current.stop() })
        expect(stopTurn).toHaveBeenCalledWith('turn_x')
    })

    it('a failed POST clears the turn and keeps the reason; empty text sends nothing', async () => {
        api = fakeApi({ turn: vi.fn(async () => { throw new Error('offline') }) })
        const { result } = mount()
        await waitFor(() => expect(result.current.sessionId).toBe('s1'))
        expect(await act(() => result.current.send('   '))).toBe(false)
        await act(() => result.current.send('hello'))
        expect(result.current.live).toBe(null)
        expect(result.current.lastTurn.status).toBe('error')
    })

    it('a decision tap posts continue; an error comes back to show', async () => {
        api = fakeApi({ continue: vi.fn(async () => { throw new Error('gone') }) })
        const { result } = mount()
        await waitFor(() => expect(result.current.sessionId).toBe('s1'))
        let err
        await act(async () => { err = await result.current.choose('continue') })
        expect(api.continue).toHaveBeenCalledWith('s1', 'continue')
        expect(typeof err).toBe('string')
    })

    it('New session loads the new one and replays it', async () => {
        const { result } = mount()
        await waitFor(() => expect(result.current.sessionId).toBe('s1'))
        await act(() => result.current.startNew())
        await waitFor(() => expect(result.current.sessionId).toBe('s2'))
        expect(ws.sent.at(-1)).toEqual({ event: 'session_sync', data: { sessionId: 's2', afterSeq: 0 } })
    })

    it('a live chart the user asked for docks on the shared chart surface', async () => {
        const { result } = mount()
        await waitFor(() => expect(result.current.sessionId).toBe('s1'))
        act(() => ws.emit('session_delta', { sessionId: 's1', turnId: 't', agent: 'axl', type: 'chart', data: { live: true, symbol: 'SPY' } }))
        expect(openChart).toHaveBeenCalledWith({ live: true, symbol: 'SPY' })
    })

    it('unmount unsubscribes every listener', async () => {
        const { result, unmount } = mount()
        await waitFor(() => expect(result.current.sessionId).toBe('s1'))
        expect(ws.count('session_message')).toBe(1)
        unmount()
        expect(ws.count('session_message')).toBe(0)
        expect(ws.count('connected')).toBe(0)
    })
})

// ─── a desk's surface: commits, hand edits, reopening (phase 8b) ──────────────

const refusal = (status, data) => Object.assign(new Error('refused'), { response: { status, data } })

describe('useSession — commit / edit / reopen', () => {
    it('a commit names the revision the user was looking at, and folds in the one it left', async () => {
        api.getActive = vi.fn(async () => ({ sessionId: 's1', scope: 'main', status: 'active', floor: 'mentor', agentRev: { mentor: 4 } }))
        api.act = vi.fn(async () => ({ setup: { id: 'n1' }, rev: 6 }))
        const { result } = mount()
        await waitFor(() => expect(result.current.sessionId).toBe('s1'))
        let out
        await act(async () => { out = await result.current.commit('mentor', 'generate', { accounts: [{ id: 'a1' }] }) })
        expect(api.act).toHaveBeenCalledWith('s1', { agent: 'mentor', action: 'generate', args: { accounts: [{ id: 'a1' }] }, rev: 4 })
        expect(out).toEqual({ ok: true, result: { setup: { id: 'n1' } } })
        expect(result.current.agentRev.mentor).toBe(6)
    })

    it('a refusal is a value — its reason, its words and its extra — and a stale one moves the revision on', async () => {
        api.act = vi.fn(async () => { throw refusal(409, { error: 'That changed while you were looking', reason: 'stale_state', rev: 9 }) })
        const { result } = mount()
        await waitFor(() => expect(result.current.sessionId).toBe('s1'))
        let out
        await act(async () => { out = await result.current.commit('mentor', 'generate') })
        expect(out).toEqual({ ok: false, reason: 'stale_state', message: 'That changed while you were looking', extra: { rev: 9 }, status: 409 })
        expect(result.current.agentRev.mentor).toBe(9)

        api.act = vi.fn(async () => { throw refusal(409, { error: 'Nothing could be saved', reason: 'nothing_saved', failed: [{ asset: 'X' }] }) })
        await act(async () => { out = await result.current.commit('mentor', 'generateAll') })
        expect(out.extra).toEqual({ failed: [{ asset: 'X' }] })
    })

    it('a hand edit names the revision too, and takes the new one', async () => {
        api.editState = vi.fn(async () => ({ ok: true, rev: 2 }))
        const { result } = mount()
        await waitFor(() => expect(result.current.sessionId).toBe('s1'))
        await act(async () => { await result.current.edit('scanner', { profile: 'investing' }) })
        expect(api.editState).toHaveBeenCalledWith('s1', { agent: 'scanner', edit: { profile: 'investing' }, rev: 0 })
        expect(result.current.agentRev.scanner).toBe(2)
    })

    it('a debounced edit names the revision it was MADE against, not the one current when it goes (8b CR)', async () => {
        api.editState = vi.fn(async () => ({ ok: true, rev: 6 }))
        const { result } = mount()
        await waitFor(() => expect(result.current.sessionId).toBe('s1'))
        let out
        await act(async () => { out = await result.current.edit('mentor', { draft: {} }, { rev: 4 }) })
        expect(api.editState).toHaveBeenCalledWith('s1', { agent: 'mentor', edit: { draft: {} }, rev: 4 })
        expect(out).toEqual({ ok: true, result: {}, rev: 6 })
    })

    it('reopen answers busy with the agent holding the work — the caller asks, then repeats with force', async () => {
        api.edit = vi.fn(async (sid, body) => {
            if (!body.force) throw refusal(409, { error: 'That desk is in the middle of something else', reason: 'busy', agent: 'mentor' })
            return { agent: 'mentor', floor: 'mentor' }
        })
        const { result } = mount()
        await waitFor(() => expect(result.current.sessionId).toBe('s1'))
        let out
        await act(async () => { out = await result.current.reopen('setup', 's9', { name: 'NVDA setup' }) })
        expect(out.reason).toBe('busy')
        expect(out.extra.agent).toBe('mentor')
        await act(async () => { out = await result.current.reopen('setup', 's9', { force: true }) })
        expect(out).toEqual({ ok: true, result: { agent: 'mentor', floor: 'mentor' } })
        expect(api.edit).toHaveBeenLastCalledWith('s1', { kind: 'setup', id: 's9', name: null, force: true, reviewMode: false })
    })
})

describe('useSession — phase 8b bug hunt', () => {
    it('#1: a stale refusal asks for a replay, so the surface redraws before the next press', async () => {
        api.act = vi.fn(async () => { throw refusal(409, { error: 'changed', reason: 'stale_state', rev: 5 }) })
        const { result } = mount()
        await waitFor(() => expect(result.current.sessionId).toBe('s1'))
        ws.sent.length = 0
        await act(async () => { await result.current.commit('mentor', 'generate') })
        expect(ws.sent).toEqual([{ event: 'session_sync', data: { sessionId: 's1', afterSeq: 0 } }])
    })

    it('#2: a turn or a reopen asked before the session has loaded WAITS for it, then goes', async () => {
        let open
        api.getActive = vi.fn(() => new Promise(r => { open = r }))
        api.edit = vi.fn(async () => ({ agent: 'mentor' }))
        const { result } = mount()
        let sent, reopened
        act(() => { sent = result.current.send('Work on NVDA', { agent: 'mentor' }) })
        act(() => { reopened = result.current.reopen('setup', 's9') })
        expect(api.turn).not.toHaveBeenCalled()
        await act(async () => { open({ sessionId: 's1', scope: 'main', status: 'active', floor: 'axl' }) })
        expect(await sent).toBe(true)
        expect(api.turn).toHaveBeenCalledWith('s1', expect.objectContaining({ text: 'Work on NVDA', agent: 'mentor' }))
        expect((await reopened).ok).toBe(true)
    })

    it('a load that failed answers a waiting press at once, not after the wait (8b CR)', async () => {
        let fail
        api.getActive = vi.fn(() => new Promise((_, reject) => { fail = reject }))
        const { result } = mount()
        api.act = vi.fn()
        let pressed
        act(() => { pressed = result.current.commit('mentor', 'generate') })
        await act(async () => { fail(new Error('down')) })
        expect((await pressed).ok).toBe(false)
        expect(api.act).not.toHaveBeenCalled()
    })
})
