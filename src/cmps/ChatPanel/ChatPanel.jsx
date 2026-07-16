import { useState, useRef, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { ChatMarkdown } from '../ChatMarkdown.jsx'
import { useMicInput } from '../../customHooks/useMicInput.js'
import { useChatScroll } from '../../customHooks/useChatScroll.js'
import { ChatInputRow } from '../ChatInputRow.jsx'
import { AgentIntro, AgentTurnTag } from '../AxlHub/AgentSummon.jsx'
import { AGENTS } from '../AxlHub/agentMeta.jsx'
import { ToolStatusChip } from '../ToolStatusChip/ToolStatusChip.jsx'
import { ConvictionChip } from '../ConvictionChip/ConvictionChip.jsx'
import { ChatPhaseHeading } from '../ChatPhaseHeading.jsx'
import { ChatReasoning } from '../ChatReasoning.jsx'
import './ChatPanel.scss'

const P = 'chat-panel__build-summary'

function ConditionList({ conditions, logic }) {
    if (!Array.isArray(conditions) || conditions.length === 0) return null
    return (
        <div className={`${P}-conditions`}>
            {conditions.map((c, i) => (
                <div key={typeof c === 'string' ? c : c?.condition} className={`${P}-condition`}>
                    {i > 0 && <span className={`${P}-op`}>{logic}</span>}
                    <span className={`${P}-cond-text`}>
                        {typeof c === 'string' ? c : c?.condition}
                    </span>
                    {c?.timeframe && <span className={`${P}-tf`}>{c.timeframe}</span>}
                </div>
            ))}
        </div>
    )
}

function TradeBuildSummary({ analysisState, selectedAccounts = [] }) {
    const [convictionOpen, setConvictionOpen] = useState(false)
    if (!analysisState) return null
    const s  = analysisState.structured_state || {}
    const pt = s.pending_trade || {}
    if (!s.active_asset) return null

    const hasEntry = pt.entry_conditions?.length > 0
    const hasStop  = pt.stop_conditions?.length > 0
    const hasTp    = pt.tp_conditions?.length > 0
    if (!hasEntry && !hasStop && !pt.direction && pt.quantity == null) return null

    return (
        <div className={P}>
            <div className={`${P}-header`}>
                <span className={`${P}-title`}>your idea —</span>
                <span className={`${P}-asset`}>{s.active_asset}</span>
                {pt.direction && (
                    <span className={`${P}-dir direction--${pt.direction}`}>{pt.direction}</span>
                )}
                {pt.quantity != null && (
                    <span className={`${P}-tf-main`}>{pt.quantity}</span>
                )}
                {pt.type && (
                    <span className={`${P}-tf-main`}>{pt.type}</span>
                )}
            </div>
            {pt.conviction?.level && (
                <div className={`${P}-group ${P}-group--conviction`}>
                    <span className={`${P}-label`}>Conviction</span>
                    {pt.conviction.rationale ? (
                        <button
                            type="button"
                            className={`${P}-conviction-toggle`}
                            onClick={() => setConvictionOpen(o => !o)}
                            aria-expanded={convictionOpen}
                            title={convictionOpen ? 'Hide reasoning' : 'Show reasoning'}
                        >
                            <ConvictionChip conviction={pt.conviction} showRationale={convictionOpen} />
                            <span className={`${P}-conviction-caret`} aria-hidden="true">
                                {convictionOpen ? '▾' : '▸'}
                            </span>
                        </button>
                    ) : (
                        <ConvictionChip conviction={pt.conviction} />
                    )}
                </div>
            )}
            {Number.isFinite(pt.rr) && (
                <div className={`${P}-group`}>
                    <span className={`${P}-label`}>R:R</span>
                    <span className={`${P}-rr${pt.rr < 1.5 ? ' is-thin' : ''}`}>
                        {pt.rr.toFixed(1)}R
                    </span>
                </div>
            )}
            {hasEntry && (
                <div className={`${P}-group`}>
                    <span className={`${P}-label`}>Entry</span>
                    <ConditionList conditions={pt.entry_conditions} logic={pt.entry_logic || 'AND'} />
                </div>
            )}
            {hasStop && (
                <div className={`${P}-group`}>
                    <span className={`${P}-label`}>Stop</span>
                    <ConditionList conditions={pt.stop_conditions} logic={pt.stop_logic || 'OR'} />
                </div>
            )}
            {hasTp && (
                <div className={`${P}-group`}>
                    <span className={`${P}-label`}>TP</span>
                    <ConditionList conditions={pt.tp_conditions} logic={pt.tp_logic || 'OR'} />
                </div>
            )}
            {Array.isArray(pt.additional_entries) && pt.additional_entries.map((ae, i) => (
                ae.conditions?.length > 0 && (
                    <div key={i} className={`${P}-group`}>
                        <span className={`${P}-label`}>+{ae.quantity ?? '?'}</span>
                        <ConditionList conditions={ae.conditions} logic={ae.logic || 'AND'} />
                    </div>
                )
            ))}
            <div className={`${P}-group ${P}-group--accounts`}>
                <span className={`${P}-label`}>On</span>
                {selectedAccounts.length > 0 ? (
                    <div className={`${P}-accounts`}>
                        {selectedAccounts.map(a => (
                            <span key={a.id} className={`${P}-account-chip ${a.isLive ? 'live' : 'demo'}`}>
                                {a.broker} · {a.login}
                            </span>
                        ))}
                    </div>
                ) : (
                    <span className={`${P}-no-accounts`}>no accounts selected</span>
                )}
            </div>
        </div>
    )
}

function isIdeaReady(analysisState) {
    const s  = analysisState?.structured_state || {}
    const pt = s.pending_trade || {}
    if (!(s.active_asset && pt.direction && pt.quantity != null)) return false
    if (pt.immediate) return true
    return !!(
        pt.entry_conditions?.length > 0 &&
        pt.stop_conditions?.length > 0 &&
        pt.tp_conditions?.length > 0
    )
}

const PHASE_LABELS = { 1: 'Nucleus', 2: 'Formation', 3: 'Structure', 4: 'Exits', 5: 'Validation' }

export function ChatPanel({ messages = [], analysisState = {}, onSend, onGenerate, onClear, onStop, canResume = false, onResume, isLoading, streamStatus = '', isEditing = false, isInvalidationReview = false, onDismissInvalidation, onBuyMarket, isPostOrderEdit = false, availableAccounts = [], selectedAccounts = [], historySlot = null }) {
    const [input, setInput] = useState('')
    const [dismissConfirm, setDismissConfirm] = useState(false)

    // Has the user actually changed anything via chat since entering edit mode?
    // Until they do, the primary button offers a clean "Changed my mind" exit.
    const [editDirty, setEditDirty] = useState(false)
    useEffect(() => { setEditDirty(false); setDismissConfirm(false) }, [isEditing])

    const analysisStateRef = useRef(analysisState)
    useEffect(() => { analysisStateRef.current = analysisState }, [analysisState])

    const onTranscript = useCallback((text) => {
        if (text) { setEditDirty(true); onSend(text, analysisStateRef.current) }
    }, [onSend])

    const { isRecording, isTranscribing, toggle: toggleMic, cancel: cancelMic } = useMicInput({ onTranscript })
    const inputRef      = useRef(null)
    const ideaReady     = isIdeaReady(analysisState)
    const generateReady = ideaReady && selectedAccounts?.length > 0

    const s  = analysisState?.structured_state || {}
    const pt = s.pending_trade || {}
    const isImmediate = pt.immediate === true
    const direction   = pt.direction ?? 'long'

    // In post-order edit mode (adding stops/TPs to a live position), we relax the
    // readiness check — any edit with asset + direction set can be saved.
    const editReady = isEditing && (generateReady || (isPostOrderEdit && !!(s.active_asset && direction)))

    // A market entry ("go in now") is offered whenever the idea is immediate and
    // ready — including while editing a still-pending idea. A live position
    // (post-order edit) can't be market-entered, so it keeps "Update idea".
    const canBuyMarket = isImmediate && ideaReady && !isPostOrderEdit

    const showChangedMind = isEditing && !editDirty && !isPostOrderEdit

    // In edit mode there is ALWAYS an enabled escape: leave without saving. It sits at the end of
    // every turn (and after a Stop — the action bar shows whenever !isLoading), next to whatever
    // primary action is offered (Update / Buy Market / a disabled Update while not-yet-ready).
    const laterBtn = isEditing ? (
        <button className="chat-panel__generate chat-panel__generate--cancel" onClick={onClear}>
            I&apos;ll do it later
        </button>
    ) : null

    // Scroll-watch token: changes whenever the action bubble content changes so the
    // chat re-pins to bottom when buttons appear (e.g. idea becomes generate-ready).
    const actionWatch = `${streamStatus}|${ideaReady}|${generateReady}|${isInvalidationReview}|${isEditing}|${isImmediate}|${isPostOrderEdit}`

    const { messagesRef, messagesEndRef, handleScroll } = useChatScroll(messages, {
        onFinishStreaming: () => inputRef.current?.focus(),
        watch: actionWatch,
    })

    function handleKeyDown(ev) {
        if (ev.key === 'Enter' && !ev.shiftKey) {
            ev.preventDefault()
            handleSend()
        }
    }

    function handleSend() {
        const trimmed = input.trim()
        if (!trimmed || isLoading) return
        setEditDirty(true)
        onSend(trimmed, analysisState)
        setInput('')
    }

    return (
        <div className="chat-panel">
            {historySlot}
            <TradeBuildSummary
                analysisState={analysisState}
                selectedAccounts={availableAccounts.filter(a => selectedAccounts.includes(a.id))}
            />

            <div className="chat-panel__messages" ref={messagesRef} onScroll={handleScroll}>
                {messages.length === 0 && <AgentIntro agent={AGENTS.idea} />}
                {messages.map((msg, i) => (
                    msg.role === 'phase' ? (
                        <ChatPhaseHeading key={i} phase={msg.phase} label={PHASE_LABELS[msg.phase]} total={5} />
                    ) : msg.type === 'chart' ? (
                        <div key={i} className="chat-panel__bubble chat-panel__bubble--assistant chat-panel__chart">
                            <img
                                className="chat-panel__chart-img"
                                src={`data:image/png;base64,${msg.imageBase64}`}
                                alt={`${msg.symbol ?? ''} ${msg.timeframe ?? ''} chart`}
                                loading="lazy"
                            />
                            {(msg.symbol || msg.timeframe) && (
                                <span className="chat-panel__chart-caption">
                                    {[msg.symbol, msg.timeframe].filter(Boolean).join(' · ')}
                                </span>
                            )}
                        </div>
                    ) : (
                        <div key={i} className={`chat-panel__bubble chat-panel__bubble--${msg.role}`}>
                            {msg.role === 'assistant' ? (
                                <>
                                    <ChatReasoning text={msg.reasoning} live={msg.streaming && !msg.content} />
                                    <ChatMarkdown>{(msg.content ?? '').replace(/<asset>[\s\S]*?<\/asset>/g, '').trimStart()}</ChatMarkdown>
                                    {msg.streaming && !msg.content && (
                                        <span className="chat-panel__thinking">thinking…</span>
                                    )}
                                </>
                            ) : (
                                msg.content
                            )}
                        </div>
                    )
                ))}

                {isLoading && <ToolStatusChip label={streamStatus} />}

                {/* Typing dots only when loading but no streaming message yet */}
                {isLoading && !messages.some(m => m.streaming) && (
                    <div className="chat-panel__bubble chat-panel__bubble--assistant">
                        <span className="chat-panel__typing">
                            <span /><span /><span />
                        </span>
                    </div>
                )}

                {/* Agent signature pinned to the foot of the thread — it moves down
                    with the conversation and pulses while a reply is streaming
                    (never disappears), rather than repeating per turn. */}
                {(isLoading || messages.some(m => m.role === 'assistant' && m.content)) && (
                    <AgentTurnTag agent={AGENTS.idea} active={isLoading} />
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Action bar — a footer below the scroll area (not inside it) so it stays
                pinned above the input without ever covering the messages. */}
            {!isLoading && (isInvalidationReview ? isEditing : isEditing || canBuyMarket || editReady || ideaReady) && (
                <div className="chat-panel__action-bubble">
                    {dismissConfirm ? (
                        <div className="chat-panel__dismiss-confirm">
                            <span>Setup is still valid — clear the alert?</span>
                            <div className="chat-panel__dismiss-confirm-btns">
                                <button
                                    className="chat-panel__review-btn chat-panel__review-btn--dismiss"
                                    onClick={() => { setDismissConfirm(false); onDismissInvalidation?.() }}
                                >Confirm</button>
                                <button
                                    className="chat-panel__review-btn chat-panel__review-btn--later"
                                    onClick={() => setDismissConfirm(false)}
                                >Cancel</button>
                            </div>
                        </div>
                    ) : isInvalidationReview ? (
                        <>
                            {generateReady && (
                                <button className="chat-panel__review-btn chat-panel__review-btn--update" onClick={onGenerate}>
                                    Update idea
                                </button>
                            )}
                            <button className="chat-panel__review-btn chat-panel__review-btn--dismiss" onClick={() => setDismissConfirm(true)}>
                                Dismiss
                            </button>
                            <button className="chat-panel__review-btn chat-panel__review-btn--later" onClick={onClear}>
                                I&apos;ll do it later
                            </button>
                        </>
                    ) : canBuyMarket ? (
                        <>
                            {generateReady ? (
                                <button
                                    className={`chat-panel__market-btn chat-panel__market-btn--${direction}`}
                                    onClick={onBuyMarket}
                                >
                                    {direction === 'short' ? 'Sell Market' : 'Buy Market'}
                                </button>
                            ) : (
                                <button
                                    className={`chat-panel__market-btn chat-panel__market-btn--${direction}`}
                                    disabled
                                    title="Select a broker account above to place this trade"
                                >
                                    {direction === 'short' ? 'Sell Market' : 'Buy Market'}
                                </button>
                            )}
                            {laterBtn}
                        </>
                    ) : (
                        <>
                            {/* No "Update idea" until the user has actually changed something
                                (showChangedMind) — but the "I'll do it later" escape is always there. */}
                            {!showChangedMind && (
                                <button
                                    className="chat-panel__generate"
                                    onClick={generateReady ? onGenerate : undefined}
                                    disabled={!generateReady}
                                    title={generateReady ? undefined : 'Select a broker account above to generate this idea'}
                                >
                                    {isEditing ? 'Update idea' : 'Generate idea'}
                                </button>
                            )}
                            {laterBtn}
                        </>
                    )}
                </div>
            )}

            <ChatInputRow
                prefix="chat-panel"
                textareaRef={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe your trade idea… (Enter to send, Shift+Enter for newline)"
                onSend={handleSend}
                sendDisabled={!input.trim() || isLoading}
                isStreaming={isLoading}
                onStop={onStop}
                canResume={canResume}
                onResume={onResume}
                onClear={onClear}
                clearDisabled={isLoading || isEditing || isInvalidationReview || !messages.length}
                clearTitle="Clear chat and idea"
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

ChatPanel.propTypes = {
    messages:          PropTypes.array,
    analysisState:     PropTypes.object,
    onSend:            PropTypes.func.isRequired,
    onGenerate:        PropTypes.func.isRequired,
    historySlot:       PropTypes.node,
    onClear:           PropTypes.func,
    onStop:            PropTypes.func,
    canResume:         PropTypes.bool,
    onResume:          PropTypes.func,
    isLoading:         PropTypes.bool,
    streamStatus:      PropTypes.string,
    isEditing:         PropTypes.bool,
    isInvalidationReview:    PropTypes.bool,
    onDismissInvalidation:   PropTypes.func,
    onBuyMarket:       PropTypes.func,
    isPostOrderEdit:   PropTypes.bool,
    availableAccounts:   PropTypes.array,
    selectedAccounts:    PropTypes.arrayOf(PropTypes.string),
}
