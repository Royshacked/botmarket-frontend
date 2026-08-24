import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// A socket can go HALF-OPEN — sleep/resume, a wifi switch, a proxy that drops the connection
// without a FIN. `readyState` stays OPEN, so `onclose` never fires, so we never reconnect, so no
// `new_message` ever arrives again and the unread badge sits still until a REST read. We ping
// anyway; the pong is the only proof the pipe is alive. These pin that we notice.

const sockets = []

class FakeSocket {
    static OPEN = 1
    static CLOSING = 2
    static CLOSED = 3
    constructor(url) {
        this.url = url
        this.readyState = FakeSocket.OPEN
        this.sent = []
        sockets.push(this)
    }
    send(frame) { this.sent.push(frame) }
    close() {
        this.readyState = FakeSocket.CLOSED
        this.onclose?.()
    }
    /** Simulate the pipe dying with no close frame: still OPEN to us, but nothing comes back. */
    goHalfOpen() { this.close = () => { this.readyState = FakeSocket.CLOSED; this.onclose?.() } }
    deliver(event, data) { this.onmessage?.({ data: JSON.stringify({ event, data }) }) }
}

let chatWsService

beforeEach(async () => {
    sockets.length = 0
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeSocket)
    vi.resetModules()   // the service holds module-level socket state
    ;({ chatWsService } = await import('./chatWs.service.js'))
})

afterEach(() => {
    chatWsService.disconnect()
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

const frames = ws => ws.sent.map(f => JSON.parse(f).event)

function connected() {
    chatWsService.connect()
    const ws = sockets.at(-1)
    ws.onopen()
    return ws
}

describe('chatWs heartbeat', () => {
    it('pings on the interval and stays open when the pong comes back', () => {
        const ws = connected()

        vi.advanceTimersByTime(25_000)
        expect(frames(ws)).toEqual(['ping'])

        ws.deliver('pong')
        vi.advanceTimersByTime(30_000)          // well past the grace window

        expect(ws.readyState).toBe(FakeSocket.OPEN)
        expect(sockets).toHaveLength(1)         // no reconnect — nothing was wrong
    })

    it('closes itself when no pong answers — a half-open socket would never reconnect', () => {
        const ws = connected()

        vi.advanceTimersByTime(25_000)          // ping sent, grace window armed
        expect(ws.readyState).toBe(FakeSocket.OPEN)

        vi.advanceTimersByTime(10_000)          // grace elapsed, silence
        expect(ws.readyState).toBe(FakeSocket.CLOSED)
    })

    it('the forced close leads to a real reconnect', () => {
        connected()

        vi.advanceTimersByTime(25_000 + 10_000) // ping → no pong → self-close
        vi.advanceTimersByTime(3_000)           // reconnect backoff

        expect(sockets).toHaveLength(2)
        expect(sockets[1].url).toBe(sockets[0].url)
    })

    it('any frame counts as proof of life, not just the pong', () => {
        const ws = connected()

        vi.advanceTimersByTime(25_000)
        ws.deliver('new_message', { id: 'm1' })
        vi.advanceTimersByTime(10_000)

        expect(ws.readyState).toBe(FakeSocket.OPEN)
    })

    it('a deliberate disconnect never reconnects and never fires the watchdog', () => {
        const ws = connected()
        chatWsService.disconnect()

        vi.advanceTimersByTime(120_000)
        expect(sockets).toHaveLength(1)
        expect(frames(ws)).toEqual([])          // ping loop stopped with it
    })

    it('the ping loop dies with its socket — a reconnected one gets a fresh watchdog', () => {
        connected()
        vi.advanceTimersByTime(35_000)          // first socket self-closes
        vi.advanceTimersByTime(3_000)           // reconnect
        const second = sockets[1]
        second.onopen()

        vi.advanceTimersByTime(25_000)
        expect(frames(second)).toEqual(['ping'])   // exactly one loop, not two stacked
    })
})
