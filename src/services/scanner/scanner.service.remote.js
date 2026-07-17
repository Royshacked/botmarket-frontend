import { httpService } from '../http.service'
import { API_BASE } from '../config'
import { postSSE, buildStreamHandlers } from '../sse.util'

const BASE = 'api/scanner'

export const scannerService = {
    sendStream,
    listScans, createScan, updateScan, deleteScan,
    saveChatState, getChatState, deleteChatState,
}

async function sendStream(messages, opts = {}) {
    const { model, reasoningEffort, routingMode, currentPhase, signal, editList = null, handoff = false } = opts
    await postSSE(
        `${API_BASE}/${BASE}/stream`,
        { messages, model, editList, handoff, reasoningEffort, routingMode, currentPhase },
        buildStreamHandlers(opts),
        { signal },
    )
}

async function listScans() {
    // Swallow load failures to an empty list; httpService already logs + handles 401.
    try {
        const data = await httpService.get(`${BASE}/scans`)
        return Array.isArray(data.scans) ? data.scans : []
    } catch { return [] }
}

async function createScan(scan) {
    const data = await httpService.post(`${BASE}/scans`, { scan })
    return data.scan
}

async function updateScan(id, scan) {
    const data = await httpService.put(`${BASE}/scans/${encodeURIComponent(id)}`, { scan })
    return data.scan
}

async function deleteScan(id) {
    return httpService.delete(`${BASE}/scans/${encodeURIComponent(id)}`)
}

async function saveChatState(messages) {
    return httpService.post(`${BASE}/chat-state`, { messages })
}

async function getChatState() {
    try {
        const data = await httpService.get(`${BASE}/chat-state`)
        return data.chatState ?? null
    } catch { return null }
}

async function deleteChatState() {
    return httpService.delete(`${BASE}/chat-state`)
}
