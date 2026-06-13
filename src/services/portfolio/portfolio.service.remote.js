const BASE_URL        = import.meta.env.PROD ? '' : 'http://localhost:3030'
const STREAM_BASE_URL = BASE_URL

export const portfolioService = { sendStream, saveChatState, getChatState, deleteChatState }

async function saveChatState(portfolioId, messages) {
    const res = await fetch(`${BASE_URL}/portfolio/chat-state`, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ portfolioId, messages }),
    })
    if (!res.ok) throw new Error('Failed to save portfolio chat state')
    return res.json()
}

async function getChatState(portfolioId) {
    const res = await fetch(`${BASE_URL}/portfolio/chat-state/${encodeURIComponent(portfolioId)}`, {
        credentials: 'include',
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.chatState ?? null
}

async function deleteChatState(portfolioId) {
    const res = await fetch(`${BASE_URL}/portfolio/chat-state/${encodeURIComponent(portfolioId)}`, {
        method:      'DELETE',
        credentials: 'include',
    })
    if (!res.ok) throw new Error('Failed to delete portfolio chat state')
    return res.json()
}

async function sendStream(messages, ideaAccounts = [], { onToken, onTicker, onDone, onError, portfolioId = null, portfolioIdeas = [] } = {}) {
    const res = await fetch(`${STREAM_BASE_URL}/portfolio/stream`, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ messages, ideaAccounts, portfolioId, portfolioIdeas }),
    })

    if (!res.ok) {
        let errMsg = 'Stream request failed'
        try { const j = await res.json(); errMsg = j.err || errMsg } catch {}
        throw new Error(errMsg)
    }

    const reader  = res.body.getReader()
    const decoder = new TextDecoder()
    let pending   = ''

    while (true) {
        const { done, value } = await reader.read()
        if (done) break

        pending += decoder.decode(value, { stream: true })
        const blocks = pending.split('\n\n')
        pending = blocks.pop()

        for (const block of blocks) {
            if (!block.trim()) continue
            let eventName = 'message'
            let dataStr   = ''

            for (const line of block.split('\n')) {
                if (line.startsWith('event: '))     eventName = line.slice(7).trim()
                else if (line.startsWith('data: ')) dataStr   = line.slice(6)
            }

            if (!dataStr) continue
            let data
            try { data = JSON.parse(dataStr) } catch { continue }

            if      (eventName === 'token'  && onToken)  onToken(data.text)
            else if (eventName === 'ticker' && onTicker) onTicker(data.symbol)
            else if (eventName === 'done'   && onDone)   onDone(data)
            else if (eventName === 'error'  && onError)  onError(data.message)
        }
    }
}
