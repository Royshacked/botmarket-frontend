import { API_BASE } from '../config'

const BASE = `${API_BASE}/api/chat`

async function req(path, method = 'GET', body = null) {
    const opts = { method, credentials: 'include', headers: {} }
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body) }
    const res = await fetch(`${BASE}${path}`, opts)
    if (!res.ok) throw new Error(`chat API ${method} ${path} → ${res.status}`)
    return res.json()
}

export const chatService = {
    async getConversations() {
        const { conversations } = await req('/conversations')
        return conversations
    },

    async getMessages(convId, before = null, limit = 50) {
        const params = new URLSearchParams({ limit })
        if (before) params.set('before', before)
        const { messages } = await req(`/conversations/${convId}/messages?${params}`)
        return messages
    },

    async sendMessage(convId, content) {
        const { message } = await req(`/conversations/${convId}/messages`, 'POST', { content })
        return message
    },

    async markRead(convId) {
        return req(`/conversations/${convId}/read`, 'POST')
    },

    async searchUsers(q) {
        const { users } = await req(`/users/search?q=${encodeURIComponent(q)}`)
        return users
    },

    async startConversation(userId) {
        const { conversation } = await req('/conversations', 'POST', { userId })
        return conversation
    },
}
