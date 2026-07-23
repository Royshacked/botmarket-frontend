import { httpService } from '../http.service'

const BASE = 'api/chat'

export const chatService = {
    async getConversations() {
        const { conversations } = await httpService.get(`${BASE}/conversations`)
        return conversations
    },

    async getMessages(convId, before = null, limit = 50) {
        const params = new URLSearchParams({ limit })
        if (before) params.set('before', before)
        const { messages } = await httpService.get(`${BASE}/conversations/${convId}/messages?${params}`)
        return messages
    },

    // `aiPref` ({ routingMode, model, reasoningEffort }) is forwarded only for the
    // Axl (bot) conversation so Axl's reply obeys the same AI-mode the user set for
    // the specialist agents. Ignored by the backend for user-to-user DMs.
    async sendMessage(convId, content, aiPref = null) {
        const body = aiPref ? { content, ...aiPref } : { content }
        const { message } = await httpService.post(`${BASE}/conversations/${convId}/messages`, body)
        return message
    },

    async markRead(convId) {
        return httpService.post(`${BASE}/conversations/${convId}/read`)
    },

    // Resolve a card's lifecycle — the one path every card takes. status 'done' (the user acted on
    // the primary) or 'dismissed' (acknowledged, no action); outcome records which action for the
    // collapsed label. Supersedes dismissMessage (kept below as a thin alias for any old caller).
    async resolveMessage(convId, msgId, { status = 'dismissed', outcome = null } = {}) {
        return httpService.post(`${BASE}/conversations/${convId}/messages/${msgId}/resolve`, { status, outcome })
    },

    async dismissMessage(convId, msgId, outcome = null) {
        return this.resolveMessage(convId, msgId, { status: 'dismissed', outcome })
    },

    async searchUsers(q) {
        const { users } = await httpService.get(`${BASE}/users/search?q=${encodeURIComponent(q)}`)
        return users
    },

    async startConversation(userId) {
        const { conversation } = await httpService.post(`${BASE}/conversations`, { userId })
        return conversation
    },
}
