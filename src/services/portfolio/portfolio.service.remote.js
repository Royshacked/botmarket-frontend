import { API_BASE } from '../config'
import { postSSE } from '../sse.util'

export const portfolioService = { sendStream, saveChatState, getChatState, deleteChatState, completeReview, applyRebalance }

async function saveChatState(portfolioId, messages, mandate = null, thesis = null) {
    const res = await fetch(`${API_BASE}/api/portfolio/chat-state`, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ portfolioId, messages, ...(mandate ? { mandate } : {}), ...(thesis ? { thesis } : {}) }),
    })
    if (!res.ok) throw new Error('Failed to save portfolio chat state')
    return res.json()
}

// Apply an accepted review rebalance (the confirmed portfolio_update) to the live book.
async function applyRebalance(portfolioId, update) {
    const res = await fetch(`${API_BASE}/api/portfolio/${encodeURIComponent(portfolioId)}/rebalance`, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ update }),
    })
    if (!res.ok) throw new Error('Failed to apply portfolio rebalance')
    return res.json()
}

async function getChatState(portfolioId) {
    const res = await fetch(`${API_BASE}/api/portfolio/chat-state/${encodeURIComponent(portfolioId)}`, {
        credentials: 'include',
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.chatState ?? null
}

async function deleteChatState(portfolioId) {
    const res = await fetch(`${API_BASE}/api/portfolio/chat-state/${encodeURIComponent(portfolioId)}`, {
        method:      'DELETE',
        credentials: 'include',
    })
    if (!res.ok) throw new Error('Failed to delete portfolio chat state')
    return res.json()
}

async function completeReview(portfolioId, reviewCadence) {
    const res = await fetch(`${API_BASE}/api/portfolio/${encodeURIComponent(portfolioId)}/complete-review`, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ reviewCadence }),
    })
    if (!res.ok) throw new Error('Failed to complete portfolio review')
    return res.json()
}

async function sendStream(messages, ideaAccounts = [], { onToken, onTicker, onPhase, onStatus, onReasoning, onDone, onError, portfolioId = null, portfolioIdeas = [], reviewMode = false, mandate = null, model, reasoningEffort, routingMode, currentPhase, signal } = {}) {
    await postSSE(
        `${API_BASE}/api/portfolio/stream`,
        { messages, ideaAccounts, portfolioId, portfolioIdeas, reviewMode, mandate, model, reasoningEffort, routingMode, currentPhase },
        {
            token:     (d) => onToken?.(d.text),
            ticker:    (d) => onTicker?.(d.symbol),
            phase:     (d) => onPhase?.(d.phase),
            status:    (d) => onStatus?.(d.tool),
            reasoning: (d) => onReasoning?.(d.text),
            done:      (d) => onDone?.(d),
            error:     (d) => onError?.(d.message),
        },
        { signal },
    )
}
