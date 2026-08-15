import { API_BASE } from '../config'

const WS_URL = API_BASE
    ? API_BASE.replace(/^http/, 'ws') + '/ws/chat'
    : (window.location.protocol === 'https:' ? 'wss' : 'ws') + '://' + window.location.host + '/ws/chat'

const listeners = {}   // event → Set<handler>
let socket     = null
let reconnectTimer = null
let shouldConnect  = false

const PING_MS       = 25000
const PONG_GRACE_MS = 10000

export const chatWsService = {
    connect,
    disconnect,
    on,
    off,
}

function connect() {
    shouldConnect = true
    _open()
}

function disconnect() {
    shouldConnect = false
    clearTimeout(reconnectTimer)
    clearTimeout(pongTimer)
    clearInterval(pingInterval)
    if (socket) { socket.onclose = null; socket.close(); socket = null }
}

function on(event, handler) {
    if (!listeners[event]) listeners[event] = new Set()
    listeners[event].add(handler)
}

function off(event, handler) {
    listeners[event]?.delete(handler)
}

function _dispatch(event, data) {
    listeners[event]?.forEach(h => { try { h(data) } catch { /* ignore */ } })
}

function _open() {
    if (socket || !shouldConnect) return
    socket = new WebSocket(WS_URL)

    socket.onopen = () => {
        clearTimeout(reconnectTimer)
        _startPing()
        _dispatch('connected', null)
    }

    socket.onmessage = (e) => {
        try {
            const { event, data } = JSON.parse(e.data)
            // ANY frame proves the pipe is alive, not just the pong we asked for.
            clearTimeout(pongTimer)
            pongTimer = null
            _dispatch(event, data)
        } catch { /* ignore malformed */ }
    }

    socket.onclose = () => {
        clearTimeout(pongTimer)
        pongTimer = null
        clearInterval(pingInterval)
        socket = null
        if (shouldConnect) reconnectTimer = setTimeout(_open, 3000)
    }

    socket.onerror = () => {
        socket?.close()
    }
}

// A socket can go HALF-OPEN — sleep/resume, a wifi switch, a proxy that drops the connection
// without a FIN — and `readyState` stays OPEN forever: no onclose, so no reconnect, so no events
// at all, and the unread badge sits still until a REST read. The pong is the only proof the pipe
// is alive; miss it and we close ourselves so the reconnect (and its badge re-read) can happen.
let pingInterval = null
let pongTimer    = null
function _startPing() {
    clearInterval(pingInterval)
    pingInterval = setInterval(() => {
        if (socket?.readyState !== WebSocket.OPEN) return
        socket.send(JSON.stringify({ event: 'ping' }))
        if (pongTimer) return                     // already waiting on an answer — don't push the deadline out
        pongTimer = setTimeout(() => {
            pongTimer = null
            socket?.close()                       // → onclose → reconnect in 3s
        }, PONG_GRACE_MS)
    }, PING_MS)
}
