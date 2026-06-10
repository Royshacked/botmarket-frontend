import { httpService } from '../http.service'

const STREAM_BASE_URL = process.env.NODE_ENV === 'production'
    ? ''
    : 'http://localhost:3030'

export const userPromptService = {
    sendPrompt,
    sendPromptStream,
}

async function sendPrompt(userPrompt, analysisState = null) {
    const res = await httpService.post('orchestrator', { userPrompt, analysisState })
    return {
        reply:         res.reply,
        analysisState: res.analysisState,
        tradeIdea:     res.tradeIdea ?? null,
        ideaSaved:     res.ideaSaved ?? false,
    }
}

/**
 * Stream a chat response via SSE.
 *
 * @param {string}   userPrompt
 * @param {object}   analysisState
 * @param {object}   callbacks
 * @param {function} callbacks.onToken   - called for each streamed text chunk
 * @param {function} callbacks.onDone    - called with { reply, analysisState, tradeIdea? }
 * @param {function} callbacks.onError   - called with an error message string
 */
async function sendPromptStream(userPrompt, analysisState = null, { onToken, onDone, onError, onAsset } = {}, ideaAccounts = []) {
    const res = await fetch(`${STREAM_BASE_URL}/orchestrator/stream`, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ userPrompt, analysisState, ideaAccounts }),
    })

    if (!res.ok) {
        let errMsg = 'Stream request failed'
        try { const j = await res.json(); errMsg = j.err || errMsg } catch {}
        throw new Error(errMsg)
    }

    const reader  = res.body.getReader()
    const decoder = new TextDecoder()
    let pending   = ''

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const { done, value } = await reader.read()
        if (done) break

        pending += decoder.decode(value, { stream: true })

        // SSE wire format: blocks separated by '\n\n'
        const blocks = pending.split('\n\n')
        pending = blocks.pop()   // last (possibly incomplete) block

        for (const block of blocks) {
            if (!block.trim()) continue

            let eventName = 'message'
            let dataStr   = ''

            for (const line of block.split('\n')) {
                if (line.startsWith('event: '))      eventName = line.slice(7).trim()
                else if (line.startsWith('data: '))  dataStr   = line.slice(6)
            }

            if (!dataStr) continue

            let data
            try { data = JSON.parse(dataStr) }
            catch { console.warn('[stream] bad JSON', dataStr); continue }

            if      (eventName === 'token' && onToken) onToken(data.text)
            else if (eventName === 'asset' && onAsset) onAsset(data.symbol)
            else if (eventName === 'done'  && onDone)  onDone(data)
            else if (eventName === 'error' && onError) onError(data.message)
        }
    }
}
