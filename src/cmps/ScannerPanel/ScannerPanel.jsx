import { useState, useRef, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { scannerService } from '../../services/scanner/scanner.service.remote.js'
import { ChatMarkdown } from '../ChatMarkdown.jsx'
import { readStoredModel } from '../modelOptions.js'
import { readStoredReasoning } from '../reasoningOptions.js'
import { readStoredRoutingMode } from '../routingModeOptions.js'
import { useMicInput } from '../../customHooks/useMicInput.js'
import { useChatStream } from '../../customHooks/useChatStream.js'
import { useChatScroll } from '../../customHooks/useChatScroll.js'
import { ChatInputRow } from '../ChatInputRow.jsx'
import { AgentIntro, AgentTurnTag } from '../AxlHub/AgentSummon.jsx'
import { AGENTS } from '../AxlHub/agentMeta.jsx'
import { ToolStatusChip } from '../ToolStatusChip/ToolStatusChip.jsx'
import { ChatPhaseHeading } from '../ChatPhaseHeading.jsx'
import { ChatReasoning } from '../ChatReasoning.jsx'
import '../PortfolioPanel/PortfolioPanel.scss'
import './ScannerPanel.scss'

const SCAN_PHASE_LABELS = { 1: 'Thesis', 2: 'Discovery', 3: 'Filtering', 4: 'Ranked List' }

// Starter prompts — onboarding scaffolding only; the agent understands any
// timeframe the user types, these are just one-tap entry points.
const SUGGESTIONS = ['Stocks for today?', 'Anything for the coming week?', 'Earnings plays next week?']

function TickerChip({ symbol, onSelect }) {
    return (
        <button className="portfolio-panel__ticker-chip" onClick={() => onSelect(symbol)}>
            {symbol}
            <span className="portfolio-panel__ticker-chip-hint">View →</span>
        </button>
    )
}

function MessageBubble({ msg, onTickerSelect }) {
    if (msg.role === 'phase') {
        return <ChatPhaseHeading phase={msg.phase} label={SCAN_PHASE_LABELS[msg.phase]} total={4} />
    }
    if (msg.role === 'user') {
        return <div className="portfolio-panel__bubble portfolio-panel__bubble--user">{msg.content}</div>
    }

    const reasoning = <ChatReasoning text={msg.reasoning} live={msg.streaming && !msg.content} />

    if (!msg.content && msg.streaming) {
        return (
            <div className="portfolio-panel__bubble portfolio-panel__bubble--assistant">
                {reasoning}
                <span className="portfolio-panel__thinking">scanning…</span>
            </div>
        )
    }
    return (
        <div className="portfolio-panel__bubble portfolio-panel__bubble--assistant">
            {reasoning}
            <div className="portfolio-panel__bubble-text">
                <ChatMarkdown>{msg.content}</ChatMarkdown>
            </div>
            {msg.tickers?.length > 0 && (
                <div className="portfolio-panel__tickers">
                    {msg.tickers.map(sym => <TickerChip key={sym} symbol={sym} onSelect={onTickerSelect} />)}
                </div>
            )}
        </div>
    )
}

export function ScannerPanel({ onTickerSelect, onGenerateList, onUpdateList, chatRestore = null }) {
    const chat = useChatStream()
    const { messages, setMessages } = chat

    const [inputText,     setInputText]     = useState('')
    const [pendingScan,   setPendingScan]   = useState(null)
    const [editingScanId, setEditingScanId] = useState(null)
    const [editDirty,     setEditDirty]     = useState(false)
    // Reopen a saved list to edit it (clicked from its pencil): restore the chat,
    // enter edit mode, and prime the pending list with its current contents so the
    // agent can refine it and "Update list" persists back to the same scan.
    useEffect(() => {
        if (!chatRestore) return
        setMessages(chatRestore.messages ?? [])
        setEditingScanId(chatRestore.scanId ?? null)
        setPendingScan(chatRestore.scan ?? null)
        setInputText('')
        setEditDirty(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when a new restore is pushed (keyed by .key)
    }, [chatRestore?.key])

    const pendingTickersRef = useRef([])
    const textareaRef       = useRef(null)

    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable closure
    const onTranscript = useCallback((text) => { if (text) _send(text) }, [])
    const { isRecording, isTranscribing, toggle: toggleMic, cancel: cancelMic } = useMicInput({ onTranscript })

    async function _send(text) {
        if (!text || chat.isLoading) return
        setEditDirty(true)

        const history = messages
            .filter(m => !m.streaming && m.role !== 'phase')
            .map(m => ({ role: m.role, content: m.content }))
        history.push({ role: 'user', content: text })

        pendingTickersRef.current = []

        const { signal, handlers } = chat.begin(text, {
            onTicker: (symbol) => {
                if (!pendingTickersRef.current.includes(symbol)) pendingTickersRef.current.push(symbol)
            },
            onDone: (data) => {
                const tickers = [...pendingTickersRef.current]
                pendingTickersRef.current = []
                chat.finishStreaming({ role: 'assistant', content: data.reply, tickers })
                if (data.scan?.candidates?.length) setPendingScan(data.scan)
            },
        })

        try {
            await scannerService.sendStream(history, {
                model:           readStoredModel('scannerModel'),
                reasoningEffort: readStoredReasoning('scannerReasoning'),
                routingMode:     readStoredRoutingMode('scannerRoutingMode'),
                currentPhase:    chat.phase,
                // When editing, tell the agent the list's current contents so it can
                // add / remove / change names against it.
                editList:        editingScanId ? (pendingScan || null) : null,
                signal,
                ...handlers,
            })
        } catch (err) {
            console.error('[scanner]', err)
            chat.freezeError()
        } finally {
            chat.endStream()
        }
    }

    function handleSend() {
        const text = inputText.trim()
        setInputText('')
        _send(text)
    }

    function handleClear() {
        chat.reset()
        setPendingScan(null)
        setEditingScanId(null)
        setInputText('')
        setEditDirty(false)
    }

    async function handleGenerate() {
        if (!pendingScan) return
        // Persist the conversation alongside the list so reopening it returns here.
        const chatLog = messages
            .filter(m => !m.streaming)
            .map(m => ({ role: m.role, content: m.content, ...(m.tickers?.length ? { tickers: m.tickers } : {}) }))

        if (editingScanId) {
            // Update the existing list in place; stay in edit mode for more refining.
            await onUpdateList?.(editingScanId, { ...pendingScan, chat: chatLog })
        } else {
            await onGenerateList?.({ ...pendingScan, chat: chatLog })
            setPendingScan(null)
        }
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    const listReady = !!pendingScan && pendingScan.candidates?.length > 0
    const showChangedMind = !!editingScanId && !editDirty
    const actionWatch = `${chat.streamStatus}|${listReady}|${!!editingScanId}`
    const { messagesRef, messagesEndRef, handleScroll } = useChatScroll(messages, {
        onFinishStreaming: () => textareaRef.current?.focus(),
        watch: actionWatch,
    })

    return (
        <div className="portfolio-panel scanner-panel">
            {listReady && (
                <div className="portfolio-panel__build-summary">
                    <div className="portfolio-panel__build-summary-header">
                        <span className="portfolio-panel__build-summary-title">{editingScanId ? 'editing list —' : 'your list —'}</span>
                        <span className="portfolio-panel__build-summary-name">{pendingScan.thesis}</span>
                        {pendingScan.period?.label && (
                            <span className="scanner-panel__period-chip">{pendingScan.period.label}</span>
                        )}
                        <span className="portfolio-panel__build-summary-count">
                            {pendingScan.candidates.length} {pendingScan.candidates.length === 1 ? 'asset' : 'assets'}
                        </span>
                    </div>
                    <div className="portfolio-panel__build-summary-items">
                        {pendingScan.candidates.map(c => (
                            <span key={c.ticker} className="portfolio-panel__build-summary-item">
                                <span className={`scanner-panel__dir scanner-panel__dir--${c.direction}`}>
                                    {c.direction === 'short' ? '▾' : '▴'}
                                </span>
                                <span className="portfolio-panel__build-summary-asset">{c.ticker}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <div className="portfolio-panel__messages" ref={messagesRef} onScroll={handleScroll}>
                {messages.length === 0 && (
                    editingScanId ? (
                        <div className="portfolio-panel__empty">
                            Editing your list — ask me to add, remove, or change names, then hit Update list.
                        </div>
                    ) : (
                        <AgentIntro agent={AGENTS.scanner}>
                            <div className="scanner-panel__suggestions">
                                {SUGGESTIONS.map(s => (
                                    <button key={s} className="scanner-panel__suggestion" onClick={() => _send(s)} disabled={chat.isLoading}>
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </AgentIntro>
                    )
                )}
                {messages.map((msg, i) => <MessageBubble key={i} msg={msg} onTickerSelect={onTickerSelect} />)}
                {chat.isLoading && <ToolStatusChip label={chat.streamStatus} />}

                {(chat.isLoading || messages.some(m => m.role === 'assistant' && m.content)) && (
                    <AgentTurnTag agent={AGENTS.scanner} active={chat.isLoading} />
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Action bar — a footer below the scroll area (not inside it) so it stays
                pinned above the input without ever covering the messages. */}
            {!chat.isLoading && (listReady || showChangedMind) && (
                <div className="portfolio-panel__action-bubble">
                    {showChangedMind ? (
                        <button className="portfolio-panel__review-btn portfolio-panel__review-btn--later" onClick={handleClear}>
                            I&apos;ll do it later
                        </button>
                    ) : (
                        <button className="portfolio-panel__review-btn portfolio-panel__review-btn--update" onClick={handleGenerate}>
                            {editingScanId ? 'Update list' : 'Generate list'}
                        </button>
                    )}
                </div>
            )}

            <ChatInputRow
                prefix="portfolio-panel"
                textareaRef={textareaRef}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What should I scan for? (Enter to send, Shift+Enter for newline)"
                onSend={handleSend}
                sendDisabled={!inputText.trim() || chat.isLoading}
                isStreaming={chat.isLoading}
                onStop={chat.handleStop}
                onClear={handleClear}
                clearDisabled={chat.isLoading || !messages.length}
                clearTitle="Clear chat"
                onToggleMic={toggleMic}
                onCancelMic={cancelMic}
                isRecording={isRecording}
                isTranscribing={isTranscribing}
                micDisabled={chat.isLoading || isTranscribing}
                textareaDisabled={chat.isLoading || isRecording}
            />
        </div>
    )
}

ScannerPanel.propTypes = {
    onTickerSelect: PropTypes.func.isRequired,
    onGenerateList: PropTypes.func,
    onUpdateList:   PropTypes.func,
    chatRestore:    PropTypes.object,
}
