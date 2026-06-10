import { httpService } from '../http.service'

export const tradeIdeasService = {
    createIdea,
    createBatch,
    getIdeas,
    getIdea,
    deleteIdea,
    updateIdea,
}

async function createIdea(idea) {
    const res = await httpService.post('trade-ideas', idea)
    return res.idea
}

async function getIdeas() {
    const res = await httpService.get('trade-ideas')
    return Array.isArray(res.ideas) ? res.ideas : []
}

async function getIdea(id) {
    const res = await httpService.get(`trade-ideas/${id}`)
    return res.idea ?? null
}

async function deleteIdea(id) {
    return httpService.delete(`trade-ideas/${id}`)
}

async function updateIdea(id, patch) {
    return httpService.patch(`trade-ideas/${id}`, patch)
}

async function createBatch(plan, accounts = [], mainAccountId = null) {
    const res = await httpService.post('trade-ideas/batch', { plan, accounts, mainAccountId })
    return Array.isArray(res.ideas) ? res.ideas : []
}
