import { useState, useRef, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import ReactMarkdown from 'react-markdown'
import { useMicInput } from '../../customHooks/useMicInput.js'
import { AccountSelector } from './AccountSelector.jsx'
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

function canGenerate(analysisState, selectedAccounts) {
    const s  = analysisState?.structured_state || {}
    const pt = s.pending_trade || {}
    return !!(
        s.active_asset &&
        pt.direction &&
        pt.entry_conditions?.length > 0 &&
        pt.stop_conditions?.length > 0 &&
        pt.tp_conditions?.length > 0 &&
        pt.quantity != null &&
        selectedAccounts?.length > 0
    )
}

export function ChatPanel({ messages = [], analysisState = {}, onSend, onGenerate, onClear, isLoading, isEditing = false, availableAccounts = [], selectedAccounts = [], onAccountsChange, mainAccountId = null, onMainAccountChange }) {
    const [input, setInput] = useState('')

    const analysisStateRef = useRef(analysisState)
    useEffect(() => { analysisStateRef.current = analysisState }, [analysisState])

    const onTranscript = useCallback((text) => {
        if (text) onSend(text, analysisStateRef.current)
    }, [onSend])

    const { isRecording, isTranscribing, toggle: toggleMic } = useMicInput({ onTranscript })
    const messagesEndRef   = useRef(null)
    const inputRef         = useRef(null)
    const prevMsgCount     = useRef(0)
    const wasStreaming     = useRef(false)
    const generateReady    = canGenerate(analysisState, selectedAccounts)

    useEffect(() => {
        const streaming    = messages.some(m => m.streaming)
        const countChanged = messages.length !== prevMsgCount.current
        const justFinished = wasStreaming.current && !streaming

        prevMsgCount.current = messages.length
        wasStreaming.current = streaming

        if (countChanged || justFinished) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
        if (justFinished) {
            inputRef.current?.focus()
        }
    }, [messages, isLoading])

    function handleKeyDown(ev) {
        if (ev.key === 'Enter' && !ev.shiftKey) {
            ev.preventDefault()
            handleSend()
        }
    }

    function handleSend() {
        const trimmed = input.trim()
        if (!trimmed || isLoading) return
        onSend(trimmed, analysisState)
        setInput('')
    }

    return (
        <div className="chat-panel">
            <div className="chat-panel__header">
                <svg className="chat-panel__title-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <line x1="10" y1="5" x2="10" y2="2"   stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <circle cx="10" cy="1.5" r="1"         fill="currentColor"/>
                    <rect x="2" y="5" width="16" height="12" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                    <circle cx="7"  cy="10" r="1.8"        fill="currentColor"/>
                    <circle cx="13" cy="10" r="1.8"        fill="currentColor"/>
                    <rect x="6.5" y="13" width="7" height="1.5" rx="0.75" fill="currentColor"/>
                </svg>
                <span className="chat-panel__title">Idea Tradvisor</span>
                <div className="chat-panel__header-right">
                    <AccountSelector
                        accounts={availableAccounts}
                        selectedIds={selectedAccounts}
                        onChange={onAccountsChange}
                        mainAccountId={mainAccountId}
                        onMainChange={onMainAccountChange}
                    />
                    {analysisState?.structured_state?.active_asset ? (
                        <svg className="chat-panel__building-bot" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Building idea">
                            <line x1="10" y1="5" x2="10" y2="2"   stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            <circle cx="10" cy="1.5" r="1"         fill="currentColor"/>
                            <rect x="2" y="5" width="16" height="12" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                            <circle cx="7"  cy="10" r="1.8"        fill="currentColor"/>
                            <circle cx="13" cy="10" r="1.8"        fill="currentColor"/>
                            <rect x="6.5" y="13" width="7" height="1.5" rx="0.75" fill="currentColor"/>
                        </svg>
                    ) : (
                        <span className={`chat-panel__status-dot ${isLoading ? 'loading' : 'idle'}`} />
                    )}
                </div>
            </div>

            <TradeBuildSummary
                analysisState={analysisState}
                selectedAccounts={availableAccounts.filter(a => selectedAccounts.includes(a.id))}
            />

            <div className="chat-panel__messages">
                {messages.length === 0 && (
                    <div className="chat-panel__empty">
                        Describe your trade idea — price levels, indicators, patterns and news events — I'll help you build your trade.
                    </div>
                )}
                {messages.map((msg, i) => (
                    <div key={i} className={`chat-panel__bubble chat-panel__bubble--${msg.role}`}>
                        {msg.role === 'assistant' ? (
                            <>
                                <ReactMarkdown>{msg.content.replace(/<asset>[\s\S]*?<\/asset>/g, '').trimStart()}</ReactMarkdown>
                                {msg.streaming && !msg.content && (
                                    <span className="chat-panel__thinking">thinking…</span>
                                )}
                            </>
                        ) : (
                            msg.content
                        )}
                    </div>
                ))}

                {/* Typing dots only when loading but no streaming message yet */}
                {isLoading && !messages.some(m => m.streaming) && (
                    <div className="chat-panel__bubble chat-panel__bubble--assistant">
                        <span className="chat-panel__typing">
                            <span /><span /><span />
                        </span>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            <button
                className="chat-panel__generate"
                disabled={!generateReady || isLoading}
                onClick={onGenerate}
            >
                {isEditing ? 'Update idea' : 'Generate idea'}
            </button>

            <div className="chat-panel__input-row">
                <button
                    className={`chat-panel__mic ${isRecording ? 'recording' : ''} ${isTranscribing ? 'transcribing' : ''}`}
                    onClick={toggleMic}
                    disabled={isLoading || isTranscribing}
                    title={isRecording ? 'Stop recording' : 'Start recording'}
                >
                    {isTranscribing ? (
                        <span className="chat-panel__mic-spinner" />
                    ) : (
                        <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <rect x="7" y="1" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                            <path d="M4 10a6 6 0 0 0 12 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            <line x1="10" y1="16" x2="10" y2="19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            <line x1="7"  y1="19" x2="13" y2="19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                    )}
                </button>
                <textarea
                    ref={inputRef}
                    className="chat-panel__textarea"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe your trade idea… (Enter to send, Shift+Enter for newline)"
                    rows={2}
                    disabled={isLoading || isRecording}
                />
                <button
                    className="chat-panel__send"
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading}
                    title="Send"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="22" y1="2" x2="11" y2="13"/>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                </button>
                <button
                    className="chat-panel__clear"
                    onClick={onClear}
                    disabled={isLoading || isEditing || (!messages.length && !analysisState?.structured_state?.active_asset)}
                    title="Clear chat and idea"
                >
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <line x1="5" y1="5" x2="15" y2="15"/>
                        <line x1="15" y1="5" x2="5" y2="15"/>
                    </svg>
                </button>
            </div>
        </div>
    )
}

ChatPanel.propTypes = {
    messages:          PropTypes.array,
    analysisState:     PropTypes.object,
    onSend:            PropTypes.func.isRequired,
    onGenerate:        PropTypes.func.isRequired,
    onClear:           PropTypes.func,
    isLoading:         PropTypes.bool,
    availableAccounts:   PropTypes.array,
    selectedAccounts:    PropTypes.arrayOf(PropTypes.string),
    onAccountsChange:    PropTypes.func,
    mainAccountId:       PropTypes.string,
    onMainAccountChange: PropTypes.func,
}
