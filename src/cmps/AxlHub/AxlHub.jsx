import { useState, useRef, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { BrandTitle } from '../BrandTitle.jsx'
import { AgentSummon } from './AgentSummon.jsx'
import { AgentGlyph } from './AgentBadges.jsx'
import { AGENTS, SUMMON_MS, DESKS } from './agentMeta.jsx'
import { axlService } from '../../services/axl/axl.service.remote'
import { useChatStream, toChatHistory } from '../../customHooks/useChatStream.js'
import { useChatScroll } from '../../customHooks/useChatScroll.js'
import { useMicInput } from '../../customHooks/useMicInput.js'
import { ChatInputRow } from '../ChatInputRow.jsx'
import { ChatMarkdown } from '../ChatMarkdown.jsx'
import { ChatReasoning } from '../ChatReasoning.jsx'
import { ToolStatusChip } from '../ToolStatusChip/ToolStatusChip.jsx'
import { ChatChartDock } from '../ChatChartDock.jsx'
import { ChatChart } from '../ChatChart.jsx'
import { closeChart } from '../../services/chartSurface.service.js'
import { readStoredModel } from '../modelOptions.js'
import { readStoredReasoning } from '../reasoningOptions.js'
import { readStoredRoutingMode } from '../routingModeOptions.js'
import './AxlHub.scss'

// ── axl ────────────────────────────────────────────────────────────────────────
// The ONE Axl surface, and where the user lands. Axl greets them, shows the desk
// buttons, and holds a real conversation: it answers app questions, docks charts,
// remembers the thread, and summons a desk when the reply carries a route.
//
// This used to be two screens. The landing box talked to a one-shot `/route`
// doorman — no history, no app knowledge — while the Axl that could actually
// converse sat behind an "or chat with axl" link. So the front door answered
// questions by inventing them, and a follow-up ("give spy" … "now the 4h") had
// nothing to resolve against. One agent, one endpoint, one screen.

function firstName(fullname = '') {
    const n = String(fullname).trim().split(/\s+/)[0]
    return n || ''
}

// Axl keeps its own bubble rather than the shared ChatBubble: its own SCSS namespace, and a
// ToolStatusChip while thinking instead of a text placeholder.
export function MessageBubble({ msg }) {
    // A history-only note (a wordless turn that docked a chart) — nothing for the user to read.
    if (msg.hidden) return null
    // A chart Axl was asked to READ (an agent-rendered still). The live chart the user asked for
    // isn't a message at all — it's docked below the thread.
    if (msg.type === 'chart') return <ChatChart msg={msg} />

    if (msg.role === 'user') {
        return <div className="axl-hub__bubble axl-hub__bubble--user">{msg.content}</div>
    }
    return (
        <div className="axl-hub__bubble axl-hub__bubble--assistant">
            <ChatReasoning text={msg.reasoning} live={msg.streaming && !msg.content} />
            {msg.streaming && !msg.content
                ? <ToolStatusChip label="thinking…" />
                : <ChatMarkdown>{msg.content ?? ''}</ChatMarkdown>
            }
        </div>
    )
}

export function AxlHub({ user, onPick }) {
    const name = firstName(user?.fullname)
    const chat = useChatStream()
    const { messages, isLoading } = chat

    const [summoning, setSummoning]       = useState(null)
    const [draft, setDraft]               = useState('')
    const [pendingRoute, setPendingRoute] = useState(null)   // { desk, symbol } — the reply's hand-off
    const [hoveredDesk, setHoveredDesk]   = useState(null)
    const timerRef  = useRef(null)
    const inputRef  = useRef(null)

    const { messagesRef, messagesEndRef, handleScroll } = useChatScroll(messages)

    useEffect(() => () => clearTimeout(timerRef.current), [])

    // Once Axl's reply has finished streaming, pause briefly so the user can read it, then start
    // the summon animation to the desk it routed them to.
    useEffect(() => {
        if (!pendingRoute || isLoading) return
        const t = setTimeout(() => {
            _summon(pendingRoute.desk, pendingRoute.symbol)
            setPendingRoute(null)
        }, 900)
        return () => clearTimeout(t)
    }, [pendingRoute, isLoading]) // eslint-disable-line react-hooks/exhaustive-deps

    // `symbol` is the name Axl already has from the conversation, riding along with the desk so the
    // first agent opens ON it instead of asking for a ticker the user just gave. A desk the user
    // picked by BUTTON carries none — that click says which desk, not which name.
    function _summon(desk, symbol = null) {
        setSummoning(desk)
        timerRef.current = setTimeout(
            () => onPick(desk.entryTab, { pipeline: desk.key, symbol }),
            SUMMON_MS,
        )
    }

    function handleDeskPick(desk) {
        if (summoning || isLoading) return
        _summon(desk)
    }

    function handleSend() {
        const trimmed = draft.trim()
        if (!trimmed || isLoading) return
        setDraft('')
        _send(trimmed)
    }

    async function _send(text) {
        if (!text || isLoading) return

        const history = toChatHistory(messages)
        const { signal, handlers } = chat.begin(text, {
            onDone: (data) => {
                const reasoning = chat.reasoningRef.current
                chat.finishStreaming({ role: 'assistant', content: data.reply, ...(reasoning ? { reasoning } : {}) })
                // A chart request needs nothing here — the `chart` event already docked it below.
                // A ROUTE means Axl is handing them to a desk: let the reply land, then summon.
                // No route (a clarifying question, a plain answer) simply keeps them here.
                const desk = DESKS.find(d => d.key === data.route)
                if (desk) setPendingRoute({ desk, symbol: data.routeSymbol ?? null })
            },
        })

        try {
            await axlService.streamAxl(
                [...history, { role: 'user', content: text }],
                {
                    model:           readStoredModel('axlModel'),
                    reasoningEffort: readStoredReasoning('axlReasoning'),
                    routingMode:     readStoredRoutingMode('axlRoutingMode'),
                    signal,
                    ...handlers,
                },
            )
        } catch (err) {
            console.error('[axl]', err)
            chat.freezeError('Error communicating with Axl. Please try again.')
        } finally {
            chat.endStream()
        }
    }

    function handleClear() {
        chat.handleStop?.()
        chat.setMessages([])
        setDraft('')
        // One Clear, one clean slate — a chart left docked under an empty hub reads as a leftover.
        closeChart()
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
    }

    const onTranscript = useCallback((text) => { if (text) _send(text) }, []) // eslint-disable-line react-hooks/exhaustive-deps
    const { isRecording, isTranscribing, toggle: toggleMic, cancel: cancelMic } = useMicInput({ onTranscript })

    // The landing (greeting + desk cards) gives way to the thread on the first message.
    const hasThread = messages.length > 0

    if (summoning) {
        const agent = AGENTS[summoning.agentKey]
        return (
            <div className="axl-hub axl-hub--summon" role="status" aria-live="polite">
                <AgentSummon
                    hue={summoning.hue}
                    label={
                        <>
                            Routing to the{' '}
                            <span className="axl-summon__brand">
                                <BrandTitle text={summoning.label} />
                            </span>
                            <span className="axl-summon__dots" aria-hidden="true"><i /><i /><i /></span>
                        </>
                    }
                    sub="Step 1 is ready for you"
                >
                    <AgentGlyph agentKey={summoning.agentKey} icon={agent?.icon} size={54} />
                </AgentSummon>
            </div>
        )
    }

    return (
        <div className="axl-hub">
            {/* ── pipeline header ── */}
            <div className="axl-hub__header">
                {hoveredDesk ? (
                    <span className="axl-hub__pipeline-path" key={hoveredDesk.key}>
                        <span className="axl-hub__pipeline-desk">{hoveredDesk.label}</span>
                        {hoveredDesk.steps.map((step, i) => (
                            <span key={step.label} className="axl-hub__pipeline-step-group">
                                {i > 0 && <span className="axl-hub__pipeline-line" aria-hidden="true" />}
                                <span className="axl-hub__pipeline-step">
                                    <span className="axl-hub__pipeline-text">{step.label}</span>
                                </span>
                            </span>
                        ))}
                    </span>
                ) : (
                    <span className="axl-hub__pipeline-idle">Where would you like to start?</span>
                )}
            </div>

            <div
                className={`axl-hub__body${hasThread ? ' axl-hub__body--active' : ''}`}
                ref={messagesRef}
                onScroll={handleScroll}
            >
                {!hasThread && (
                    /* ── greeting ── */
                    <div className="axl-hub__intro">
                        <svg className="axl-hub__mark" viewBox="0 0 44 44" aria-hidden="true">
                            <defs>
                                <radialGradient id="axlHubAura" cx="50%" cy="44%" r="62%">
                                    <stop offset="0"   style={{ stopColor: 'var(--accent-light)', stopOpacity: 0.20 }} />
                                    <stop offset="0.6" style={{ stopColor: 'var(--accent)',       stopOpacity: 0.10 }} />
                                    <stop offset="1"   style={{ stopColor: 'var(--accent-light)', stopOpacity: 0.13 }} />
                                </radialGradient>
                                <linearGradient id="axlHubRing" gradientUnits="userSpaceOnUse" x1="6" y1="6" x2="38" y2="38">
                                    <stop offset="0"   style={{ stopColor: 'var(--accent-bright)' }} />
                                    <stop offset="0.5" style={{ stopColor: 'var(--accent-light)' }} />
                                    <stop offset="1"   style={{ stopColor: 'var(--accent)' }} />
                                </linearGradient>
                            </defs>
                            <circle className="axl-hub__aura" cx="22" cy="22" r="20" />
                            <circle className="axl-hub__ring" cx="22" cy="22" r="20" />
                            <line className="axl-hub__bot" x1="22" y1="9.3" x2="22" y2="7.3" />
                            <circle className="axl-hub__bot" cx="22" cy="6.1" r="1.1" />
                            <rect className="axl-hub__bot" x="15.5" y="9.5" width="13" height="10" rx="3.6" />
                            <path className="axl-hub__bot" d="M18,14 q1.7,1.4 3.4,0" />
                            <path className="axl-hub__bot" d="M22.6,14 q1.7,1.4 3.4,0" />
                            <path className="axl-hub__bot" d="M16.6,20 C13.9,22.3 13.1,25.8 16,28" />
                            <path className="axl-hub__bot" d="M27.4,20 C30.1,22.3 30.9,25.8 28,28" />
                            <path className="axl-hub__bot" d="M13,30 Q22,26.2 31,30" />
                            <path className="axl-hub__bot" d="M14,30.5 Q22,34.6 30,30.5" />
                            <path className="axl-hub__bot" d="M19.4,31 L24.6,33.4" />
                            <path className="axl-hub__bot" d="M24.6,31 L19.4,33.4" />
                        </svg>
                        <h2 className="axl-hub__greeting">
                            Hi{name ? ` ${name}` : ''}, I&apos;m <span className="axl-hub__wordmark"><b>A</b>xl</span>.
                        </h2>
                    </div>
                )}

                {hasThread ? (
                    /* ── inline desk chips (replace the cards once the conversation starts) ── */
                    <div className="axl-hub__desk-strip">
                        {DESKS.map(desk => (
                            <button
                                key={desk.key}
                                type="button"
                                className={`axl-hub__desk-chip axl-hub__desk-chip--${desk.hue}`}
                                onClick={() => handleDeskPick(desk)}
                                disabled={isLoading}
                                title={desk.label}
                            >
                                <AgentGlyph agentKey={desk.agentKey} icon={AGENTS[desk.agentKey]?.icon} size={13} />
                                <span>{desk.lead}</span>
                            </button>
                        ))}
                    </div>
                ) : (
                    /* ── desk cards (2×2 grid) ── */
                    <div className="axl-hub__options">
                        {DESKS.map((desk, i) => (
                            <button
                                key={desk.key}
                                type="button"
                                className={`axl-hub__option axl-hub__option--${desk.hue}`}
                                style={{ animationDelay: `${0.08 + i * 0.06}s` }}
                                onClick={() => handleDeskPick(desk)}
                                onMouseEnter={() => setHoveredDesk(desk)}
                                onMouseLeave={() => setHoveredDesk(null)}
                                disabled={isLoading}
                            >
                                <span className="axl-hub__option-icon">
                                    <AgentGlyph agentKey={desk.agentKey} icon={AGENTS[desk.agentKey]?.icon} size={32} />
                                </span>
                                <span className="axl-hub__option-lead">{desk.lead}</span>
                            </button>
                        ))}
                    </div>
                )}

                {hasThread && (
                    <div className="axl-hub__thread">
                        {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
                        {isLoading && chat.streamStatus && <ToolStatusChip label={chat.streamStatus} />}
                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            {/* Same dock as every agent chat: above the input, below the thread. */}
            <ChatChartDock />

            <ChatInputRow
                prefix="axl"
                empty={!hasThread}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                textareaRef={inputRef}
                placeholder="Ask Axl anything, or say what you'd like to do…"
                onSend={handleSend}
                sendDisabled={!draft.trim() || isLoading}
                isStreaming={isLoading}
                onStop={chat.handleStop}
                onClear={handleClear}
                clearDisabled={isLoading || (!draft && !hasThread)}
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

AxlHub.propTypes = {
    user:   PropTypes.object,
    onPick: PropTypes.func.isRequired,
}

MessageBubble.propTypes = {
    msg: PropTypes.object.isRequired,
}
