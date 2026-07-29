import { useState, useRef, useEffect } from 'react'
import PropTypes from 'prop-types'
import { portfolioService } from '../../services/portfolio/portfolio.service.remote.js'
import { threadsService, newThreadId } from '../../services/threads/threads.service.remote.js'
import { showErrorMsg, eventBus, REVIEW_RESOLVED } from '../../services/event-bus.service'
import { ChatBubble } from '../ChatBubble.jsx'
import { readStoredModel } from '../modelOptions.js'
import { readStoredReasoning } from '../reasoningOptions.js'
import { readStoredRoutingMode } from '../routingModeOptions.js'
import { useChatStream, toChatHistory } from '../../customHooks/useChatStream.js'
import { AgentMessages } from '../AgentMessages.jsx'
import { AgentChatInput } from '../AgentChatInput.jsx'
import { AgentIntro, AgentTurnTag } from '../AxlHub/AgentSummon.jsx'
import { AGENTS } from '../AxlHub/agentMeta.jsx'
import { ToolStatusChip } from '../ToolStatusChip/ToolStatusChip.jsx'
import './PortfolioPanel.scss'

const PHASE_LABELS = { 1: 'Mandate', 2: 'Macro', 3: 'Architecture', 4: 'Selection', 5: 'Sizing', 6: 'Review' }

// The canned turn the "Review" button sends to trigger Atlas's phase-6 review pass. Atlas
// then confirms "hold as-is" or emits a <portfolio_update> the user accepts/dismisses.
const REVIEW_REQUEST = "Run my scheduled portfolio review now: assess performance and each holding against our thesis and mandate, then either confirm we hold as-is or propose specific changes (rebalance, trim, add, exit, or swap)."

const MessageBubble = ({ msg, onTickerSelect }) => (
    <ChatBubble
        msg={msg}
        phaseLabels={PHASE_LABELS}
        phaseTotal={6}
        onTickerSelect={onTickerSelect}
        tickerHint="Build idea →"
    />
)

export function PortfolioPanel({
    onTickerSelect,
    onGeneratePlan,
    onUpdatePlan,
    onPortfolioUpdate,
    onBuildingPlanChange,
    onLoadingChange,
    onReviewResolved,
    onAcceptReview,
    onSourceInArgus,
    chatRestore       = null,
    availableAccounts = [],
    selectedAccounts  = [],
    mainAccountId     = null,
    resumeRef         = null,
}) {
    const chat = useChatStream()
    const { messages, setMessages, isLoading, streamStatus } = chat

    // Report streaming state up so the agent-bar "live" dot can pulse for Atlas.
    useEffect(() => { onLoadingChange?.(isLoading) }, [isLoading])   // eslint-disable-line react-hooks/exhaustive-deps

    const [pendingPlan,           setPendingPlan]           = useState(null)
    const [screenRequest,         setScreenRequest]         = useState(null)   // Atlas → Argus investing mandate hand-off
    const [editingPortfolioId,    setEditingPortfolioId]    = useState(null)
    const [editingPortfolioIdeas, setEditingPortfolioIdeas] = useState([])
    const [editDirty,             setEditDirty]             = useState(false)
    const [isReviewMode,          setIsReviewMode]          = useState(false)
    const [dismissConfirm,        setDismissConfirm]        = useState(false)
    const [reviewUpdate,          setReviewUpdate]          = useState(null)   // { update, thesis } Atlas proposed
    const [reviewRan,             setReviewRan]             = useState(false)  // a review pass has completed
    const [accepting,             setAccepting]             = useState(false)
    const [portfolioThesis, setPortfolioThesis] = useState(null)
    const [thesisOpen, setThesisOpen] = useState(true)

    useEffect(() => {
        if (!chatRestore) return
        setMessages(chatRestore.messages ?? [])
        setPendingPlan(null)
        setEditDirty(false)
        setDismissConfirm(false)
        setEditingPortfolioId(chatRestore.portfolioId ?? null)
        setEditingPortfolioIdeas(chatRestore.portfolioIdeas ?? [])
        setIsReviewMode(chatRestore.reviewMode ?? false)
        setReviewUpdate(null)
        setReviewRan(false)
        setAccepting(false)
        reviewTriggeredRef.current = false
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
    const threadIdRef       = useRef(newThreadId())   // construction draft thread
    const reviewTriggeredRef = useRef(false)          // the "Review" button fired this turn

    const planHasSize  = !!pendingPlan && (Number(pendingPlan.positionSize) > 0)
    const planReady    = !!pendingPlan && pendingPlan.ideas.length > 0 && pendingPlan.ideas.every(i => Number(i.quantity) > 0)
    const canGenerate  = planReady && (!!editingPortfolioId || selectedAccounts?.length > 0)

    async function _send(text) {
        if (!text || isLoading) return
        setEditDirty(true)
        setScreenRequest(null)   // a new turn supersedes any pending "Source in Argus" offer

        const history = toChatHistory(messages)
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
                if (data.screen_request) setScreenRequest(data.screen_request)   // offer the Argus investing hand-off
                // Pass any thesis emitted in THIS same turn so a confirmed review
                // rebalance persists it (reason 'accepted-rebalance'). Only the
                // same-turn proposal is attached — never the restored existing thesis.
                if (data.update?.changes?.length) {
                    // Review mode: surface an inline Accept/Dismiss on the proposal.
                    // Construction/edit: hand off to the existing apply path.
                    if (isReviewMode) setReviewUpdate({ update: data.update, thesis: data.thesis ?? null })
                    else if (onPortfolioUpdate) onPortfolioUpdate(data.update, false, data.thesis ?? null)
                }
                // The review pass finished → show Accept/Dismiss/Later. Fires when the
                // Review button ran (even on a hold) OR any turn produced a proposal, so a
                // manually-typed review that yields changes still surfaces Accept.
                if (isReviewMode && (reviewTriggeredRef.current || data.update?.changes?.length)) {
                    setReviewRan(true)
                    reviewTriggeredRef.current = false
                }
            },
        })

        try {
            await portfolioService.sendStream(history, ideaAccounts, {
                mainAccountId,   // reference account Atlas sizes the others against
                portfolioId:     editingPortfolioId,
                portfolioIdeas:  editingPortfolioIdeas,
                threadId:        editingPortfolioId ? null : threadIdRef.current,
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

    // Resume a stopped reply in place: send the conversation ending with the partial
    // assistant turn as a prefill so the model continues the SAME bubble.
    async function _continue() {
        if (isLoading) return
        const last = messages[messages.length - 1]
        if (!last || last.role !== 'assistant' || !last.stopped) return
        const base = chat.resumeBase()   // '' = stopped before any token → regenerate
        setEditDirty(true)

        const history = chat.finalizeResumeHistory(
            toChatHistory(messages),
            base,
        )

        const ideaAccounts = availableAccounts.filter(a => selectedAccounts.includes(a.id))
        pendingTickersRef.current = []

        const cont = chat.beginContinue({
            onTicker: (symbol) => {
                if (!pendingTickersRef.current.includes(symbol)) pendingTickersRef.current.push(symbol)
            },
            onError: () => chat.restoreStopped(base),   // keep the partial + Continue on failure
            onDone: (data) => {
                const tickers = [...pendingTickersRef.current]
                pendingTickersRef.current = []
                if (data.mandate) latestMandateRef.current = data.mandate
                if (data.thesis) { latestThesisRef.current = data.thesis; setPortfolioThesis(data.thesis) }
                chat.finishStreaming({ role: 'assistant', content: base + data.reply, tickers })
                if (data.plan?.ideas?.length) setPendingPlan(data.plan)
                if (data.screen_request) setScreenRequest(data.screen_request)   // offer the Argus investing hand-off
                if (data.update?.changes?.length) {
                    // Review mode: surface an inline Accept/Dismiss on the proposal.
                    // Construction/edit: hand off to the existing apply path.
                    if (isReviewMode) setReviewUpdate({ update: data.update, thesis: data.thesis ?? null })
                    else if (onPortfolioUpdate) onPortfolioUpdate(data.update, false, data.thesis ?? null)
                }
                // The review pass finished → show Accept/Dismiss/Later. Fires when the
                // Review button ran (even on a hold) OR any turn produced a proposal, so a
                // manually-typed review that yields changes still surfaces Accept.
                if (isReviewMode && (reviewTriggeredRef.current || data.update?.changes?.length)) {
                    setReviewRan(true)
                    reviewTriggeredRef.current = false
                }
            },
        })
        if (!cont) return   // nothing continuable

        try {
            await portfolioService.sendStream(history, ideaAccounts, {
                mainAccountId,   // reference account Atlas sizes the others against
                portfolioId:     editingPortfolioId,
                portfolioIdeas:  editingPortfolioIdeas,
                threadId:        editingPortfolioId ? null : threadIdRef.current,
                reviewMode:      isReviewMode,
                mandate:         latestMandateRef.current,
                model:           readStoredModel('portfolioModel'),
                reasoningEffort: readStoredReasoning('portfolioReasoning'),
                routingMode:     readStoredRoutingMode('portfolioRoutingMode'),
                currentPhase:    chat.phase,
                signal:          cont.signal,
                ...cont.handlers,
            })
        } catch (err) {
            console.error('[portfolio]', err)
            chat.restoreStopped(base)
        } finally {
            chat.endStream()
        }
    }

    // "Review" button: fire Atlas's review pass. Its proposal (if any) lands in
    // reviewUpdate (→ inline Accept/Dismiss).
    function handleRunReview() {
        if (isLoading) return
        setReviewUpdate(null)
        setReviewRan(false)
        reviewTriggeredRef.current = true
        _send(REVIEW_REQUEST)
    }

    // "Accept changes": apply Atlas's proposed rebalance. The backend routes execution by
    // mode/position (paper/live close programmatically; manual posts a Fill card; pending
    // books just apply idea edits) and advances the review clock, flipping the Atlas card
    // to "Updated · next review <date>". Then returns to the Axl window.
    async function handleAcceptReview() {
        if (accepting) return
        const portfolioId = editingPortfolioId
        setAccepting(true)
        if (reviewUpdate) {
            // Atlas proposed changes → apply them (backend routes by mode/position).
            const { update, thesis } = reviewUpdate
            const pending = !(editingPortfolioIdeas ?? []).some(i => ['hit', 'long', 'short'].includes(i.status))
            const ok = await onAcceptReview?.(portfolioId, thesis ? { ...update, thesis } : update, { pending })
            if (ok === false) { setAccepting(false); return }   // apply failed — keep the proposal to retry
        } else {
            // Atlas held (no changes) → accept the hold: complete the review, card = "Reviewed".
            await _completeReview(portfolioId, 'reviewed')
        }
        setAccepting(false)
        setReviewUpdate(null)
        setReviewRan(false)
        setEditingPortfolioId(null)
        setEditingPortfolioIdeas([])
        setEditDirty(false)
        setIsReviewMode(false)
        setDismissConfirm(false)
        setPendingPlan(null); setMessages([])
        eventBus.emit(REVIEW_RESOLVED, { portfolioId })   // clear the red pencil
        onReviewResolved?.()
    }

    function handleClear() {
        setMessages([])
        setPendingPlan(null)
        latestMandateRef.current = null
        threadIdRef.current = newThreadId()   // fresh construction thread; the abandoned draft TTL-expires
    }

    // Resume an unfinished construction draft: restore its conversation + mandate and
    // keep writing to the SAME thread (so saveDraft refreshes it rather than forking a new one).
    async function handleResumeThread(threadId) {
        const t = await threadsService.getThread(threadId)
        if (!t) return
        setMessages(t.messages ?? [])
        setPendingPlan(null)
        setEditingPortfolioId(null)
        setEditingPortfolioIdeas([])
        latestMandateRef.current = t.mandate ?? null
        threadIdRef.current = t.threadId
    }
    // Expose resume to the shared agent-bar hamburger (MainPage).
    if (resumeRef) resumeRef.current = handleResumeThread

    // "Changed my mind" / "I'll do it later": leave edit/review mode without saving.
    // In review mode this is the "Later" path — clock does NOT reset.
    function handleCancelEdit() {
        setMessages([])
        setPendingPlan(null)
        setEditingPortfolioId(null)
        setEditingPortfolioIdeas([])
        setEditDirty(false)
        setIsReviewMode(false)
        setDismissConfirm(false)
        setReviewUpdate(null)
        setReviewRan(false)
        reviewTriggeredRef.current = false
    }

    // outcome flips the Atlas card: 'dismissed' (skipped) or 'reviewed' (accepted a hold).
    async function _completeReview(portfolioId, outcome = 'dismissed') {
        try {
            await portfolioService.completeReview(portfolioId, undefined, outcome)
            // The review is no longer due → clear the red pencil on the portfolio list.
            eventBus.emit(REVIEW_RESOLVED, { portfolioId })
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
            if (onGeneratePlan) onGeneratePlan(pendingPlan, messages, latestMandateRef.current, latestThesisRef.current, threadIdRef.current)
        }
        setPendingPlan(null); setMessages([])
        latestMandateRef.current = null
        threadIdRef.current = newThreadId()   // next construction chat gets a fresh draft thread
        // Generating/updating a plan (like resolving a review) hands the chat back to
        // the axl hub — onReviewResolved is MainPage's "return to axl" transition.
        onReviewResolved?.()
    }

    // Review-only: no plan changes, just acknowledge the review and reset the clock.
    // Advances nextReviewAt (+cadence); the backend flips the Atlas notification card to
    // "Dismissed · next review <date>". onReviewResolved returns the chat to the Axl window.
    async function handleDismissReview() {
        const portfolioId = editingPortfolioId
        if (onUpdatePlan) onUpdatePlan(null, portfolioId, messages)
        await _completeReview(portfolioId)
        setEditingPortfolioId(null)
        setEditingPortfolioIdeas([])
        setEditDirty(false)
        setIsReviewMode(false)
        setDismissConfirm(false)
        setReviewUpdate(null)
        setReviewRan(false)
        setPendingPlan(null); setMessages([])
        onReviewResolved?.()
    }

    const showChangedMind = !!editingPortfolioId && !editDirty && !isReviewMode
    const mainActionBar = !isLoading && (isReviewMode ? !!editingPortfolioId : (!!editingPortfolioId || planReady))

    // In edit mode there's ALWAYS an enabled escape (leave without saving), shown at the end of
    // every turn and after a Stop — next to "Update plan" instead of only before the first edit.
    const laterBtn = editingPortfolioId ? (
        <button className="portfolio-panel__generate portfolio-panel__generate--cancel" onClick={handleCancelEdit}>
            I&apos;ll do it later
        </button>
    ) : null

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

            <AgentMessages chat={chat} watch={`${planReady}|${canGenerate}|${isReviewMode}|${!!editingPortfolioId}`}>
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

            </AgentMessages>

            {/* Atlas → Argus: hand a sleeve's mandate to the investing screening desk. */}
            {!isLoading && screenRequest && (
                <div className="portfolio-panel__action-bubble">
                    <button
                        className="portfolio-panel__review-btn portfolio-panel__review-btn--update"
                        onClick={() => { onSourceInArgus?.(screenRequest); setScreenRequest(null) }}
                    >
                        Source {screenRequest.sector || screenRequest.style || 'this sleeve'} in Argus
                    </button>
                </div>
            )}

            {/* Action bar — a footer below the scroll area (not inside it) so it stays
                pinned above the input without ever covering the messages. */}
            {mainActionBar && (
                <div className="portfolio-panel__action-bubble">
                    {dismissConfirm ? (
                        <div className="portfolio-panel__dismiss-confirm">
                            <span>Dismiss this review? The next review will be in a week.</span>
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
                    ) : isReviewMode && reviewRan ? (
                        <>
                            <button className="portfolio-panel__review-btn portfolio-panel__review-btn--update" onClick={handleAcceptReview} disabled={accepting}>
                                {accepting ? 'Applying…' : reviewUpdate ? 'Accept changes' : 'Accept'}
                            </button>
                            <button className="portfolio-panel__review-btn portfolio-panel__review-btn--dismiss" onClick={() => setDismissConfirm(true)} disabled={accepting}>
                                Dismiss
                            </button>
                            <button className="portfolio-panel__review-btn portfolio-panel__review-btn--later" onClick={handleCancelEdit} disabled={accepting}>
                                I&apos;ll do it later
                            </button>
                        </>
                    ) : isReviewMode ? (
                        <>
                            <button className="portfolio-panel__review-btn portfolio-panel__review-btn--update" onClick={handleRunReview} disabled={isLoading}>
                                Review
                            </button>
                            <button className="portfolio-panel__review-btn portfolio-panel__review-btn--later" onClick={handleCancelEdit}>
                                I&apos;ll do it later
                            </button>
                            <button className="portfolio-panel__review-btn portfolio-panel__review-btn--dismiss" onClick={() => setDismissConfirm(true)}>
                                Dismiss
                            </button>
                        </>
                    ) : (
                        <>
                            {/* No "Update plan" until the user has actually changed something
                                (showChangedMind) — but the "I'll do it later" escape is always there. */}
                            {!showChangedMind && (
                                <button
                                    className="portfolio-panel__generate"
                                    onClick={canGenerate ? handleGenerate : undefined}
                                    disabled={!canGenerate}
                                    title={canGenerate ? undefined : 'Select a broker account above to generate this plan'}
                                >
                                    {editingPortfolioId ? 'Update plan' : 'Generate plan'}
                                </button>
                            )}
                            {laterBtn}
                        </>
                    )}
                </div>
            )}

            <AgentChatInput
                chat={chat}
                placeholder="Describe your portfolio goals… (Enter to send, Shift+Enter for newline)"
                onSend={_send}
                onClear={handleClear}
                onResume={_continue}
                busy={isLoading}
                clearLocked={!!editingPortfolioId}
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
    onLoadingChange:     PropTypes.func,
    onReviewResolved:    PropTypes.func,
    onAcceptReview:      PropTypes.func,
    onSourceInArgus:     PropTypes.func,
    chatRestore:         PropTypes.object,
    availableAccounts:   PropTypes.array,
    selectedAccounts:    PropTypes.arrayOf(PropTypes.string),
    mainAccountId:       PropTypes.string,
}
