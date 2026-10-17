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
