import { httpService } from '../http.service.js'

// Client for the situation network's board (botmarket-backend api/situation; docs/design/situation-network.md §11.6).
// ALLOW-LISTED users only: for anyone else every route is a 404, and `access()` says false. The reads THROW on failure —
// the panel says "couldn't load" rather than show an empty network.

const BASE = 'api/situation'

export const situationService = { access, getLatest, getRun, getNodeHistory, getScorecard, override }

/** May this user see the board? → true / false (a 404 or any failure is false). */
async function access() {
    try { return Boolean((await httpService.get(`${BASE}/access`))?.ok) } catch { return false }
}

/** The latest complete run, whole: `{ run, state, nodes, links, dropped, industries, outside, runs, canOverride }`. */
async function getLatest() {
    return httpService.get(BASE)
}

/** One run, whole. */
async function getRun(id) {
    return httpService.get(`${BASE}/runs/${encodeURIComponent(id)}`)
}

/** One node's numbers run by run → `[{ run_id, as_of, kind, status, set_by, options: [{ key, label, p }] }]`. */
async function getNodeHistory(id) {
    return (await httpService.get(`${BASE}/nodes/${encodeURIComponent(id)}/history`))?.history ?? []
}

/** The forward test against its declared rule. */
async function getScorecard() {
    return httpService.get(`${BASE}/scorecard`)
}

/** Roy's numbers for one node (`{ option: number }`) → a new run. Admin only. */
async function override(id, p) {
    return httpService.post(`${BASE}/nodes/${encodeURIComponent(id)}/override`, { p })
}
