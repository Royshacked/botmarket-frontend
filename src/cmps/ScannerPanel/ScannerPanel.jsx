import { useState, useRef, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { scannerService } from '../../services/scanner/scanner.service.remote.js'
import { ChatMarkdown } from '../ChatMarkdown.jsx'
import { readStoredModel } from '../modelOptions.js'
import { readStoredReasoning } from '../reasoningOptions.js'
import { readStoredRoutingMode } from '../RoutingModeSelector.jsx'
import { useMicInput } from '../../customHooks/useMicInput.js'
import { useTypewriter } from '../../customHooks/useTypewriter.js'
import { useTextPace } from '../../customHooks/useTextPace.js'
import { makeStreamHandlers } from '../../customHooks/useStreamStop.js'
import { useChatScroll } from '../../customHooks/useChatScroll.js'
import { ChatInputRow } from '../ChatInputRow.jsx'
import { MeditatingBot } from '../MeditatingBot.jsx'
import { BrandTitle } from '../BrandTitle.jsx'
import { ToolStatusChip } from '../ToolStatusChip/ToolStatusChip.jsx'
import { toolStatusLabel } from '../../services/toolStatusLabels.js'
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
        const label = SCAN_PHASE_LABELS[msg.phase]
        if (!label) return null
        return (
            <div className="portfolio-panel__phase-divider">
                <span className="portfolio-panel__phase-chip" title={`Phase ${msg.phase} of 4`}>{label}</span>
            </div>
        )
    }
    if (msg.role === 'user') {
        return <div className="portfolio-panel__bubble portfolio-panel__bubble--user">{msg.content}</div>
    }
    if (!msg.content && msg.streaming) {
        return (
            <div className="portfolio-panel__bubble portfolio-panel__bubble--assistant">
                <span className="portfolio-panel__thinking">scanning…</span>
            </div>
        )
    }
    return (
        <div className="portfolio-panel__bubble portfolio-panel__bubble--assistant">
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
    const [messages,      setMessages]      = useState([])
    const [inputText,     setInputText]     = useState('')
    const [isLoading,     setIsLoading]     = useState(false)
    const [streamStatus,  setStreamStatus]  = useState('')
    const [scanPhase,     setScanPhase]     = useState(null)
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
    const abortRef          = useRef(null)
    const { paceCps } = useTextPace()
    const { enqueue: enqueueToken, start: startDrain, stop: stopDrain, finish: finishDrain } = useTypewriter(setMessages, paceCps)

    const { handleStop, freezeError } = makeStreamHandlers({ abortRef, stopDrain, setMessages, setIsLoading })

    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable closure
    const onTranscript = useCallback((text) => { if (text) _send(text) }, [])
    const { isRecording, isTranscribing, toggle: toggleMic, cancel: cancelMic } = useMicInput({ onTranscript })

    async function _send(text) {
        if (!text || isLoading) return
        setEditDirty(true)

        const history = messages
            .filter(m => !m.streaming && m.role !== 'phase')
            .map(m => ({ role: m.role, content: m.content }))
        history.push({ role: 'user', content: text })

        setMessages(prev => [
            ...prev,
            { role: 'user', content: text },
            { role: 'assistant', content: '', streaming: true },
        ])
        setIsLoading(true)
        setStreamStatus('')
        pendingTickersRef.current = []
        startDrain()

        const ctrl = new AbortController()
        abortRef.current = ctrl

        // On a clean finish we keep isLoading true until the typewriter has fully
        // drained (cleared from finishDrain's onComplete), so the Stop button stays
        // live while text is still being typed out. Error/abort paths clear it in
        // the finally below (drain is hard-stopped there, so onComplete won't fire).
        let deferLoading = false

        try {
            await scannerService.sendStream(history, {
                model:           readStoredModel('scannerModel'),
                reasoningEffort: readStoredReasoning('scannerReasoning'),
                routingMode:     readStoredRoutingMode('scannerRoutingMode'),
                currentPhase:    scanPhase,
                signal: ctrl.signal,
                // When editing, tell the agent the list's current contents so it can
                // add / remove / change names against it.
                editList: editingScanId ? (pendingScan || null) : null,
                onToken:  (t)    => { setStreamStatus(''); enqueueToken(t) },
                onStatus: (tool) => { setStreamStatus(toolStatusLabel(tool)) },
                onPhase:  (p)   => {
                    if (!p) return
                    setScanPhase(p)
                    setMessages(prev => {
                        const idx = prev.findIndex(m => m.streaming)
                        if (idx < 0) return prev
                        const next = [...prev]
                        next.splice(idx, 0, { role: 'phase', phase: p })
                        return next
                    })
                },
                onTicker: (symbol) => {
                    if (!pendingTickersRef.current.includes(symbol)) pendingTickersRef.current.push(symbol)
                },
                onDone: (data) => {
                    const tickers = [...pendingTickersRef.current]
                    pendingTickersRef.current = []
                    // Finish typing the backlog at reading pace, then swap in the
                    // final reply — no end-of-stream dump. Keep Stop live until the
                    // drain ends.
                    deferLoading = true
                    finishDrain({ role: 'assistant', content: data.reply, tickers }, () => setIsLoading(false))
                    if (data.scan?.candidates?.length) setPendingScan(data.scan)
                },
                onError: (message) => freezeError(message),
            })
        } catch (err) {
            console.error('[scanner]', err)
            freezeError()
        } finally {
            if (!deferLoading) setIsLoading(false)
            setStreamStatus('')
        }
    }

    function handleSend() {
        const text = inputText.trim()
        setInputText('')
        _send(text)
    }

    function handleClear() {
        setMessages([])
        setPendingScan(null)
        setEditingScanId(null)
        setScanPhase(null)
        setInputText('')
        setEditDirty(false)
    }

    async function handleGenerate() {
        if (!pendingScan) return
        // Persist the conversation alongside the list so reopening it returns here.
        const chat = messages
            .filter(m => !m.streaming)
            .map(m => ({ role: m.role, content: m.content, ...(m.tickers?.length ? { tickers: m.tickers } : {}) }))

        if (editingScanId) {
            // Update the existing list in place; stay in edit mode for more refining.
            await onUpdateList?.(editingScanId, { ...pendingScan, chat })
        } else {
            await onGenerateList?.({ ...pendingScan, chat })
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
    const actionWatch = `${streamStatus}|${listReady}|${!!editingScanId}`
    const { messagesRef, messagesEndRef, handleScroll } = useChatScroll(messages, { watch: actionWatch })

    return (
        <div className="portfolio-panel scanner-panel">
            <div className="portfolio-panel__header">
                <span className="portfolio-panel__title-icon">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2.5 12 C6 7 18 7 21.5 12 C18 17 6 17 2.5 12 Z"/>
                        <circle cx="12" cy="12" r="3.2"/>
                        <circle cx="12" cy="12" r="0.7" fill="currentColor" stroke="none"/>
                    </svg>
                </span>
                <div className="portfolio-panel__title-group">
                    <span className="portfolio-panel__title"><BrandTitle text="Argus" /></span>
                    <span className="portfolio-panel__subtitle">scanning the market for opportunities</span>
                </div>
                <div className="portfolio-panel__header-right">
                    <div className={`portfolio-panel__status-dot${isLoading ? ' loading' : pendingScan ? ' building' : ' idle'}`} />
                </div>
            </div>

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
                    <div className="portfolio-panel__empty">
                        {editingScanId ? (
                            <>Editing your list — ask me to add, remove, or change names, then hit Update list.</>
                        ) : (
                            <>
                                Ask what to watch — a day, the coming week, an earnings window — and I&apos;ll scan US markets for candidates with the reasoning behind each.
                                <div className="scanner-panel__suggestions">
                                    {SUGGESTIONS.map(s => (
                                        <button key={s} className="scanner-panel__suggestion" onClick={() => _send(s)} disabled={isLoading}>
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}
                {messages.map((msg, i) => <MessageBubble key={i} msg={msg} onTickerSelect={onTickerSelect} />)}
                {isLoading && <ToolStatusChip label={streamStatus} />}

                {!isLoading && (listReady || showChangedMind) && (
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

                <div ref={messagesEndRef} />
            </div>

            <ChatInputRow
                prefix="portfolio-panel"
                textareaRef={textareaRef}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What should I scan for? (Enter to send, Shift+Enter for newline)"
                onSend={handleSend}
                sendDisabled={!inputText.trim() || isLoading}
                isStreaming={isLoading}
                onStop={handleStop}
                onClear={handleClear}
                clearDisabled={isLoading || !messages.length}
                clearTitle="Clear chat"
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

ScannerPanel.propTypes = {
    onTickerSelect: PropTypes.func.isRequired,
    onGenerateList: PropTypes.func,
    onUpdateList:   PropTypes.func,
    chatRestore:    PropTypes.object,
}
