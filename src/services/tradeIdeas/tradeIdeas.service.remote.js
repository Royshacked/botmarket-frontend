import { makeEntityApi } from '../entityApi'

// Trade ideas. Transport is the shared entityApi; what stays here is the idea kind's own judgment —
// multi-broker forking, the order-placement surface, and the pre-flight "buy now" trigger.
//
// No change broadcast: unlike the other kinds, the ideas list is owned by useTradeIdeas, which
// polls and re-fetches on a workspace switch. Adding an event here would double-fetch.

// `listKey`: this route answers `{ ideas: [...] }`, unlike the newer bare-array routes.
const api = makeEntityApi({ base: 'api/trade-ideas', listKey: 'ideas' })

export const tradeIdeasService = {
    createIdea,
    createBatch,
    getIdeas,
    getIdea,
    deleteIdea,
    updateIdea,
    placeOrders,
    triggerEntry,
}

/**
 * Create an idea. A multi-broker idea is forked server-side into independent single-broker
 * children, so this returns an ARRAY (one entry for the common single-broker case, N for a forked one).
 * @returns {Promise<object[]>}
 */
async function createIdea(idea) {
    const res = await api.post('', idea)
    return Array.isArray(res.ideas) ? res.ideas : (res.idea ? [res.idea] : [])
}

function getIdeas() { return api.list() }

async function getIdea(id) {
    const res = await api.get(id)
    return res?.idea ?? null
}

function deleteIdea(id)        { return api.remove(id) }
function updateIdea(id, patch) { return api.patch(id, patch) }

async function createBatch(plan, accounts = [], mainAccountId = null, portfolioId = null) {
    const res = await api.post('/batch', { plan, accounts, mainAccountId, portfolioId })
    return Array.isArray(res.ideas) ? res.ideas : []
}

async function placeOrders(id, orders) {
    const res = await api.post(`/${encodeURIComponent(id)}/orders`, { orders })
    return res.idea ?? null
}

// "Buy now" from the pre-flight prompt: force-trigger a looking idea's entry
// (→ hit + built plan) so the order-confirm dialog surfaces.
async function triggerEntry(id) {
    const res = await api.post(`/${encodeURIComponent(id)}/trigger`, {})
    return res.idea ?? null
}
