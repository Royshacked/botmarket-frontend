import { useState, useRef, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { kairosService, CALLS_CHANGED } from '../../services/kairos/kairos.service.remote.js'
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
import { ChatReasoning } from '../ChatReasoning.jsx'
import { ChatPhaseHeading } from '../ChatPhaseHeading.jsx'
import { HermesBadge } from '../AxlHub/AgentBadges.jsx'
import '../PortfolioPanel/PortfolioPanel.scss'
import './KairosPanel.scss'

const SUGGESTIONS = ['Day-trade setup on NVDA today', 'Swing idea for TSLA']

const KAIROS_PHASE_LABELS = { 1: 'Classify', 2: 'Zones', 3: 'Risk', 4: 'Trigger', 5: 'Size & account' }

// call.broker → workspace mode (mirrors backend deriveMode); default paper.
function brokerMode(broker) {
    if (broker === 'ctrader') return 'live'
    if (broker === 'manual')  return 'manual'
    return 'paper'
}

function MessageBubble({ msg }) {
    if (msg.role === 'phase') {
        return <ChatPhaseHeading phase={msg.phase} label={KAIROS_PHASE_LABELS[msg.phase]} total={5} />
    }
    if (msg.role === 'user') {
        return <div className="portfolio-panel__bubble portfolio-panel__bubble--user">{msg.content}</div>
    }
    const reasoning = <ChatReasoning text={msg.reasoning} live={msg.streaming && !msg.content} />
    if (!msg.content && msg.streaming) {
        return (
            <div className="portfolio-panel__bubble portfolio-panel__bubble--assistant">
                {reasoning}
                <span className="portfolio-panel__thinking">reading the chart…</span>
            </div>
        )
    }
    return (
        <div className="portfolio-panel__bubble portfolio-panel__bubble--assistant">
            {reasoning}
            <div className="portfolio-panel__bubble-text"><ChatMarkdown>{msg.content}</ChatMarkdown></div>
        </div>
    )
}

// Draft/detail preview of a call — zones / reference levels / patterns. Reused by the call popup,
// where `showHead={false}` skips the asset/type/bias line + thesis (the popup renders its own).
export function CallDraft({ call, showHead = true }) {
    const zones = call.entry_zones ?? []
    const refs  = call.reference_levels ?? []
    const pats  = call.patterns ?? []
    return (
        <div className="kairos-panel__draft">
            {showHead && (
                <div className="kairos-panel__draft-head">
                    <HermesBadge size={22} />
                    <span className="kairos-panel__asset">{call.asset}</span>
                    <span className="kairos-panel__type">{call.trade_type}</span>
                    <span className={`kairos-panel__dir kairos-panel__dir--${call.bias}`}>{call.bias}</span>
                    {call.sizing?.max_size != null && <span className="kairos-panel__size">max {call.sizing.max_size}</span>}
                </div>
            )}
            {showHead && call.thesis && <div className="kairos-panel__thesis">{call.thesis}</div>}
            {zones.length > 0 && (
                <div className="kairos-panel__chips">
                    {zones.map((z, i) => (
                        <span key={i} className="kairos-panel__chip kairos-panel__chip--zone">
                            {z.side} {z.lower}–{z.upper}{z.kind ? ` · ${z.kind}` : ''}
                        </span>
                    ))}
                </div>
            )}
            {refs.length > 0 && (
                <div className="kairos-panel__chips">
                    {refs.map((r, i) => <span key={i} className="kairos-panel__chip kairos-panel__chip--ref">{r.kind} {r.price}</span>)}
                </div>
            )}
            {pats.length > 0 && (
                <div className="kairos-panel__chips">
                    {pats.map((p, i) => (
                        <span key={i} className="kairos-panel__chip kairos-panel__chip--pat" title={p.look_for || ''}>
                            {p.name}{p.evidence === 'inferred' ? ' ·?' : ''}
                        </span>
                    ))}
                </div>
            )}
        </div>
    )
}

// Ready/expiring calls are surfaced as social-chat cards (entry_confirm / call_expiry) that
// route to the call pop-out (Confirm entry / Accept edit / Delete). They're also listed in the
// Axl Lists "Calls" tab — so the panel no longer duplicates them as an in-panel readiness strip.

export function KairosPanel({ onLoadingChange, onGenerated, availableAccounts = [], selectedAccounts = [], mainAccountId = null, workspace = 'paper' }) {
    const chat = useChatStream()
    const { messages } = chat

    useEffect(() => { onLoadingChange?.(chat.isLoading) }, [chat.isLoading])   // eslint-disable-line react-hooks/exhaustive-deps

    const [inputText,   setInputText]   = useState('')
    const [pendingCall, setPendingCall] = useState(null)
    const [calls,       setCalls]       = useState([])
    const [perf,        setPerf]        = useState(null)
    const textareaRef = useRef(null)

    const ideaAccounts = availableAccounts.filter(a => selectedAccounts.includes(a.id))

    const refreshCalls = useCallback(async () => {
        setCalls(await kairosService.listCalls())
        setPerf(await kairosService.getPerformance())
    }, [])
    useEffect(() => {
        refreshCalls()
        window.addEventListener(CALLS_CHANGED, refreshCalls)   // sync with the Axl Lists Calls tab
        return () => window.removeEventListener(CALLS_CHANGED, refreshCalls)
    }, [refreshCalls])

    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable closure
    const onTranscript = useCallback((text) => { if (text) _send(text) }, [])
    const { isRecording, isTranscribing, toggle: toggleMic, cancel: cancelMic } = useMicInput({ onTranscript })

    async function _send(text) {
        if (!text || chat.isLoading) return
        const history = messages.filter(m => !m.streaming && m.role !== 'phase').map(m => ({ role: m.role, content: m.content }))
        history.push({ role: 'user', content: text })

        const { signal, handlers } = chat.begin(text, {
            onDone: (data) => {
                chat.finishStreaming({ role: 'assistant', content: data.reply })
                if (data.call) setPendingCall(data.call)
            },
        })

        try {
            await kairosService.sendStream(history, {
                model:           readStoredModel('kairosModel'),
                reasoningEffort: readStoredReasoning('kairosReasoning'),
                routingMode:     readStoredRoutingMode('kairosRoutingMode'),
                currentPhase:    chat.phase,
                accounts:        ideaAccounts,
                signal,
                ...handlers,
            })
        } catch (err) {
            console.error('[kairos]', err)
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
        setPendingCall(null)
        setInputText('')
    }

    async function handleGenerate() {
        if (!pendingCall || ideaAccounts.length === 0) return
        try {
            await kairosService.generateCall(pendingCall, ideaAccounts, mainAccountId)
            setPendingCall(null)
            await refreshCalls()
            onGenerated?.()   // call generated — return to the axl hub
        } catch (err) {
            console.error('[kairos] generate', err)
        }
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
    }

    const callReady   = !!pendingCall && (pendingCall.entry_zones?.length > 0)
    const canGenerate = callReady && ideaAccounts.length > 0

    const scoped     = calls.filter(c => brokerMode(c.broker) === workspace)
    // Live watch-list: pre-entry (waiting/watching) + managed positions (in_position).
    const active     = scoped.filter(c => ['waiting', 'watching', 'in_position'].includes(c.status))

    const { messagesRef, messagesEndRef, handleScroll } = useChatScroll(messages, {
        onFinishStreaming: () => textareaRef.current?.focus(),
        watch: `${chat.streamStatus}|${callReady}`,
    })

    return (
        <div className="portfolio-panel kairos-panel">
            {callReady && (
                <div className="portfolio-panel__build-summary">
                    <div className="portfolio-panel__build-summary-header">
                        <span className="portfolio-panel__build-summary-title">your call —</span>
                        <span className="portfolio-panel__build-summary-name">{pendingCall.asset}</span>
                    </div>
                    <CallDraft call={pendingCall} />
                </div>
            )}

            <div className="portfolio-panel__messages" ref={messagesRef} onScroll={handleScroll}>
                {messages.length === 0 && (
                    <AgentIntro agent={AGENTS.kairos}>
                        <div className="kairos-panel__suggestions">
                            {SUGGESTIONS.map(s => (
                                <button key={s} className="kairos-panel__suggestion" onClick={() => _send(s)} disabled={chat.isLoading}>{s}</button>
                            ))}
                        </div>
                        {perf?.closed > 0 && (
                            <div className="kairos-panel__perf">
                                <span><b>{perf.closed}</b> closed</span>
                                {perf.win_rate != null && <span><b>{Math.round(perf.win_rate * 100)}%</b> win</span>}
                                {perf.avg_r != null && <span><b>{perf.avg_r > 0 ? '+' : ''}{perf.avg_r}R</b> avg</span>}
                                {perf.total_pnl != null && <span>P&amp;L <b>{perf.total_pnl}</b></span>}
                            </div>
                        )}
                        {active.length > 0 && (
                            <div className="kairos-panel__active">
                                {active.map(c => (
                                    <span key={c.id} className="kairos-panel__active-row">
                                        <span className="kairos-panel__card-title">
                                            <HermesBadge size={16} />
                                            <span className="kairos-panel__asset">{c.asset}</span>
                                        </span>
                                        <span className="kairos-panel__active-status">
                                            {c.status === 'in_position' && c.position_state?.pending_action && <span className="kairos-panel__active-flag" title="Kairos suggests an action">⚑</span>}
                                            {c.status === 'in_position'
                                                ? `in · ${c.position_state?.metrics?.r_multiple_now != null ? `${c.position_state.metrics.r_multiple_now > 0 ? '+' : ''}${c.position_state.metrics.r_multiple_now}R` : '—'}`
                                                : c.status}
                                        </span>
                                    </span>
                                ))}
                            </div>
                        )}
                    </AgentIntro>
                )}
                {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
                {chat.isLoading && <ToolStatusChip label={chat.streamStatus} />}
                {(chat.isLoading || messages.some(m => m.role === 'assistant' && m.content)) && (
                    <AgentTurnTag agent={AGENTS.kairos} active={chat.isLoading} />
                )}
                <div ref={messagesEndRef} />
            </div>

            {!chat.isLoading && callReady && (
                <div className="portfolio-panel__action-bubble">
                    <button className="portfolio-panel__review-btn portfolio-panel__review-btn--update kairos-panel__generate-btn" onClick={handleGenerate} disabled={!canGenerate}>
                        {ideaAccounts.length === 0 ? 'Mark an account to generate' : 'Generate call'}
                    </button>
                </div>
            )}

            <ChatInputRow
                prefix="portfolio-panel"
                textareaRef={textareaRef}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="A ticker + how you'd trade it — intraday, day, or swing (Enter to send)"
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

KairosPanel.propTypes = {
    onLoadingChange:  PropTypes.func,
    onGenerated:      PropTypes.func,
    availableAccounts: PropTypes.array,
    selectedAccounts:  PropTypes.array,
    mainAccountId:     PropTypes.string,
    workspace:         PropTypes.string,
}
