import { useState, useRef, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { scannerService } from '../../services/scanner/scanner.service.remote.js'
import { threadsService, newThreadId } from '../../services/threads/threads.service.remote.js'
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
import '../PortfolioPanel/PortfolioPanel.scss'
import './ScannerPanel.scss'

const SCAN_PHASE_LABELS = { 1: 'Thesis', 2: 'Discovery', 3: 'Filtering', 4: 'Ranked List' }

// Starter prompts — onboarding scaffolding only; the agent understands any
// timeframe the user types, these are just one-tap entry points (the "when").
const SUGGESTIONS = ['Stocks for today?', 'Anything for the coming week?']

// Famous scan angles (the "what") — thesis picks for Phase 1. `label` is what the
// user sees; `phrase` is the noun phrase we compose into the message so the agent
// slots it in as the scan's angle. Multi-select: several can be combined into one
// scan (e.g. false breaks + cyclic windows). The user can always type any other thesis.
const ANGLES = [
    { label: 'Momentum',           phrase: 'momentum setups' },
    { label: 'Breakouts',          phrase: 'breakout setups' },
    { label: 'False breaks',       phrase: 'false breakouts / failed breakdowns' },
    { label: 'Cyclic windows',     phrase: 'recurring-interval price cycles (repeating peak-to-trough timing)' },
    { label: 'Calendar patterns',  phrase: 'seasonal / calendar patterns (time-of-year tendencies)' },
    { label: 'Top movers',         phrase: 'today\'s top movers' },
    { label: 'Squeeze plays',      phrase: 'short-squeeze candidates' },
    { label: 'Sector rotation',    phrase: 'sector-rotation plays' },
    { label: 'Oversold bounce',    phrase: 'oversold bounce setups' },
]

// Compose the natural-language message from the selected angle labels. One angle →
// a plain "Scan for X"; several → the intersection thesis ("names that fit both /
// all of these") so the agent looks for names satisfying every selected setup.
function buildAnglePrompt(labels) {
    const phrases = ANGLES.filter(a => labels.includes(a.label)).map(a => a.phrase)
    if (phrases.length === 0) return ''
    if (phrases.length === 1) return `Scan for ${phrases[0]}`
    const tail = phrases.length === 2 ? 'names that fit both angles' : 'names that fit all of these angles'
    return `Scan for ${phrases.join(' + ')} — ${tail}`
}

// Multi-select setup chips + a "Scan these" send button, shown as a footer strip
// while the agent is still in the thesis phase. Tapping a chip toggles it; the
// button composes the selected angles into one scan.
function AngleChips({ selected, onToggle, onScan, disabled }) {
    return (
        <>
            <div className="scanner-panel__angles">
                {ANGLES.map(a => {
                    const on = selected.has(a.label)
                    return (
                        <button
                            key={a.label}
                            className={`scanner-panel__angle${on ? ' scanner-panel__angle--on' : ''}`}
                            onClick={() => onToggle(a.label)}
                            disabled={disabled}
                            aria-pressed={on}
                        >
                            {a.label}
                        </button>
                    )
                })}
            </div>
            {selected.size > 0 && (
                <button className="scanner-panel__angles-go" onClick={onScan} disabled={disabled}>
                    Scan {selected.size === 1 ? 'this' : 'these'} ({selected.size}) →
                </button>
            )}
        </>
    )
}

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
        return <ChatPhaseHeading phase={msg.phase} label={SCAN_PHASE_LABELS[msg.phase]} total={4} />
    }
    if (msg.role === 'user') {
        return <div className="portfolio-panel__bubble portfolio-panel__bubble--user">{msg.content}</div>
    }

    const reasoning = <ChatReasoning text={msg.reasoning} live={msg.streaming && !msg.content} />

    if (!msg.content && msg.streaming) {
        return (
            <div className="portfolio-panel__bubble portfolio-panel__bubble--assistant">
                {reasoning}
                <span className="portfolio-panel__thinking">scanning…</span>
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
                    {msg.tickers.map(sym => <TickerChip key={sym} symbol={sym} onSelect={onTickerSelect} />)}
                </div>
            )}
        </div>
    )
}

export function ScannerPanel({ onTickerSelect, onGenerateList, onUpdateList, onLoadingChange, chatRestore = null, resumeRef = null }) {
    const chat = useChatStream()
    const { messages, setMessages } = chat

    // Report streaming state up so the agent-bar "live" dot can pulse for Argus.
    useEffect(() => { onLoadingChange?.(chat.isLoading) }, [chat.isLoading])   // eslint-disable-line react-hooks/exhaustive-deps

    const [inputText,      setInputText]      = useState('')
    const [pendingScan,    setPendingScan]    = useState(null)
    const [editingScanId,  setEditingScanId]  = useState(null)
    const [editDirty,      setEditDirty]      = useState(false)
    const [selectedAngles, setSelectedAngles] = useState(() => new Set())
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
        setSelectedAngles(new Set())
        // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when a new restore is pushed (keyed by .key)
    }, [chatRestore?.key])

    const pendingTickersRef = useRef([])
    const textareaRef       = useRef(null)
    const threadIdRef       = useRef(newThreadId())   // scan construction draft thread

    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable closure
    const onTranscript = useCallback((text) => { if (text) _send(text) }, [])
    const { isRecording, isTranscribing, toggle: toggleMic, cancel: cancelMic } = useMicInput({ onTranscript })

    async function _send(text) {
        if (!text || chat.isLoading) return
        setEditDirty(true)
        // NOTE: the chip selection is intentionally NOT cleared here — it persists as
        // "marked" so that after a scan the user can see their prior pick and refine it.
        // It's reset only on Clear or when a saved list is restored.

        const history = messages
            .filter(m => !m.streaming && m.role !== 'phase')
            .map(m => ({ role: m.role, content: m.content }))
        history.push({ role: 'user', content: text })

        pendingTickersRef.current = []

        const { signal, handlers } = chat.begin(text, {
            onTicker: (symbol) => {
                if (!pendingTickersRef.current.includes(symbol)) pendingTickersRef.current.push(symbol)
            },
            onDone: (data) => {
                const tickers = [...pendingTickersRef.current]
                pendingTickersRef.current = []
                chat.finishStreaming({ role: 'assistant', content: data.reply, tickers })
                if (data.scan?.candidates?.length) setPendingScan(data.scan)
                // Construction only: persist the scan-building conversation as a draft thread.
                // The backend enforces the substantive floor (scanner = past nucleus) + TTL.
                if (!editingScanId) {
                    threadsService.saveDraft({
                        threadId: threadIdRef.current, agent: 'scanner',
                        messages: [...history, { role: 'assistant', content: data.reply }],
                        phase: data.phase ?? null, subjectType: 'scan',
                        state: data.scan ? { scan: data.scan } : null,
                    })
                }
            },
        })

        try {
            await scannerService.sendStream(history, {
                model:           readStoredModel('scannerModel'),
                reasoningEffort: readStoredReasoning('scannerReasoning'),
                routingMode:     readStoredRoutingMode('scannerRoutingMode'),
                currentPhase:    chat.phase,
                // When editing, tell the agent the list's current contents so it can
                // add / remove / change names against it.
                editList:        editingScanId ? (pendingScan || null) : null,
                signal,
                ...handlers,
            })
        } catch (err) {
            console.error('[scanner]', err)
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

    // Resume a stopped reply in place: send the conversation ending with the partial
    // assistant turn as a prefill so the model continues the SAME bubble.
    async function _continue() {
        if (chat.isLoading) return
        const last = messages[messages.length - 1]
        if (!last || last.role !== 'assistant' || !last.stopped) return
        const base = chat.resumeBase()   // '' = stopped before any token → regenerate
        setEditDirty(true)

        // Continuing: history ends with the partial as an assistant prefill. Regenerating (empty
        // base): it ends at the user turn. finalizeResumeHistory decides which.
        const history = chat.finalizeResumeHistory(
            messages
                .filter(m => !m.streaming && m.role !== 'phase')
                .map(m => ({ role: m.role, content: m.content })),
            base,
        )

        pendingTickersRef.current = []
        const cont = chat.beginContinue({
            onTicker: (symbol) => {
                if (!pendingTickersRef.current.includes(symbol)) pendingTickersRef.current.push(symbol)
            },
            onError: () => chat.restoreStopped(base),   // keep the partial + Continue on failure
            onDone: (data) => {
                const tickers = [...pendingTickersRef.current]
                pendingTickersRef.current = []
                const content = base + data.reply
                chat.finishStreaming({ role: 'assistant', content, tickers })
                if (data.scan?.candidates?.length) setPendingScan(data.scan)
                if (!editingScanId) {
                    threadsService.saveDraft({
                        threadId: threadIdRef.current, agent: 'scanner',
                        messages: [...history.slice(0, -1), { role: 'assistant', content }],
                        phase: data.phase ?? null, subjectType: 'scan',
                        state: data.scan ? { scan: data.scan } : null,
                    })
                }
            },
        })
        if (!cont) return   // nothing continuable

        try {
            await scannerService.sendStream(history, {
                model:           readStoredModel('scannerModel'),
                reasoningEffort: readStoredReasoning('scannerReasoning'),
                routingMode:     readStoredRoutingMode('scannerRoutingMode'),
                currentPhase:    chat.phase,
                editList:        editingScanId ? (pendingScan || null) : null,
                signal:          cont.signal,
                ...cont.handlers,
            })
        } catch (err) {
            console.error('[scanner]', err)
            chat.restoreStopped(base)
        } finally {
            chat.endStream()
        }
    }

    // Multi-select setup chips: tapping toggles a label; "Scan these" composes the
    // selected angles into one message and sends it, then clears the selection.
    function toggleAngle(label) {
        setSelectedAngles(prev => {
            const next = new Set(prev)
            next.has(label) ? next.delete(label) : next.add(label)
            return next
        })
    }
    function scanSelectedAngles() {
        const prompt = buildAnglePrompt([...selectedAngles])
        if (prompt) _send(prompt)   // _send clears the selection
    }

    function handleClear() {
        chat.reset()
        setPendingScan(null)
        setEditingScanId(null)
        setInputText('')
        setEditDirty(false)
        setSelectedAngles(new Set())
        threadIdRef.current = newThreadId()   // fresh construction thread; abandoned draft TTL-expires
    }

    // Resume an unfinished scan-building draft: restore its conversation (+ last list)
    // and keep writing to the SAME thread.
    async function handleResumeThread(threadId) {
        const t = await threadsService.getThread(threadId)
        if (!t) return
        setMessages(t.messages ?? [])
        setPendingScan(t.state?.scan ?? null)
        setEditingScanId(null)
        setInputText('')
        setEditDirty(false)
        threadIdRef.current = t.threadId
    }
    // Expose resume to the shared agent-bar hamburger (MainPage).
    if (resumeRef) resumeRef.current = handleResumeThread

    async function handleGenerate() {
        if (!pendingScan) return
        // Persist the conversation alongside the list so reopening it returns here.
        const chatLog = messages
            .filter(m => !m.streaming)
            .map(m => ({ role: m.role, content: m.content, ...(m.tickers?.length ? { tickers: m.tickers } : {}) }))

        if (editingScanId) {
            // Update the existing list in place; stay in edit mode for more refining.
            await onUpdateList?.(editingScanId, { ...pendingScan, chat: chatLog })
        } else {
            await onGenerateList?.({ ...pendingScan, chat: chatLog }, threadIdRef.current)
            setPendingScan(null)
            threadIdRef.current = newThreadId()   // next scan build gets a fresh draft thread
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
    // In edit mode there's ALWAYS an enabled escape (leave without saving), shown at the end of
    // every turn and after a Stop — next to "Update list" instead of only before the first edit.
    const laterBtn = editingScanId ? (
        <button className="portfolio-panel__review-btn portfolio-panel__review-btn--later" onClick={handleClear}>
            I&apos;ll do it later
        </button>
    ) : null
    // A stopped reply with real text can be resumed in place.
    // Argus has FINISHED at least one Phase-1 turn (not merely started+stopped). Gates
    // the setup chips so they don't pop up when the user stops before Argus has asked
    // anything — but still show (with prior picks marked) once a real turn has landed.
    const hasCompletedArgusTurn = messages.some(m => m.role === 'assistant' && !m.streaming && !m.stopped && !!(m.content && m.content.trim()))
    const showAngleStrip = !chat.isLoading && !editingScanId && chat.phase === 1 && !listReady && hasCompletedArgusTurn
    const actionWatch = `${chat.streamStatus}|${listReady}|${!!editingScanId}`
    const { messagesRef, messagesEndRef, handleScroll } = useChatScroll(messages, {
        onFinishStreaming: () => textareaRef.current?.focus(),
        watch: actionWatch,
    })

    return (
        <div className="portfolio-panel scanner-panel">
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
                    editingScanId ? (
                        <div className="portfolio-panel__empty">
                            Editing your list — ask me to add, remove, or change names, then hit Update list.
                        </div>
                    ) : (
                        <AgentIntro agent={AGENTS.scanner}>
                            <div className="scanner-panel__suggestions">
                                {SUGGESTIONS.map(s => (
                                    <button key={s} className="scanner-panel__suggestion" onClick={() => _send(s)} disabled={chat.isLoading}>
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </AgentIntro>
                    )
                )}
                {messages.map((msg, i) => <MessageBubble key={i} msg={msg} onTickerSelect={onTickerSelect} />)}
                {chat.isLoading && <ToolStatusChip label={chat.streamStatus} />}

                {(chat.isLoading || messages.some(m => m.role === 'assistant' && m.content)) && (
                    <AgentTurnTag agent={AGENTS.scanner} active={chat.isLoading} />
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Thesis-phase angle strip — once the user has started but the agent is
                still nailing down the thesis (Phase 1), keep the famous setups one tap
                away. Hidden as soon as discovery begins or a list is forming. */}
            {showAngleStrip && (
                <div className="scanner-panel__angles-bar">
                    <span className="scanner-panel__angles-hint scanner-panel__angles-hint--inline">scan by setup:</span>
                    <AngleChips selected={selectedAngles} onToggle={toggleAngle} onScan={scanSelectedAngles} disabled={chat.isLoading} />
                </div>
            )}

            {/* Action bar — a footer below the scroll area (not inside it) so it stays
                pinned above the input without ever covering the messages. */}
            {!chat.isLoading && (!!editingScanId || listReady) && (
                <div className="portfolio-panel__action-bubble">
                    {/* "Update/Generate list" only once there's a ready list; the "I'll do it later"
                        escape is always present in edit mode. */}
                    {!showChangedMind && listReady && (
                        <button className="portfolio-panel__review-btn portfolio-panel__review-btn--update" onClick={handleGenerate}>
                            {editingScanId ? 'Update list' : 'Generate list'}
                        </button>
                    )}
                    {laterBtn}
                </div>
            )}

            <ChatInputRow
                prefix="portfolio-panel"
                textareaRef={textareaRef}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What should I scan for? (Enter to send, Shift+Enter for newline)"
                onSend={handleSend}
                sendDisabled={!inputText.trim() || chat.isLoading}
                isStreaming={chat.isLoading}
                onStop={chat.handleStop}
                canResume={chat.canResume}
                onResume={_continue}
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

ScannerPanel.propTypes = {
    onTickerSelect:  PropTypes.func.isRequired,
    onGenerateList:  PropTypes.func,
    onUpdateList:    PropTypes.func,
    onLoadingChange: PropTypes.func,
    chatRestore:     PropTypes.object,
}
