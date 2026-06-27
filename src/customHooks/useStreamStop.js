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
            if (last?.streaming) msgs[msgs.length - 1] = { role: 'assistant', content: last.content || '_(stopped)_' }
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
