import { useState, useRef, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { BrandTitle } from '../BrandTitle.jsx'
import { AgentSummon, AgentTurnTag } from './AgentSummon.jsx'
import { AgentGlyph } from './AgentBadges.jsx'
import { AGENTS, AGENT_LIST, SUMMON_MS } from './agentMeta.jsx'
import { axlService } from '../../services/axl/axl.service.remote'
import { ChatInputRow } from '../ChatInputRow.jsx'
import { ThreadHistory } from '../ThreadHistory/ThreadHistory.jsx'
import { threadsService, newThreadId } from '../../services/threads/threads.service.remote.js'
import { ChatMarkdown } from '../ChatMarkdown.jsx'
import { ChatReasoning } from '../ChatReasoning.jsx'
import { ToolStatusChip } from '../ToolStatusChip/ToolStatusChip.jsx'
import { useMicInput } from '../../customHooks/useMicInput.js'
import { useChatStream } from '../../customHooks/useChatStream.js'
import { useChatScroll } from '../../customHooks/useChatScroll.js'
import { readStoredModel }       from '../modelOptions'
import { readStoredReasoning }   from '../reasoningOptions'
import { readStoredRoutingMode } from '../routingModeOptions'
import '../PortfolioPanel/PortfolioPanel.scss'   // reuse the shared chat bubble styling
import './AxlHub.scss'

// ── axl · the calm hub ─────────────────────────────────────────────────────────
// The default chat home: axl (the meditating bot) greets the trader, offers the
// three specialist agents as clickable cards (picking one plays a short "summoning"
// beat before its chat opens), AND chats directly — Axl answers app-guide /
// concierge questions itself via /api/axl/stream. The chat reuses the SAME stack as
// the specialist panels (useChatStream + bubbles + reasoning + tool-status chip +
// the AgentTurnTag sigil below turns), so it looks and behaves identically.

function firstName(fullname = '') {
    const n = String(fullname).trim().split(/\s+/)[0]
    return n || ''
}

// Same bubble shape the specialist panels render — user bubble, or an assistant
// bubble carrying (streamed) reasoning + a "thinking…" placeholder + markdown body.
function MessageBubble({ msg }) {
    if (msg.role === 'user') {
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
            <div className="portfolio-panel__bubble-text"><ChatMarkdown>{msg.content}</ChatMarkdown></div>
        </div>
    )
}

MessageBubble.propTypes = { msg: PropTypes.object.isRequired }

export function AxlHub({ user, onPick }) {
    const name = firstName(user?.fullname)
    const [summoning, setSummoning] = useState(null)
    const timerRef = useRef(null)

    const chat = useChatStream()
    const { messages, setMessages } = chat
    const [draft, setDraft]  = useState('')
    const textareaRef = useRef(null)
    const threadIdRef = useRef(newThreadId())   // this chat's draft thread

    const chatting = messages.length > 0 || chat.isLoading

    useEffect(() => () => clearTimeout(timerRef.current), [])

    const { messagesRef, messagesEndRef, handleScroll } = useChatScroll(messages, {
        onFinishStreaming: () => textareaRef.current?.focus(),
        watch: chat.streamStatus,
    })

    function handlePick(opt) {
        if (summoning) return
        setSummoning(opt)
        timerRef.current = setTimeout(() => onPick(opt.tab), SUMMON_MS)
    }

    async function _send(text) {
        const t = String(text || '').trim()
        if (!t || chat.isLoading) return

        const history = messages
            .filter(m => !m.streaming && m.role !== 'phase')
            .map(m => ({ role: m.role, content: m.content }))
        history.push({ role: 'user', content: t })

        const { signal, handlers } = chat.begin(t, {
            onDone: (data) => {
                chat.finishStreaming({ role: 'assistant', content: data.reply })
                // Only persist SUBSTANTIAL exchanges to the chats drawer — a real
                // back-and-forth (2+ user turns) or a meaty single answer — so one-off
                // greetings / trivial lookups don't clutter it. Once it qualifies the
                // whole conversation is upserted (same threadId), earlier turns included.
                const userTurns  = history.filter(m => m.role === 'user').length
                const substantial = userTurns >= 2 || (data.reply || '').length >= 500
                if (substantial) {
                    threadsService.saveDraft({
                        threadId:    threadIdRef.current,
                        agent:       'axl',
                        messages:    [...history, { role: 'assistant', content: data.reply }],
                        subjectType: 'axl',
                    })
                }
            },
        })

        try {
            await axlService.streamAxl(history, {
                // Axl obeys the one shared AI-mode (mirrored to the 'idea' keys).
                model:           readStoredModel('ideaModel'),
                reasoningEffort: readStoredReasoning('ideaReasoning'),
                routingMode:     readStoredRoutingMode('ideaRoutingMode'),
                signal,
                ...handlers,
            })
        } catch (err) {
            console.error('[axl]', err)
            chat.freezeError()
        } finally {
            chat.endStream()
        }
    }

    function handleSend() {
        const text = draft
        setDraft('')
        _send(text)
    }

    function handleNewChat() {
        chat.handleStop()
        chat.reset()
        setDraft('')
        threadIdRef.current = newThreadId()   // next chat is a fresh thread
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
    }

    // Resume a saved Axl chat from the conversations drawer (reuses the shared
    // ThreadHistory) and keep appending to that same thread.
    async function handleResumeThread(threadId) {
        const t = await threadsService.getThread(threadId)
        if (!t) return
        setMessages(t.messages ?? [])
        threadIdRef.current = t.threadId   // keep writing to the same thread
    }

    // Voice input — the same mic/transcribe the specialist chats use.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable closure (mirrors the panels)
    const onTranscript = useCallback((text) => { if (text) _send(text) }, [])
    const { isRecording, isTranscribing, toggle: toggleMic, cancel: cancelMic } = useMicInput({ onTranscript })

    if (summoning) {
        return (
            <div className="axl-hub axl-hub--summon" role="status" aria-live="polite">
                <AgentSummon
                    hue={summoning.hue}
                    label={
                        <>
                            Summoning <span className="axl-summon__brand"><BrandTitle text={summoning.brand} /></span>
                            <span className="axl-summon__dots" aria-hidden="true"><i /><i /><i /></span>
                        </>
                    }
                    sub={`${summoning.brand} will be right with you`}
                >
                    <AgentGlyph agentKey={summoning.tab} icon={summoning.icon} size={54} />
                </AgentSummon>
            </div>
        )
    }

    return (
        <div className={`axl-hub${chatting ? ' axl-hub--chatting' : ''}`}>
            {/* Same strip as the agents — routing nav (Idea/Atlas/Argus) + the
                conversations-drafts drawer + a live dot. Lets the user jump to a
                specialist from here even once the big summon cards are gone. */}
            <div className="chat-agentbar chat-agentbar--axl">
                <nav className="chat-agentbar__agents">
                    {AGENT_LIST.map(opt => (
                        <button
                            key={opt.tab}
                            type="button"
                            className="chat-agentbar__agent"
                            onClick={() => handlePick(opt)}
                            title={`Open ${opt.brand}`}
                        >
                            <AgentGlyph agentKey={opt.tab} icon={opt.icon} size={20} />
                            {opt.brand}
                        </button>
                    ))}
                </nav>
                <ThreadHistory agent="axl" onResume={handleResumeThread} />
                <span className="chat-agentbar__right">
                    <span className="chat-agentbar__live">
                        <span className={`chat-agentbar__dot ${chat.isLoading ? 'loading' : 'idle'}`} />
                        live
                    </span>
                </span>
            </div>

            {chatting ? (
                <div className="portfolio-panel__messages" ref={messagesRef} onScroll={handleScroll}>
                    {messages.map((m, i) => <MessageBubble key={i} msg={m} />)}
                    {chat.isLoading && <ToolStatusChip label={chat.streamStatus} />}
                    {(chat.isLoading || messages.some(m => m.role === 'assistant' && m.content)) && (
                        <AgentTurnTag agent={AGENTS.axl} active={chat.isLoading} />
                    )}
                    <div ref={messagesEndRef} />
                </div>
            ) : (
                <div className="axl-hub__body">
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
                            {/* antenna */}
                            <line className="axl-hub__bot" x1="22" y1="9.3" x2="22" y2="7.3" />
                            <circle className="axl-hub__bot" cx="22" cy="6.1" r="1.1" />
                            {/* head */}
                            <rect className="axl-hub__bot" x="15.5" y="9.5" width="13" height="10" rx="3.6" />
                            {/* closed, content eyes (meditating) */}
                            <path className="axl-hub__bot" d="M18,14 q1.7,1.4 3.4,0" />
                            <path className="axl-hub__bot" d="M22.6,14 q1.7,1.4 3.4,0" />
                            {/* arms resting */}
                            <path className="axl-hub__bot" d="M16.6,20 C13.9,22.3 13.1,25.8 16,28" />
                            <path className="axl-hub__bot" d="M27.4,20 C30.1,22.3 30.9,25.8 28,28" />
                            {/* crossed legs / lotus base */}
                            <path className="axl-hub__bot" d="M13,30 Q22,26.2 31,30" />
                            <path className="axl-hub__bot" d="M14,30.5 Q22,34.6 30,30.5" />
                            <path className="axl-hub__bot" d="M19.4,31 L24.6,33.4" />
                            <path className="axl-hub__bot" d="M24.6,31 L19.4,33.4" />
                        </svg>

                        <h2 className="axl-hub__greeting">
                            Hi{name ? ` ${name}` : ''}, I&apos;m <span className="axl-hub__wordmark"><b>A</b>xl</span>.
                        </h2>
                        <p className="axl-hub__prompt">What would you like to build today?</p>
                    </div>

                    <div className="axl-hub__options">
                        {AGENT_LIST.map(opt => (
                            <button
                                key={opt.tab}
                                type="button"
                                className={`axl-hub__option axl-hub__option--${opt.hue}`}
                                onClick={() => handlePick(opt)}
                            >
                                <span className="axl-hub__option-icon">
                                    <AgentGlyph agentKey={opt.tab} icon={opt.icon} size={46} />
                                </span>
                                <span className="axl-hub__option-body">
                                    <span className="axl-hub__option-lead">{opt.lead}</span>
                                    <span className="axl-hub__option-blurb">{opt.blurb}</span>
                                </span>
                                <span className="axl-hub__option-with">
                                    with <span className="axl-hub__option-brand"><BrandTitle text={opt.brand} /></span>
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <ChatInputRow
                prefix="axl-hub"
                textareaRef={textareaRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Axl about the app, your account, or where to start…"
                onSend={handleSend}
                sendDisabled={!draft.trim() || chat.isLoading}
                isStreaming={chat.isLoading}
                onStop={chat.handleStop}
                onClear={handleNewChat}
                clearDisabled={chat.isLoading || !messages.length}
                clearTitle="New chat"
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

AxlHub.propTypes = {
    user:   PropTypes.object,
    onPick: PropTypes.func.isRequired,
}
