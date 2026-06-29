import { useState, useRef, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { portfolioService } from '../../services/portfolio/portfolio.service.remote.js'
import { showErrorMsg } from '../../services/event-bus.service'
import { ChatMarkdown } from '../ChatMarkdown.jsx'
import { AccountSelector } from '../ChatPanel/AccountSelector.jsx'
import { readStoredModel } from '../modelOptions.js'
import { readStoredReasoning } from '../reasoningOptions.js'
import { readStoredRoutingMode } from '../RoutingModeSelector.jsx'
import { useMicInput } from '../../customHooks/useMicInput.js'
import { useTypewriter } from '../../customHooks/useTypewriter.js'
import { useTextPace } from '../../customHooks/useTextPace.js'
import { makeStreamHandlers } from '../../customHooks/useStreamStop.js'
import { PaceSlider } from '../PaceSlider.jsx'
import { useChatScroll } from '../../customHooks/useChatScroll.js'
import { ChatInputRow } from '../ChatInputRow.jsx'
import { MeditatingBot } from '../MeditatingBot.jsx'
import { BrandTitle } from '../BrandTitle.jsx'
import { ToolStatusChip } from '../ToolStatusChip/ToolStatusChip.jsx'
import { toolStatusLabel } from '../../services/toolStatusLabels.js'
import './PortfolioPanel.scss'

const PHASE_LABELS = { 1: 'Mandate', 2: 'Macro', 3: 'Architecture', 4: 'Selection', 5: 'Sizing', 6: 'Review' }

function PhaseChip({ phase }) {
    const label = PHASE_LABELS[phase]
    if (!label) return null
    return (
        <div className="portfolio-panel__phase-divider">
            <span className="portfolio-panel__phase-chip" title={`Phase ${phase} of 6`}>{label}</span>
        </div>
    )
}

function TickerChip({ symbol, onSelect }) {
    return (
        <button className="portfolio-panel__ticker-chip" onClick={() => onSelect(symbol)}>
            {symbol}
            <span className="portfolio-panel__ticker-chip-hint">Build idea →</span>
        </button>
    )
}

function MessageBubble({ msg, onTickerSelect }) {
    if (msg.role === 'phase') return <PhaseChip phase={msg.phase} />

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
    const [isReviewMode,          setIsReviewMode]          = useState(false)
    const [dismissConfirm,        setDismissConfirm]        = useState(false)
    const [portfolioPhase, setPortfolioPhase] = useState(null)

    useEffect(() => {
        if (!chatRestore) return
        setMessages(chatRestore.messages ?? [])
        setPendingPlan(null)
        setInputText('')
        setEditDirty(false)
        setDismissConfirm(false)
        setEditingPortfolioId(chatRestore.portfolioId ?? null)
        setEditingPortfolioIdeas(chatRestore.portfolioIdeas ?? [])
        setIsReviewMode(chatRestore.reviewMode ?? false)
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
    const latestMandateRef  = useRef(null)
    const textareaRef       = useRef(null)
    const abortRef          = useRef(null)

    // Typewriter queue — smooths streamed tokens into the last message
    const { paceCps } = useTextPace()
    const { enqueue: enqueueToken, start: startDrain, stop: stopDrain, finish: finishDrain } = useTypewriter(setMessages, paceCps)

    const { handleStop, freezeError } = makeStreamHandlers({ abortRef, stopDrain, setMessages, setIsLoading })

    // eslint-disable-next-line react-hooks/exhaustive-deps -- _send is a stable closure for this purpose
    const onTranscript = useCallback((text) => { if (text) _send(text) }, [])
    const { isRecording, isTranscribing, toggle: toggleMic, cancel: cancelMic } = useMicInput({ onTranscript })

    const planHasSize  = !!pendingPlan && (Number(pendingPlan.positionSize) > 0)
    const planReady    = !!pendingPlan && pendingPlan.ideas.length > 0 && pendingPlan.ideas.every(i => Number(i.quantity) > 0)
    const canGenerate  = planReady && (!!editingPortfolioId || selectedAccounts?.length > 0)
    const actionWatch = `${streamStatus}|${planReady}|${canGenerate}|${isReviewMode}|${!!editingPortfolioId}`
    const { messagesRef, messagesEndRef, handleScroll } = useChatScroll(messages, { watch: actionWatch })

    async function _send(text) {
        if (!text || isLoading) return
        setEditDirty(true)

        const history = messages
            .filter(m => !m.streaming && m.role !== 'phase')
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

        // On a clean finish we keep isLoading true until the typewriter has fully
        // drained (cleared from finishDrain's onComplete), so the Stop button stays
        // live while text is still being typed out. Error/abort paths clear it in
        // the finally below (drain is hard-stopped there, so onComplete won't fire).
        let deferLoading = false

        try {
            await portfolioService.sendStream(history, ideaAccounts, {
                portfolioId:    editingPortfolioId,
                portfolioIdeas: editingPortfolioIdeas,
                reviewMode:     isReviewMode,
                mandate:        latestMandateRef.current,
                model:           readStoredModel('portfolioModel'),
                reasoningEffort: readStoredReasoning('portfolioReasoning'),
                routingMode:     readStoredRoutingMode('portfolioRoutingMode'),
                currentPhase:    portfolioPhase,
                signal: ctrl.signal,

                onPhase: (p) => {
                    if (!p) return
                    setPortfolioPhase(p)
                    setMessages(prev => {
                        const idx = prev.findIndex(m => m.streaming)
                        if (idx < 0) return prev
                        const next = [...prev]
                        next.splice(idx, 0, { role: 'phase', phase: p })
                        return next
                    })
                },

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
                    if (data.mandate) latestMandateRef.current = data.mandate
                    // Finish typing the backlog at reading pace, then swap in the
                    // final reply — no end-of-stream dump. Keep Stop live until the
                    // drain ends.
                    deferLoading = true
                    finishDrain({ role: 'assistant', content: data.reply, tickers }, () => setIsLoading(false))
                    if (data.plan?.ideas?.length) setPendingPlan(data.plan)
                    if (data.update?.changes?.length && onPortfolioUpdate) onPortfolioUpdate(data.update)
                },

                onError: (message) => freezeError(message),
            })
        } catch (err) {
            console.error('[portfolio]', err)
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
        setPendingPlan(null)
        setInputText('')
        latestMandateRef.current = null
    }

    // "Changed my mind" / "I'll do it later": leave edit/review mode without saving.
    // In review mode this is the "Later" path — clock does NOT reset.
    function handleCancelEdit() {
        setMessages([])
        setPendingPlan(null)
        setInputText('')
        setEditingPortfolioId(null)
        setEditingPortfolioIdeas([])
        setEditDirty(false)
        setIsReviewMode(false)
        setDismissConfirm(false)
    }

    async function _completeReview(portfolioId) {
        try {
            await portfolioService.completeReview(portfolioId)
        } catch (err) {
            console.error('[portfolio] completeReview failed', err)
            showErrorMsg('Could not reset review clock — try again later.')
        }
    }

    async function handleGenerate() {
        const portfolioId = editingPortfolioId
        if (portfolioId) {
            if (onUpdatePlan) onUpdatePlan(planReady ? pendingPlan : null, portfolioId, messages)
            if (isReviewMode) await _completeReview(portfolioId)
            setEditingPortfolioId(null)
            setEditingPortfolioIdeas([])
            setEditDirty(false)
            setIsReviewMode(false)
            setDismissConfirm(false)
        } else {
            if (!planReady) return
            if (onGeneratePlan) onGeneratePlan(pendingPlan, messages, latestMandateRef.current)
        }
        setPendingPlan(null); setMessages([]); setInputText('')
        latestMandateRef.current = null
    }

    // Review-only: no plan changes, just acknowledge the review and reset the clock.
    async function handleDismissReview() {
        const portfolioId = editingPortfolioId
        if (onUpdatePlan) onUpdatePlan(null, portfolioId, messages)
        await _completeReview(portfolioId)
        setEditingPortfolioId(null)
        setEditingPortfolioIdeas([])
        setEditDirty(false)
        setIsReviewMode(false)
        setDismissConfirm(false)
        setPendingPlan(null); setMessages([]); setInputText('')
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    const showChangedMind = !!editingPortfolioId && !editDirty && !isReviewMode

    return (
        <div className="portfolio-panel">
            <div className="portfolio-panel__header">
                <span className="portfolio-panel__title-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="9" r="6"/>
                        <path d="M12 3 C8.5 5 8.5 13 12 15"/>
                        <path d="M12 3 C15.5 5 15.5 13 12 15"/>
                        <path d="M6 9 H18"/>
                        <path d="M4 17.5 C7.5 21.5 16.5 21.5 20 17.5"/>
                    </svg>
                </span>
                <span className="portfolio-panel__title"><BrandTitle text="Atlas" /></span>
                <div className="portfolio-panel__header-right">
                    <PaceSlider />
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
                {pendingPlan && !planReady && !planHasSize && (
                    <div className="portfolio-panel__bubble portfolio-panel__bubble--assistant portfolio-panel__bubble--warning">
                        ⚠️ I need a position size before this plan can be generated. Tell me the total capital you want to deploy and I&apos;ll size each position by its allocation — or give me a quantity per asset.
                    </div>
                )}
                {pendingPlan && !planReady && planHasSize && (
                    <div className="portfolio-panel__bubble portfolio-panel__bubble--assistant portfolio-panel__bubble--warning">
                        ⚠️ Couldn&apos;t fetch live prices to compute share quantities. Try sending a message to trigger a re-emit, or check back shortly.
                    </div>
                )}

                {/* Inline action bubble */}
                {!isLoading && (isReviewMode ? !!editingPortfolioId : (planReady || showChangedMind)) && (
                    <div className="portfolio-panel__action-bubble">
                        {dismissConfirm ? (
                            <div className="portfolio-panel__dismiss-confirm">
                                <span>No changes needed — reset the review clock?</span>
                                <div className="portfolio-panel__dismiss-confirm-btns">
                                    <button
                                        className="portfolio-panel__review-btn portfolio-panel__review-btn--dismiss"
                                        onClick={handleDismissReview}
                                    >Confirm</button>
                                    <button
                                        className="portfolio-panel__review-btn portfolio-panel__review-btn--later"
                                        onClick={() => setDismissConfirm(false)}
                                    >Cancel</button>
                                </div>
                            </div>
                        ) : isReviewMode ? (
                            <>
                                {planReady && (
                                    <button className="portfolio-panel__review-btn portfolio-panel__review-btn--update" onClick={handleGenerate}>
                                        Update plan
                                    </button>
                                )}
                                <button className="portfolio-panel__review-btn portfolio-panel__review-btn--dismiss" onClick={() => setDismissConfirm(true)}>
                                    Dismiss
                                </button>
                                <button className="portfolio-panel__review-btn portfolio-panel__review-btn--later" onClick={handleCancelEdit}>
                                    I&apos;ll do it later
                                </button>
                            </>
                        ) : showChangedMind ? (
                            <button className="portfolio-panel__generate portfolio-panel__generate--cancel" onClick={handleCancelEdit}>
                                I&apos;ll do it later
                            </button>
                        ) : (
                            <button
                                className="portfolio-panel__generate"
                                onClick={canGenerate ? handleGenerate : undefined}
                                disabled={!canGenerate}
                                title={canGenerate ? undefined : 'Select a broker account above to generate this plan'}
                            >
                                {editingPortfolioId ? 'Update plan' : 'Generate plan'}
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
