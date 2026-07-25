import { useState, useRef, useCallback } from 'react'
import PropTypes from 'prop-types'
import { axlService } from '../../services/axl/axl.service.remote'
import { useChatStream } from '../../customHooks/useChatStream.js'
import { useChatScroll } from '../../customHooks/useChatScroll.js'
import { useMicInput } from '../../customHooks/useMicInput.js'
import { ChatMarkdown } from '../ChatMarkdown.jsx'
import { ChatReasoning } from '../ChatReasoning.jsx'
import { ChatInputRow } from '../ChatInputRow.jsx'
import { AgentIntro, AgentTurnTag } from './AgentSummon.jsx'
import { AGENTS } from './agentMeta.jsx'
import { ChartBubble } from '../PriceChart/ChartBubble.jsx'
import { readStoredModel } from '../modelOptions.js'
import { readStoredReasoning } from '../reasoningOptions.js'
import { readStoredRoutingMode } from '../routingModeOptions.js'
import './AxlChatPanel.scss'

function MessageBubble({ msg }) {
    if (msg.type === 'chart') {
        return (
            <div className="axl-chat__chart-bubble">
                <ChartBubble ticker={msg.ticker} timeframe={msg.timeframe} />
            </div>
        )
    }
    if (msg.role === 'user') {
        return <div className="axl-chat__bubble axl-chat__bubble--user">{msg.content}</div>
    }
    return (
        <div className="axl-chat__bubble axl-chat__bubble--assistant">
            <ChatReasoning text={msg.reasoning} live={msg.streaming && !msg.content} />
            {msg.streaming && !msg.content
                ? <span className="axl-chat__thinking">thinking…</span>
                : <ChatMarkdown>{msg.content ?? ''}</ChatMarkdown>
            }
        </div>
    )
}

export function AxlChatPanel({ onLoadingChange }) {
    const chat = useChatStream()
    const { messages, setMessages, isLoading } = chat
    const [input, setInput] = useState('')

    const inputRef = useRef(null)
    const { messagesRef, messagesEndRef, handleScroll } = useChatScroll(messages)

    const onTranscript = useCallback((text) => { if (text) _send(text) }, []) // eslint-disable-line react-hooks/exhaustive-deps
    const { isRecording, isTranscribing, toggle: toggleMic, cancel: cancelMic } = useMicInput({ onTranscript })

    function handleSend() {
        const trimmed = input.trim()
        if (!trimmed || isLoading) return
        setInput('')
        _send(trimmed)
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
    }

    async function _send(text) {
        if (!text || isLoading) return

        const history = messages
            .filter(m => (m.role === 'user' || m.role === 'assistant') && !m.streaming && m.type !== 'chart' && m.content?.trim())
            .map(m => ({ role: m.role, content: m.content.trim() }))

        const { signal, handlers } = chat.begin(text, {
            onDone: (data) => {
                if (data.chart?.ticker && data.chart?.timeframe) {
                    setMessages(prev => {
                        const msgs = [...prev]
                        const chartMsg = { role: 'assistant', type: 'chart', ticker: data.chart.ticker, timeframe: data.chart.timeframe }
                        const lastIdx = msgs.length - 1
                        if (msgs[lastIdx]?.streaming) msgs.splice(lastIdx, 0, chartMsg)
                        else msgs.push(chartMsg)
                        return msgs
                    })
                }
                const reasoning = chat.reasoningRef.current
                chat.finishStreaming({ role: 'assistant', content: data.reply, ...(reasoning ? { reasoning } : {}) })
                onLoadingChange?.(false)
            },
        })

        onLoadingChange?.(true)
        try {
            await axlService.streamAxl(
                [...history, { role: 'user', content: text }],
                {
                    model:         readStoredModel('axlModel'),
                    reasoningEffort: readStoredReasoning('axlReasoning'),
                    routingMode:   readStoredRoutingMode('axlRoutingMode'),
                    signal,
                    ...handlers,
                },
            )
        } catch (err) {
            console.error('[axl:chat]', err)
            chat.freezeError('Error communicating with Axl. Please try again.')
        } finally {
            chat.endStream()
        }
    }

    return (
        <div className="axl-chat">
            <div className="axl-chat__messages" ref={messagesRef} onScroll={handleScroll}>
                {messages.length === 0 && (
                    <AgentIntro
                        agent={AGENTS.axl}
                        introOverride="Ask me anything — how the platform works, what a notification means, or open a chart for any ticker."
                        hintOverride="Try: "Show me AAPL on the 1h" or "How do I build a scan?""
                    />
                )}
                {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}

                {isLoading && !messages.some(m => m.streaming) && (
                    <div className="axl-chat__bubble axl-chat__bubble--assistant">
                        <span className="axl-chat__thinking">thinking…</span>
                    </div>
                )}

                {(isLoading || messages.some(m => m.role === 'assistant' && m.content)) && (
                    <AgentTurnTag agent={AGENTS.axl} active={isLoading} />
                )}

                <div ref={messagesEndRef} />
            </div>

            <ChatInputRow
                prefix="axl-chat"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                textareaRef={inputRef}
                placeholder="Ask Axl anything…"
                onSend={handleSend}
                sendDisabled={isLoading}
                isStreaming={isLoading}
                onStop={chat.handleStop}
                onToggleMic={toggleMic}
                onCancelMic={cancelMic}
                isRecording={isRecording}
                isTranscribing={isTranscribing}
                micDisabled={isLoading || isTranscribing}
                textareaDisabled={isLoading || isRecording}
            />
        </div>
    )
}

AxlChatPanel.propTypes = {
    onLoadingChange: PropTypes.func,
}

MessageBubble.propTypes = {
    msg: PropTypes.object.isRequired,
}
