import { streamAgent } from '../agentStream'
import { makeEntityApi } from '../entityApi'

const BASE = 'api/scanner'

export const scannerService = {
    sendStream,
    listScans, getScan, createScan, updateScan, deleteScan,
}

async function sendStream(messages, opts = {}) {
    const { model, editList = null, handoff = false, handoffTo = null,
            radar = false, radarBoard = null, profile = 'trading' } = opts
    await streamAgent(BASE,
        { messages, model, editList, handoff, handoffTo, radar, radarBoard, profile }, opts)
}

// The scans list is an owner-scoped list like any other, so it rides the shared transport.
// `listKey`: this route answers `{ scans: [...] }` rather than a bare array.
const api = makeEntityApi({ base: `${BASE}/scans`, listKey: 'scans' })

function listScans() { return api.list() }

async function getScan(id) {
    const data = await api.get(id)
    return data?.scan ?? null
}

async function createScan(scan) {
    const data = await api.post('', { scan })
    return data.scan
}

async function updateScan(id, scan) {
    const data = await api.put(id, { scan })
    return data.scan
}

function deleteScan(id) { return api.remove(id) }
