import { httpService } from '../http.service'

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
 * Create an idea. A multi-broker idea is forked server-side into independent
 * single-broker children, so this returns an ARRAY (one entry for the common
 * single-broker case, N for a forked one).
 * @returns {Promise<object[]>}
 */
async function createIdea(idea) {
    const res = await httpService.post('api/trade-ideas', idea)
    return Array.isArray(res.ideas) ? res.ideas : (res.idea ? [res.idea] : [])
}

async function getIdeas() {
    const res = await httpService.get('api/trade-ideas')
    return Array.isArray(res.ideas) ? res.ideas : []
}

async function getIdea(id) {
    const res = await httpService.get(`api/trade-ideas/${id}`)
    return res.idea ?? null
}

async function deleteIdea(id) {
    return httpService.delete(`api/trade-ideas/${id}`)
}

async function updateIdea(id, patch) {
    return httpService.patch(`api/trade-ideas/${id}`, patch)
}

async function createBatch(plan, accounts = [], mainAccountId = null, portfolioId = null) {
    const res = await httpService.post('api/trade-ideas/batch', { plan, accounts, mainAccountId, portfolioId })
    return Array.isArray(res.ideas) ? res.ideas : []
}

async function placeOrders(id, orders) {
    const res = await httpService.post(`api/trade-ideas/${id}/orders`, { orders })
    return res.idea ?? null
}

// "Buy now" from the pre-flight prompt: force-trigger a looking idea's entry
// (→ hit + built plan) so the order-confirm dialog surfaces.
async function triggerEntry(id) {
    const res = await httpService.post(`api/trade-ideas/${id}/trigger`, {})
    return res.idea ?? null
}
