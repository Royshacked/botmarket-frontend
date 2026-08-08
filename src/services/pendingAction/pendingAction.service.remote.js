import { httpService, apiError } from '../http.service'

const BASE = 'api/pending-actions'

export const pendingActionService = { list, countReady, execute, cancel }

/**
 * Everything waiting on the user: work confirmed off-hours and queued for the open, plus entities
 * the sweep already unparked and left awaiting confirmation. One row shape whatever the source —
 * `source` only decides which endpoint executes it.
 *
 * Returns [] on failure. The queued list degrades to empty rather than blocking the Floor; the
 * items are still in the store and the next load shows them.
 */
async function list({ readyOnly = false } = {}) {
    try {
        const data = await httpService.get(`${BASE}${readyOnly ? '?ready=1' : ''}`)
        return data.items ?? []
    } catch { return [] }
}

/** How many are executable right now — the count on the Floor's queued desk. */
async function countReady() {
    return (await list({ readyOnly: true })).length
}

/**
 * Run a released action for real. Unlike the reads, this does NOT swallow failure: the user pressed
 * a button and is waiting to be told whether it went through. Returns { ok } or { ok:false, error }
 * with the server's own reason, which queuedAction.contract turns into words.
 */
async function execute(id) {
    try {
        return await httpService.post(`${BASE}/${encodeURIComponent(id)}/execute`)
    } catch (err) {
        return { ok: false, error: _reason(err) }
    }
}

/** Drop a queued action. The server tells the desk that decided it — see originRegistry. */
async function cancel(id) {
    try {
        return await httpService.post(`${BASE}/${encodeURIComponent(id)}/cancel`)
    } catch (err) {
        return { ok: false, error: _reason(err) }
    }
}

// `apiError` is the ONE reader for a failed call — it lives next to the thrower because `ajax`
// rethrows the raw axios error, so the server's payload is at err.response.data and reaching for
// err.data silently falls through to axios's own text. Our refusals ARE the slug ({ error:
// 'add_too_small' }), so this returns it and queuedAction.contract turns it into a sentence.
const _reason = (err) => apiError(err, 'failed')
