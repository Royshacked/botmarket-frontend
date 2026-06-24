import { useState, useRef, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { portfolioService } from '../../services/portfolio/portfolio.service.remote.js'
import { ChatMarkdown } from '../ChatMarkdown.jsx'
import { AccountSelector } from '../ChatPanel/AccountSelector.jsx'
import { ModelSelector } from '../ModelSelector.jsx'
import { readStoredModel } from '../modelOptions.js'
import { ReasoningSelector } from '../ReasoningSelector.jsx'
import { readStoredReasoning } from '../reasoningOptions.js'
import { useMicInput } from '../../customHooks/useMicInput.js'
import { useTypewriter } from '../../customHooks/useTypewriter.js'
import { useTextPace } from '../../customHooks/useTextPace.js'
import { PaceSlider } from '../PaceSlider.jsx'
import { useChatScroll } from '../../customHooks/useChatScroll.js'
import { ChatInputRow } from '../ChatInputRow.jsx'
import { MeditatingBot } from '../MeditatingBot.jsx'
import { BrandTitle } from '../BrandTitle.jsx'
import { ToolStatusChip } from '../ToolStatusChip/ToolStatusChip.jsx'
import { toolStatusLabel } from '../../services/toolStatusLabels.js'
import './PortfolioPanel.scss'


function TickerChip({ symbol, onSelect }) {
    return (
        <button className="portfolio-panel__ticker-chip" onClick={() => onSelect(symbol)}>
            {symbol}
            <span className="portfolio-panel__ticker-chip-hint">Build idea →</span>
        </button>
    )
}

function MessageBubble({ msg, onTickerSelect }) {
    const isUser = msg.role === 'user'

    if (isUser) {
        return <div className="portfolio-panel__bubble portfolio-panel__bubble--user">{msg.content}</div>
    }

    if (!msg.content && msg.streaming) {
        return (
            <div className="portfolio-panel__bubble portfolio-panel__bubble--assistant">
                <span className="portfolio-panel__thinking">thinking…</span>
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
                    {msg.tickers.map(sym => (
                        <TickerChip key={sym} symbol={sym} onSelect={onTickerSelect} />
                    ))}
                </div>
            )}
        </div>
    )
}

export function PortfolioPanel({
    onTickerSelect,
    onGeneratePlan,
    onUpdatePlan,
    onPortfolioUpdate,
    onBuildingPlanChange,
    chatRestore       = null,
    availableAccounts = [],
    selectedAccounts  = [],
    onAccountsChange,
    mainAccountId     = null,
    onMainAccountChange,
}) {
    const [messages,              setMessages]              = useState([])
    const [inputText,             setInputText]             = useState('')
    const [isLoading,             setIsLoading]             = useState(false)
    const [streamStatus,          setStreamStatus]          = useState('')
    const [pendingPlan,           setPendingPlan]           = useState(null)
    const [editingPortfolioId,    setEditingPortfolioId]    = useState(null)
    const [editingPortfolioIdeas, setEditingPortfolioIdeas] = useState([])
    const [editDirty,             setEditDirty]             = useState(false)
    const [model,                 setModel]                 = useState(() => readStoredModel('portfolioModel'))
    const [reasoning,             setReasoning]             = useState(() => readStoredReasoning('portfolioReasoning'))

    function handleModelChange(m) {
        setModel(m)
        localStorage.setItem('portfolioModel', m)
    }

    function handleReasoningChange(r) {
        setReasoning(r)
        localStorage.setItem('portfolioReasoning', r)
    }

    useEffect(() => {
        if (!chatRestore) return
        setMessages(chatRestore.messages ?? [])
        setPendingPlan(null)
        setInputText('')
        setEditDirty(false)
        setEditingPortfolioId(chatRestore.portfolioId ?? null)
        setEditingPortfolioIdeas(chatRestore.portfolioIdeas ?? [])
        // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when a new restore is pushed (keyed by .key)
    }, [chatRestore?.key])

    // The assets the portfolio currently consists of, in priority order:
    //   1. a finalized plan (authoritative — carries assets + sizes + name)
    //   2. the most recent recommendation in the chat (reflects mid-build changes)
    //   3. the existing ideas of the portfolio being edited
    // Using the *latest* recommendation (not the union of every message) lets the
    // preview drop assets the conversation has since moved away from. Drives the
    // in-chat preview and the trade-ideas list's "building" portfolio row.
    const latestTickers  = [...messages].reverse().find(m => Array.isArray(m.tickers) && m.tickers.length)?.tickers ?? []
    const editQtyByAsset = new Map((editingPortfolioIdeas ?? []).map(i => [i.asset, i.quantity]))

    let buildItems
    if (pendingPlan?.ideas?.length) {
        buildItems = pendingPlan.ideas.map(i => ({ asset: i.asset, quantity: i.quantity ?? null }))
    } else if (latestTickers.length) {
        buildItems = latestTickers.map(asset => ({ asset, quantity: editQtyByAsset.get(asset) ?? null }))
    } else {
        buildItems = (editingPortfolioIdeas ?? []).map(i => ({ asset: i.asset, quantity: i.quantity ?? null }))
    }

    const buildAssets = buildItems.map(i => i.asset)
    const buildName   = pendingPlan?.name ?? editingPortfolioIdeas?.[0]?.portfolioName ?? null
    const buildKey    = `${buildAssets.join(',')}|${buildName ?? ''}|${pendingPlan?.ideas?.length ?? 0}|${editingPortfolioId ?? ''}`

    useEffect(() => {
        const active = buildAssets.length > 0 || !!pendingPlan
        // When editing, tag the building row with the portfolio's id so the list can
        // hide that portfolio's saved row and let the building row stand in for it
        // (rather than showing a duplicate "new" building row alongside the original).
        onBuildingPlanChange?.(active
            ? {
                name:        buildName ?? 'New portfolio',
                ideasCount:  buildItems.length,
                portfolioId: editingPortfolioId ?? null,
              }
            : null)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [buildKey])

    const pendingTickersRef = useRef([])
    const textareaRef       = useRef(null)
    const abortRef          = useRef(null)

    // Typewriter queue — smooths streamed tokens into the last message
    const { paceCps } = useTextPace()
    const { enqueue: enqueueToken, start: startDrain, stop: stopDrain, finish: finishDrain } = useTypewriter(setMessages, paceCps)

    // Stop a streaming response: abort the request, freeze the partial reply, and
    // free the input. postSSE swallows the abort, so no error bubble appears.
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

    // eslint-disable-next-line react-hooks/exhaustive-deps -- _send is a stable closure for this purpose
    const onTranscript = useCallback((text) => { if (text) _send(text) }, [])
    const { isRecording, isTranscribing, toggle: toggleMic, cancel: cancelMic } = useMicInput({ onTranscript })

    const { messagesRef, messagesEndRef, handleScroll } = useChatScroll(messages, { watch: streamStatus })

    async function _send(text) {
        if (!text || isLoading) return
        setEditDirty(true)

        const history = messages
            .filter(m => !m.streaming)
            .map(m => ({ role: m.role, content: m.content }))
        history.push({ role: 'user', content: text })

        const ideaAccounts = availableAccounts.filter(a => selectedAccounts.includes(a.id))

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

        try {
            await portfolioService.sendStream(history, ideaAccounts, {
                portfolioId:    editingPortfolioId,
                portfolioIdeas: editingPortfolioIdeas,
                model,
                reasoningEffort: reasoning,
                signal: ctrl.signal,

                onToken: (t) => { setStreamStatus(''); enqueueToken(t) },

                onStatus: (tool) => { setStreamStatus(toolStatusLabel(tool)) },

                onTicker: (symbol) => {
                    if (!pendingTickersRef.current.includes(symbol)) {
                        pendingTickersRef.current.push(symbol)
                    }
                },

                onDone: (data) => {
                    const tickers = [...pendingTickersRef.current]
                    pendingTickersRef.current = []
                    // Finish typing the backlog at reading pace, then swap in the
                    // final reply — no end-of-stream dump.
                    finishDrain({ role: 'assistant', content: data.reply, tickers })
                    if (data.plan?.ideas?.length) setPendingPlan(data.plan)
                    if (data.update?.changes?.length && onPortfolioUpdate) onPortfolioUpdate(data.update)
                },

                onError: (message) => {
                    stopDrain()
                    setMessages(prev => {
                        const msgs = [...prev]
                        const last = msgs[msgs.length - 1]
                        if (last?.streaming) {
                            msgs[msgs.length - 1] = { role: 'assistant', content: message || 'Error communicating with the server.' }
                        }
                        return msgs
                    })
                },
            })
        } catch (err) {
            console.error('[portfolio]', err)
            stopDrain()
            setMessages(prev => {
                const msgs = [...prev]
                const last = msgs[msgs.length - 1]
                if (last?.streaming) {
                    msgs[msgs.length - 1] = { role: 'assistant', content: 'Error communicating with the server.' }
                }
                return msgs
            })
        } finally {
            setIsLoading(false)
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
        setPendingPlan(null)
        setInputText('')
    }

    // "Changed my mind": leave edit mode without saving and return to a fresh chat.
    function handleCancelEdit() {
        setMessages([])
        setPendingPlan(null)
        setInputText('')
        setEditingPortfolioId(null)
        setEditingPortfolioIdeas([])
        setEditDirty(false)
    }

    function handleGenerate() {
        if (editingPortfolioId) {
            // Always persist the conversation so re-opening restores it; apply the
            // re-plan only when it's ready. Passing a null plan saves chat without
            // touching the existing ideas. The Update button doubles as "exit edit".
            if (onUpdatePlan) onUpdatePlan(planReady ? pendingPlan : null, editingPortfolioId, messages)
            setEditingPortfolioId(null)
            setEditingPortfolioIdeas([])
            setEditDirty(false)
        } else {
            if (!planReady) return
            if (onGeneratePlan) onGeneratePlan(pendingPlan, messages)
        }
        setPendingPlan(null); setMessages([]); setInputText('')
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    // A plan is only generatable once every idea has a positive quantity.
    const planReady = !!pendingPlan && pendingPlan.ideas.length > 0 && pendingPlan.ideas.every(i => Number(i.quantity) > 0)
    const showChangedMind = !!editingPortfolioId && !editDirty

    return (
        <div className="portfolio-panel">
            <div className="portfolio-panel__header">
                <span className="portfolio-panel__title-icon"><MeditatingBot /></span>
                <span className="portfolio-panel__title"><BrandTitle text="Axl Portfolios" /></span>
                <div className="portfolio-panel__header-right">
                    <PaceSlider />
                    <ModelSelector value={model} onChange={handleModelChange} disabled={isLoading} />
                    <ReasoningSelector value={reasoning} onChange={handleReasoningChange} disabled={isLoading} />
                    <AccountSelector
                        accounts={availableAccounts}
                        selectedIds={selectedAccounts}
                        onChange={onAccountsChange}
                        mainAccountId={mainAccountId}
                        onMainChange={onMainAccountChange}
                    />
                    <div className={`portfolio-panel__status-dot${isLoading ? ' loading' : buildItems.length > 0 ? ' building' : ' idle'}`} />
                </div>
            </div>

            {buildItems.length > 0 && (
                <div className="portfolio-panel__build-summary">
                    <div className="portfolio-panel__build-summary-header">
                        <span className="portfolio-panel__build-summary-title">your portfolio —</span>
                        {buildName && <span className="portfolio-panel__build-summary-name">{buildName}</span>}
                        <span className="portfolio-panel__build-summary-count">
                            {buildItems.length} {buildItems.length === 1 ? 'idea' : 'ideas'}
                        </span>
                    </div>
                    <div className="portfolio-panel__build-summary-items">
                        {buildItems.map(item => (
                            <span key={item.asset} className="portfolio-panel__build-summary-item">
                                <span className="portfolio-panel__build-summary-asset">{item.asset}</span>
                                {item.quantity != null && (
                                    <span className="portfolio-panel__build-summary-qty">×{item.quantity}</span>
                                )}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <div className="portfolio-panel__messages" ref={messagesRef} onScroll={handleScroll}>
                {messages.length === 0 && (
                    <div className="portfolio-panel__empty">
                        Describe your investment goals, risk tolerance, and account size — I&apos;ll help you build a portfolio.
                    </div>
                )}
                {messages.map((msg, i) => (
                    <MessageBubble key={i} msg={msg} onTickerSelect={onTickerSelect} />
                ))}
                {isLoading && <ToolStatusChip label={streamStatus} />}
                {pendingPlan && !planReady && (
                    <div className="portfolio-panel__bubble portfolio-panel__bubble--assistant portfolio-panel__bubble--warning">
                        ⚠️ I need a position size before this plan can be generated. Tell me the total capital you want to deploy and I&apos;ll size each position by its allocation — or give me a quantity per asset.
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <button
                className={`portfolio-panel__generate${showChangedMind ? ' portfolio-panel__generate--cancel' : ''}`}
                disabled={isLoading || (!editingPortfolioId && !planReady)}
                onClick={showChangedMind ? handleCancelEdit : handleGenerate}
                title={showChangedMind
                    ? 'Discard edit and start a new chat'
                    : editingPortfolioId
                        ? (planReady ? 'Update plan' : 'Exit edit mode')
                        : (planReady ? 'Generate plan' : 'Build a plan and set quantities first')}
            >
                {showChangedMind ? 'Changed my mind' : editingPortfolioId ? 'Update plan' : 'Generate plan'}
            </button>

            <ChatInputRow
                prefix="portfolio-panel"
                textareaRef={textareaRef}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe your portfolio goals… (Enter to send, Shift+Enter for newline)"
                onSend={handleSend}
                sendDisabled={!inputText.trim() || isLoading}
                isStreaming={isLoading}
                onStop={handleStop}
                onClear={handleClear}
                clearDisabled={isLoading || !messages.length || !!editingPortfolioId}
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

PortfolioPanel.propTypes = {
    onTickerSelect:      PropTypes.func.isRequired,
    onGeneratePlan:      PropTypes.func,
    onUpdatePlan:        PropTypes.func,
    onPortfolioUpdate:   PropTypes.func,
    onBuildingPlanChange: PropTypes.func,
    chatRestore:         PropTypes.object,
    availableAccounts:   PropTypes.array,
    selectedAccounts:    PropTypes.arrayOf(PropTypes.string),
    onAccountsChange:    PropTypes.func,
    mainAccountId:       PropTypes.string,
    onMainAccountChange: PropTypes.func,
}
