const STREAM_BASE_URL = import.meta.env.PROD ? '' : 'http://localhost:3030'

export const portfolioService = { sendStream }

async function sendStream(messages, ideaAccounts = [], { onToken, onTicker, onDone, onError } = {}) {
    const res = await fetch(`${STREAM_BASE_URL}/portfolio/stream`, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ messages, ideaAccounts }),
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
