import { httpService } from '../http.service'
import { streamAgent } from '../agentStream'
import { makeEntityApi } from '../entityApi'

const BASE = 'api/scanner'

export const scannerService = {
    sendStream,
    listScans, createScan, updateScan, deleteScan,
    saveChatState, getChatState, deleteChatState,
}

async function sendStream(messages, opts = {}) {
    const { model, reasoningEffort, routingMode, currentPhase, editList = null, handoff = false, handoffTo = null, profile = 'trading' } = opts
    await streamAgent(BASE, { messages, model, editList, handoff, handoffTo, profile, reasoningEffort, routingMode, currentPhase }, opts)
}

// The scans list is an owner-scoped list like any other, so it rides the shared transport.
// `listKey`: this route answers `{ scans: [...] }` rather than a bare array.
const api = makeEntityApi({ base: `${BASE}/scans`, listKey: 'scans' })

function listScans() { return api.list() }

async function createScan(scan) {
    const data = await api.post('', { scan })
    return data.scan
}

async function updateScan(id, scan) {
    const data = await api.put(id, { scan })
    return data.scan
}

function deleteScan(id) { return api.remove(id) }

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
