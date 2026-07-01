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

    async sendMessage(convId, content) {
        const { message } = await httpService.post(`${BASE}/conversations/${convId}/messages`, { content })
        return message
    },

    async markRead(convId) {
        return httpService.post(`${BASE}/conversations/${convId}/read`)
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
