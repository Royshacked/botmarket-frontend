import { API_BASE } from '../config'

const WS_URL = API_BASE
    ? API_BASE.replace(/^http/, 'ws') + '/ws/chat'
    : (window.location.protocol === 'https:' ? 'wss' : 'ws') + '://' + window.location.host + '/ws/chat'

const listeners = {}   // event → Set<handler>
let socket     = null
let reconnectTimer = null
let shouldConnect  = false

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
            _dispatch(event, data)
        } catch { /* ignore malformed */ }
    }

    socket.onclose = () => {
        socket = null
        if (shouldConnect) reconnectTimer = setTimeout(_open, 3000)
    }

    socket.onerror = () => {
        socket?.close()
    }
}

let pingInterval = null
function _startPing() {
    clearInterval(pingInterval)
    pingInterval = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ event: 'ping' }))
        }
    }, 25000)
}
