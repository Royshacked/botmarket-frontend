/**
 * Shared streaming stop + error-recovery helpers for chat panels that own
 * their own SSE streaming loop (PortfolioPanel, ScannerPanel).
 *
 * ChatPanel is stateless (streaming runs in MainPage) and does not use this.
 */
export function makeStreamHandlers({ abortRef, stopDrain, setMessages, setIsLoading }) {
    function handleStop() {
        abortRef.current?.abort()
        stopDrain()
        setMessages(prev => {
            const msgs = [...prev]
            const last = msgs[msgs.length - 1]
            if (last?.streaming) {
                // Keep whatever was rendered and flag it `stopped` so the panel offers the
                // resume (▶) affordance. With real partial text, resume CONTINUES the bubble
                // in place; stopped before any token, it keeps the `_(stopped)_` placeholder
                // and resume REGENERATES the reply from scratch (empty base). Either way the
                // button turns to ▶ (Play) — never straight back to Send.
                const hasText = !!(last.content && last.content.trim())
                msgs[msgs.length - 1] = hasText
                    ? { role: 'assistant', content: last.content, stopped: true, ...(last.reasoning ? { reasoning: last.reasoning } : {}) }
                    : { role: 'assistant', content: '_(stopped)_', stopped: true }
            }
            return msgs
        })
        setIsLoading(false)
    }

    function freezeError(message) {
        stopDrain()
        setMessages(prev => {
            const msgs = [...prev]
            const last = msgs[msgs.length - 1]
            if (last?.streaming) msgs[msgs.length - 1] = { role: 'assistant', content: message || 'Error communicating with the server.' }
            return msgs
        })
    }

    return { handleStop, freezeError }
}
