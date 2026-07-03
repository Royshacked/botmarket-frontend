import { useState, useRef, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { portfolioService } from '../../services/portfolio/portfolio.service.remote.js'
import { showErrorMsg } from '../../services/event-bus.service'
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
import './PortfolioPanel.scss'

const PHASE_LABELS = { 1: 'Mandate', 2: 'Macro', 3: 'Architecture', 4: 'Selection', 5: 'Sizing', 6: 'Review' }

function TickerChip({ symbol, onSelect }) {
    return (
        <button className="portfolio-panel__ticker-chip" onClick={() => onSelect(symbol)}>
            {symbol}
            <span className="portfolio-panel__ticker-chip-hint">Build idea →</span>
        </button>
    )
}

function MessageBubble({ msg, onTickerSelect }) {
    if (msg.role === 'phase') return <ChatPhaseHeading phase={msg.phase} label={PHASE_LABELS[msg.phase]} total={6} />

    const isUser = msg.role === 'user'

    if (isUser) {
        return <div className="portfolio-panel__bubble portfolio-panel__bubble--user">{msg.content}</div>
    }

    const reasoning = <ChatReasoning text={msg.reasoning} live={msg.streaming && !msg.content} />

    if (!msg.content && msg.streaming) {
        return (
            <div className="portfolio-panel__bubble portfolio-panel__bubble--assistant">
                {reasoning}
                <span className="portfolio-panel__thinking">thinking…</span>
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
}) {
    const chat = useChatStream()
    const { messages, setMessages, isLoading, streamStatus, handleStop } = chat

    const [inputText,             setInputText]             = useState('')
    const [pendingPlan,           setPendingPlan]           = useState(null)
    const [editingPortfolioId,    setEditingPortfolioId]    = useState(null)
    const [editingPortfolioIdeas, setEditingPortfolioIdeas] = useState([])
    const [editDirty,             setEditDirty]             = useState(false)
    const [isReviewMode,          setIsReviewMode]          = useState(false)
    const [dismissConfirm,        setDismissConfirm]        = useState(false)
    const [portfolioThesis, setPortfolioThesis] = useState(null)
    const [thesisOpen, setThesisOpen] = useState(true)

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
        setPortfolioThesis(chatRestore.thesis ?? null)
        latestThesisRef.current = chatRestore.thesis ?? null
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
    const latestThesisRef   = useRef(null)
    const textareaRef       = useRef(null)

    // eslint-disable-next-line react-hooks/exhaustive-deps -- _send is a stable closure for this purpose
    const onTranscript = useCallback((text) => { if (text) _send(text) }, [])
    const { isRecording, isTranscribing, toggle: toggleMic, cancel: cancelMic } = useMicInput({ onTranscript })

    const planHasSize  = !!pendingPlan && (Number(pendingPlan.positionSize) > 0)
    const planReady    = !!pendingPlan && pendingPlan.ideas.length > 0 && pendingPlan.ideas.every(i => Number(i.quantity) > 0)
    const canGenerate  = planReady && (!!editingPortfolioId || selectedAccounts?.length > 0)
    const actionWatch = `${streamStatus}|${planReady}|${canGenerate}|${isReviewMode}|${!!editingPortfolioId}`
    const { messagesRef, messagesEndRef, handleScroll } = useChatScroll(messages, {
        onFinishStreaming: () => textareaRef.current?.focus(),
        watch: actionWatch,
    })

    async function _send(text) {
        if (!text || isLoading) return
        setEditDirty(true)

        const history = messages
            .filter(m => !m.streaming && m.role !== 'phase')
            .map(m => ({ role: m.role, content: m.content }))
        history.push({ role: 'user', content: text })

        const ideaAccounts = availableAccounts.filter(a => selectedAccounts.includes(a.id))

        pendingTickersRef.current = []

        const { signal, handlers } = chat.begin(text, {
            onTicker: (symbol) => {
                if (!pendingTickersRef.current.includes(symbol)) pendingTickersRef.current.push(symbol)
            },
            onDone: (data) => {
                const tickers = [...pendingTickersRef.current]
                pendingTickersRef.current = []
                if (data.mandate) latestMandateRef.current = data.mandate
                if (data.thesis) { latestThesisRef.current = data.thesis; setPortfolioThesis(data.thesis) }
                chat.finishStreaming({ role: 'assistant', content: data.reply, tickers })
                if (data.plan?.ideas?.length) setPendingPlan(data.plan)
                // Pass any thesis emitted in THIS same turn so a confirmed review
                // rebalance persists it (reason 'accepted-rebalance'). Only the
                // same-turn proposal is attached — never the restored existing thesis.
                if (data.update?.changes?.length && onPortfolioUpdate) onPortfolioUpdate(data.update, isReviewMode, data.thesis ?? null)
            },
        })

        try {
            await portfolioService.sendStream(history, ideaAccounts, {
                portfolioId:     editingPortfolioId,
                portfolioIdeas:  editingPortfolioIdeas,
                reviewMode:      isReviewMode,
                mandate:         latestMandateRef.current,
                model:           readStoredModel('portfolioModel'),
                reasoningEffort: readStoredReasoning('portfolioReasoning'),
                routingMode:     readStoredRoutingMode('portfolioRoutingMode'),
                currentPhase:    chat.phase,
                signal,
                ...handlers,
            })
        } catch (err) {
            console.error('[portfolio]', err)
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
            if (onGeneratePlan) onGeneratePlan(pendingPlan, messages, latestMandateRef.current, latestThesisRef.current)
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
            {editingPortfolioId && portfolioThesis && (portfolioThesis.strategy || portfolioThesis.targetExposures?.length) && (
                <div className="portfolio-panel__thesis" style={{ margin: '0 16px 8px', padding: '10px 12px', border: '1px solid var(--border, #333)', borderRadius: 8, fontSize: 12, opacity: 0.92 }}>
                    <button
                        type="button"
                        onClick={() => setThesisOpen(o => !o)}
                        aria-expanded={thesisOpen}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: 0, background: 'none', border: 'none', color: 'inherit', font: 'inherit', fontWeight: 600, cursor: 'pointer', textAlign: 'left', marginBottom: thesisOpen ? 4 : 0 }}
                    >
                        <span style={{ display: 'inline-block', transform: thesisOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', opacity: 0.7 }}>▸</span>
                        Portfolio thesis{portfolioThesis.version != null ? ` · v${portfolioThesis.version}` : ''}
                    </button>
                    {thesisOpen && (<>
                        {portfolioThesis.strategy && <div style={{ opacity: 0.85, marginBottom: portfolioThesis.targetExposures?.length ? 6 : 0 }}>{portfolioThesis.strategy}</div>}
                        {Array.isArray(portfolioThesis.targetExposures) && portfolioThesis.targetExposures.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {portfolioThesis.targetExposures.map((e, i) => (
                                    <span key={i} style={{ padding: '2px 8px', border: '1px solid var(--border, #444)', borderRadius: 999 }}>
                                        {e.label}{e.target != null ? ` ${Math.round(e.target * 100)}%` : ''}
                                    </span>
                                ))}
                            </div>
                        )}
                    </>)}
                </div>
            )}

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
                {messages.length === 0 && <AgentIntro agent={AGENTS.portfolio} />}
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

                {(isLoading || messages.some(m => m.role === 'assistant' && m.content)) && (
                    <AgentTurnTag agent={AGENTS.portfolio} active={isLoading} />
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Action bar — a footer below the scroll area (not inside it) so it stays
                pinned above the input without ever covering the messages. */}
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
}
