import { API_BASE } from '../config'
import { postSSE } from '../sse.util'

export const portfolioService = { sendStream, saveChatState, getChatState, deleteChatState }

async function saveChatState(portfolioId, messages) {
    const res = await fetch(`${API_BASE}/portfolio/chat-state`, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ portfolioId, messages }),
    })
    if (!res.ok) throw new Error('Failed to save portfolio chat state')
    return res.json()
}

async function getChatState(portfolioId) {
    const res = await fetch(`${API_BASE}/portfolio/chat-state/${encodeURIComponent(portfolioId)}`, {
        credentials: 'include',
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.chatState ?? null
}

async function deleteChatState(portfolioId) {
    const res = await fetch(`${API_BASE}/portfolio/chat-state/${encodeURIComponent(portfolioId)}`, {
        method:      'DELETE',
        credentials: 'include',
    })
    if (!res.ok) throw new Error('Failed to delete portfolio chat state')
    return res.json()
}

async function sendStream(messages, ideaAccounts = [], { onToken, onTicker, onStatus, onDone, onError, portfolioId = null, portfolioIdeas = [], model, reasoningEffort, signal } = {}) {
    await postSSE(
        `${API_BASE}/portfolio/stream`,
        { messages, ideaAccounts, portfolioId, portfolioIdeas, model, reasoningEffort },
        {
            token:  (d) => onToken?.(d.text),
            ticker: (d) => onTicker?.(d.symbol),
            status: (d) => onStatus?.(d.tool),
            done:   (d) => onDone?.(d),
            error:  (d) => onError?.(d.message),
        },
        { signal },
    )
}
