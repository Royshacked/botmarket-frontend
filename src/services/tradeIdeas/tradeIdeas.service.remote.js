import { httpService } from '../http.service'

export const tradeIdeasService = {
    createIdea,
    getIdeas,
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

async function deleteIdea(id) {
    return httpService.delete(`trade-ideas/${id}`)
}

async function updateIdea(id, patch) {
    return httpService.patch(`trade-ideas/${id}`, patch)
}
