import { API_BASE } from '../config'
import { postSSE } from '../sse.util'

export const scannerService = {
    sendStream,
    listScans, createScan, updateScan, deleteScan,
    saveChatState, getChatState, deleteChatState,
}

async function sendStream(messages, { onToken, onTicker, onStatus, onDone, onError, model, reasoningEffort, signal, editList = null } = {}) {
    await postSSE(
        `${API_BASE}/api/scanner/stream`,
        { messages, model, editList, reasoningEffort },
        {
            token:  (d) => onToken?.(d.text),
            ticker: (d) => onTicker?.(d.symbol),
            status: (d) => onStatus?.(d.tool),
            done:   (d) => onDone?.(d),
            error:  (d) => onError?.(d.message),
        },
        { signal },
    )
}

async function listScans() {
    const res = await fetch(`${API_BASE}/api/scanner/scans`, { credentials: 'include' })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data.scans) ? data.scans : []
}

async function createScan(scan) {
    const res = await fetch(`${API_BASE}/api/scanner/scans`, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ scan }),
    })
    if (!res.ok) throw new Error('Failed to save scan')
    const data = await res.json()
    return data.scan
}

async function updateScan(id, scan) {
    const res = await fetch(`${API_BASE}/api/scanner/scans/${encodeURIComponent(id)}`, {
        method:      'PUT',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ scan }),
    })
    if (!res.ok) throw new Error('Failed to update scan')
    const data = await res.json()
    return data.scan
}

async function deleteScan(id) {
    const res = await fetch(`${API_BASE}/api/scanner/scans/${encodeURIComponent(id)}`, {
        method:      'DELETE',
        credentials: 'include',
    })
    if (!res.ok) throw new Error('Failed to delete scan')
    return res.json()
}

async function saveChatState(messages) {
    const res = await fetch(`${API_BASE}/api/scanner/chat-state`, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ messages }),
    })
    if (!res.ok) throw new Error('Failed to save scanner chat state')
    return res.json()
}

async function getChatState() {
    const res = await fetch(`${API_BASE}/api/scanner/chat-state`, { credentials: 'include' })
    if (!res.ok) return null
    const data = await res.json()
    return data.chatState ?? null
}

async function deleteChatState() {
    const res = await fetch(`${API_BASE}/api/scanner/chat-state`, {
        method:      'DELETE',
        credentials: 'include',
    })
    if (!res.ok) throw new Error('Failed to delete scanner chat state')
    return res.json()
}
