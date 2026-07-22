import { useState, useRef, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { kairosService, CALLS_CHANGED } from '../../services/kairos/kairos.service.remote.js'
import { threadsService, newThreadId } from '../../services/threads/threads.service.remote.js'
import { ChatMarkdown } from '../ChatMarkdown.jsx'
import { readStoredModel } from '../modelOptions.js'
import { readStoredReasoning } from '../reasoningOptions.js'
import { readStoredRoutingMode } from '../routingModeOptions.js'
import { KAIROS_MODES, DEFAULT_KAIROS_MODE, readStoredKairosMode } from '../kairosModeOptions.js'
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
import { ConvictionChip } from '../ConvictionChip/ConvictionChip.jsx'
import '../PortfolioPanel/PortfolioPanel.scss'
import './KairosPanel.scss'

const SUGGESTIONS = ['Looking for an intraday trade?', "Let's day trade!", "Let's go for a swing!"]

const KAIROS_PHASE_LABELS = { 1: 'Classify', 2: 'Regime', 3: 'Fundamentals', 4: 'Technicals', 5: 'Zones', 6: 'Risk', 7: 'Validate & size' }

function MessageBubble({ msg }) {
    if (msg.role === 'phase') {
        return <ChatPhaseHeading phase={msg.phase} label={KAIROS_PHASE_LABELS[msg.phase]} total={7} />
    }
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

// Draft/detail preview of a call — zones / reference levels / patterns. Reused by the call popup,
// where `showHead={false}` skips the asset/type/bias line + thesis (the popup renders its own).
export function CallDraft({ call, showHead = true }) {
    const zones = call.entry_zones ?? []
    const refs  = call.reference_levels ?? []
    const pats  = call.patterns ?? []
    // Only show the assess row when it has real content: a bucketed conviction level and/or a
    // positive R:R. Guards a mid-stream draft that may carry rr:0/null or an out-of-enum level.
    const showConv = ['low', 'medium', 'high'].includes(call.conviction?.level)
    const showRr   = Number.isFinite(call.rr) && call.rr > 0
    return (
        <div className="kairos-panel__draft">
            {showHead && (
                <div className="kairos-panel__draft-head">
                    <HermesBadge size={22} />
                    <span className="kairos-panel__asset">{call.asset}</span>
                    {call.trade_type && <span className="kairos-panel__type">{call.trade_type}</span>}
                    {call.bias && <span className={`kairos-panel__dir kairos-panel__dir--${call.bias}`}>{call.bias}</span>}
                    {call.sizing?.max_size != null && <span className="kairos-panel__size">max {call.sizing.max_size}</span>}
                </div>
            )}
            {showHead && call.thesis && <div className="kairos-panel__thesis">{call.thesis}</div>}
            {(showConv || showRr) && (
                <div className="kairos-panel__assess">
                    {showConv && <ConvictionChip conviction={call.conviction} />}
                    {showRr && (
                        <span className={`kairos-panel__chip kairos-panel__chip--rr${call.rr < 1.5 ? ' is-thin' : ''}`}>
                            {call.rr.toFixed(1)}R
                        </span>
                    )}
                </div>
            )}
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

export function KairosPanel({ onLoadingChange, onGenerated, onPendingCall, onOpenArgus, scanResult = null, chatRestore = null, editingCallId = null, onEditDone, availableAccounts = [], selectedAccounts = [], mainAccountId = null, resumeRef = null }) {
    // threadPhases: Kairos runs all 5 phases in ONE reply, so thread each phase's content under its
    // own heading (other agents emit one phase per turn and don't need it).
    const chat = useChatStream({ threadPhases: true })
    const { messages } = chat

    useEffect(() => { onLoadingChange?.(chat.isLoading) }, [chat.isLoading])   // eslint-disable-line react-hooks/exhaustive-deps

    const [inputText,   setInputText]   = useState('')
    const [pendingCall, setPendingCall] = useState(null)
    const [perf,        setPerf]        = useState(null)
    // Analysis mode (the build lens) — the user's explicit per-call choice. Sent as chatState.mode;
    // relit from a saved call.mode on edit. (No default is imposed server-side; the chip IS the choice.)
    const [mode,        setMode]        = useState(() => readStoredKairosMode('kairosMode'))
    const pickMode = (id) => { setMode(id); try { localStorage.setItem('kairosMode', id) } catch { /* private mode */ } }
    // Discovery hand-off: a "find me a ticker" turn returns a scan_request (bias + horizon) instead
    // of a call — we surface an "Open Argus" chip that routes to the scanner with those constraints.
    const [scanRequest, setScanRequest] = useState(null)
    // Editing an existing call: until the user actually changes something via chat, the primary
    // button offers a clean "I'll do it later" exit (mirrors the idea edit's "changed my mind").
    const [editDirty,   setEditDirty]   = useState(false)
    const textareaRef = useRef(null)
    const threadIdRef = useRef(newThreadId())   // call construction draft thread
    const seedRef     = useRef(null)            // one-shot Argus candidate seed for the next send (K3)
    const buildWindowRef = useRef(null)         // forward-dated list window {from,to} → gates the call at generate (persists across the build, unlike the one-shot seed)

    const isEditing = !!editingCallId

    // Report the live draft up so the Axl Lists Calls tab can show a "building" row
    // (mirrors deriveBuildingIdea) while the call fills in step by step.
    useEffect(() => { onPendingCall?.(pendingCall) }, [pendingCall])   // eslint-disable-line react-hooks/exhaustive-deps

    // Edit pencil (Calls tab) pushed a keyed restore: seed the chat history + draft so editing a
    // saved call reopens its build conversation (mirrors the idea edit / portfolio chatRestore).
    useEffect(() => {
        if (!chatRestore) return
        chat.setMessages(chatRestore.messages ?? [])
        chat.setPhase(null)
        setPendingCall(chatRestore.call ?? null)
        setMode(chatRestore.call?.mode ?? DEFAULT_KAIROS_MODE)   // relight the chip in the call's build lens
        setInputText('')
        setEditDirty(false)
    }, [chatRestore?.key])   // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { setEditDirty(false) }, [editingCallId])

    // Build conversation to persist as chat_state (role+content only — enough to re-render the
    // history on the next edit; phase headings + streaming placeholders excluded).
    function persistedMessages() {
        return messages
            .filter(m => !m.streaming && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
            .map(m => ({ role: m.role, content: m.content }))
    }

    const ideaAccounts = availableAccounts.filter(a => selectedAccounts.includes(a.id))

    // Track record shown in the intro (refreshes when any call changes). The live watch-list lives
    // in the Axl Lists Calls tab — the panel no longer duplicates it as an in-chat status chip.
    const refreshPerf = useCallback(async () => { setPerf(await kairosService.getPerformance()) }, [])
    useEffect(() => {
        refreshPerf()
        window.addEventListener(CALLS_CHANGED, refreshPerf)
        return () => window.removeEventListener(CALLS_CHANGED, refreshPerf)
    }, [refreshPerf])

    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable closure
    const onTranscript = useCallback((text) => { if (text) _send(text) }, [])
    const { isRecording, isTranscribing, toggle: toggleMic, cancel: cancelMic } = useMicInput({ onTranscript })

    async function _send(text) {
        if (!text || chat.isLoading) return
        setEditDirty(true)
        setScanRequest(null)   // a new user turn supersedes any pending "Open Argus" offer
        const seed = seedRef.current; seedRef.current = null   // one-shot: only this turn carries the Argus seed
        const history = messages.filter(m => !m.streaming && m.role !== 'phase').map(m => ({ role: m.role, content: m.content }))
        history.push({ role: 'user', content: text })

        const { signal, handlers } = chat.begin(text, {
            onDone: (data) => {
                // Keep-accumulated finish (no content passed): the streamed phase bubbles already hold
                // the reply threaded per phase — swapping in the whole data.reply would collapse them
                // back into one bubble. (Persistence below still stores the full reply for the model.)
                chat.finishStreaming({ role: 'assistant' })
                const nextCall = data.call ?? pendingCall
                if (data.call) setPendingCall(data.call)
                if (data.scan_request) setScanRequest(data.scan_request)   // offer the Argus hand-off
                // Progressively save the build conversation while editing so a reload/leave keeps it
                // (history built here is authoritative — reading `messages` right after lags a turn).
                if (editingCallId) {
                    const msgs = [...history, { role: 'assistant', content: data.reply }]
                    kairosService.updateCall(editingCallId, { chatState: { messages: msgs, draft: nextCall } })
                        .catch(err => console.error('[kairos] chat_state save', err))
                } else {
                    // Construction only: persist the call-building conversation as a draft thread
                    // (mirrors Scanner). The backend enforces the substantive floor (phase ≥ 2) + TTL.
                    threadsService.saveDraft({
                        threadId: threadIdRef.current, agent: 'kairos',
                        messages: [...history, { role: 'assistant', content: data.reply }],
                        phase: data.phase ?? null, subjectType: 'call',
                        state: nextCall ? { draft: nextCall } : null,
                    })
                }
            },
        })

        try {
            await kairosService.sendStream(history, {
                model:           readStoredModel('kairosModel'),
                reasoningEffort: readStoredReasoning('kairosReasoning'),
                routingMode:     readStoredRoutingMode('kairosRoutingMode'),
                currentPhase:    chat.phase,
                accounts:        ideaAccounts,
                // Feed the draft-so-far back so the model carries settled fields forward
                // (its own <call> block is stripped from the visible history). `mode` = the build lens.
                chatState:       { active_asset: pendingCall?.asset || '', draft: pendingCall, mode },
                seed,            // K3: structured Argus candidate (one-shot on the hand-off turn)
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

    // Resume a stopped reply in place: send the conversation ending with the partial assistant
    // turn as a prefill so the model continues the SAME bubble (mirrors the other chats' Continue).
    async function _continue() {
        if (chat.isLoading) return
        const last = messages[messages.length - 1]
        if (!last || last.role !== 'assistant' || !last.stopped) return
        const base = chat.resumeBase()   // '' = stopped before any token → regenerate
        setEditDirty(true)

        const history = chat.finalizeResumeHistory(
            messages
                .filter(m => !m.streaming && m.role !== 'phase')
                .map(m => ({ role: m.role, content: m.content })),
            base,
        )

        const cont = chat.beginContinue({
            onError: () => chat.restoreStopped(base),   // keep the partial + Continue on failure
            onDone: (data) => {
                const content = base + data.reply
                chat.finishStreaming({ role: 'assistant', content })
                const nextCall = data.call ?? pendingCall
                if (data.call) setPendingCall(data.call)
                if (data.scan_request) setScanRequest(data.scan_request)
                if (editingCallId) {
                    const msgs = [...history.slice(0, -1), { role: 'assistant', content }]
                    kairosService.updateCall(editingCallId, { chatState: { messages: msgs, draft: nextCall } })
                        .catch(err => console.error('[kairos] chat_state save', err))
                } else {
                    threadsService.saveDraft({
                        threadId: threadIdRef.current, agent: 'kairos',
                        messages: [...history.slice(0, -1), { role: 'assistant', content }],
                        phase: data.phase ?? null, subjectType: 'call',
                        state: nextCall ? { draft: nextCall } : null,
                    })
                }
            },
        })
        if (!cont) return   // nothing continuable

        try {
            await kairosService.sendStream(history, {
                model:           readStoredModel('kairosModel'),
                reasoningEffort: readStoredReasoning('kairosReasoning'),
                routingMode:     readStoredRoutingMode('kairosRoutingMode'),
                currentPhase:    chat.phase,
                accounts:        ideaAccounts,
                chatState:       { active_asset: pendingCall?.asset || '', draft: pendingCall, mode },
                signal:          cont.signal,
                ...cont.handlers,
            })
        } catch (err) {
            console.error('[kairos]', err)
            chat.restoreStopped(base)
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
        setScanRequest(null)
        setInputText('')
        setEditDirty(false)
        threadIdRef.current = newThreadId()   // fresh construction thread; abandoned draft TTL-expires
    }

    // Return leg of the Argus hand-off: the user picked a candidate → we're handed the ticker (+ its
    // scan read). Kairos still holds the bias + horizon in this (never-unmounted) conversation, so we
    // just drop the ticker in as a new turn and let it resume into Phase 2. Keyed so it fires once.
    useEffect(() => {
        if (!scanResult?.ticker) return
        // K3: pass the candidate as a STRUCTURED seed (not free text) + pre-fill the lens chip from
        // Argus's recommendation (the user can still override before/after).
        if (scanResult.recommended_mode) pickMode(scanResult.recommended_mode)
        // A forward-dated list carries a window → remember it for the whole build (the seed is one-shot,
        // so the model loses it after turn 1; the code gates the call from this ref at generate).
        buildWindowRef.current = scanResult.window ?? null
        seedRef.current = {
            ticker:    scanResult.ticker,
            direction: scanResult.direction ?? null,
            thesis:    scanResult.thesis ?? null,
            analysis:  scanResult.analysis ?? null,
            window:    scanResult.window ?? null,   // narrated in the ARGUS SEED block (server sets the actual gate)
        }
        _send(`Let's build the ${scanResult.ticker} call.`)
    }, [scanResult?.key])   // eslint-disable-line react-hooks/exhaustive-deps

    // Resume an unfinished call-building draft: restore its conversation (+ last draft) and keep
    // writing to the SAME thread. Generated calls use the edit/update flow (handleEditCall) instead.
    async function handleResumeThread(threadId) {
        const t = await threadsService.getThread(threadId)
        if (!t) return
        chat.setMessages(t.messages ?? [])
        chat.setPhase(null)
        setPendingCall(t.state?.draft ?? null)
        setInputText('')
        setEditDirty(false)
        threadIdRef.current = t.threadId
    }
    // Expose resume to the shared agent-bar hamburger (MainPage).
    if (resumeRef) resumeRef.current = handleResumeThread

    async function handleGenerate() {
        if (!pendingCall || ideaAccounts.length === 0) return
        try {
            // Forward-dated build: hand the remembered window to the server, which gates the call to it
            // (active_from/valid_until) unless the model already set explicit bounds. Transient — not stored.
            const payload = buildWindowRef.current ? { ...pendingCall, build_window: buildWindowRef.current } : pendingCall
            const saved = await kairosService.generateCall(payload, ideaAccounts, mainAccountId, { messages: persistedMessages(), draft: pendingCall })
            // Link the construction draft thread to the created call (clears its TTL so the
            // conversation lives with the call). saved = the persisted call doc (has .id).
            if (saved?.id) {
                threadsService.linkThread(threadIdRef.current, { subjectType: 'call', subjectId: saved.id, artifactName: pendingCall.asset ?? null })
            }
            threadIdRef.current = newThreadId()   // next build gets a fresh draft thread
            buildWindowRef.current = null          // window consumed
            setPendingCall(null)
            await refreshPerf()
            onGenerated?.()   // call generated — return to the axl hub
        } catch (err) {
            console.error('[kairos] generate', err)
        }
    }

    // "Update call" — persist the edited plan on the existing call in place (re-arms the monitor).
    async function handleUpdate() {
        if (!editingCallId || !pendingCall || ideaAccounts.length === 0) return
        try {
            await kairosService.updateCall(editingCallId, {
                call:          pendingCall,
                accounts:      ideaAccounts,
                mainAccountId,
                chatState:     { messages: persistedMessages(), draft: pendingCall },
            })
            handleClear()
            onEditDone?.()   // call updated — clear edit state + return to the axl hub
        } catch (err) {
            console.error('[kairos] update', err)
        }
    }

    // Leave an edit session without changing anything (mirrors the idea "I'll do it later").
    function handleCancelEdit() {
        handleClear()
        onEditDone?.()
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
    }

    // Preview shows as soon as the agent has settled a ticker; readiness (Generate) needs the
    // full construction gate — a trade type, ≥1 real entry zone, and a max size.
    const hasPreview  = !!pendingCall?.asset
    const callReady   = hasPreview && !!pendingCall.trade_type && (pendingCall.entry_zones?.length > 0) && (pendingCall.sizing?.max_size > 0)
    const canGenerate = callReady && ideaAccounts.length > 0
    // Editing but nothing changed yet → offer a clean exit instead of "Update call".
    const showChangedMind = isEditing && !editDirty
    // In edit mode there's ALWAYS an enabled escape (leave without saving), shown at the end of
    // every turn and after a Stop — next to "Update call" instead of only before the first edit.
    const laterBtn = isEditing ? (
        <button className="portfolio-panel__review-btn portfolio-panel__review-btn--later kairos-panel__generate-btn" onClick={handleCancelEdit}>
            I&apos;ll do it later
        </button>
    ) : null

    // Stopped mid-reply → the input's Stop turns into a Play to resume that bubble (like other chats).

    const { messagesRef, messagesEndRef, handleScroll } = useChatScroll(messages, {
        onFinishStreaming: () => textareaRef.current?.focus(),
        watch: `${chat.streamStatus}|${hasPreview}`,
    })

    return (
        <div className="portfolio-panel kairos-panel">
            {hasPreview && (
                <div className="portfolio-panel__build-summary">
                    <div className="portfolio-panel__build-summary-header">
                        <span className="portfolio-panel__build-summary-title">your call —</span>
                        <span className="portfolio-panel__build-summary-name">{pendingCall.asset}</span>
                        {pendingCall.mode && <span className="kairos-panel__mode-tag">{pendingCall.mode}</span>}
                        {!callReady && <span className="portfolio-panel__build-summary-badge">building…</span>}
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
                    </AgentIntro>
                )}
                {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
                {chat.isLoading && <ToolStatusChip label={chat.streamStatus} />}
                {(chat.isLoading || messages.some(m => m.role === 'assistant' && m.content)) && (
                    <AgentTurnTag agent={AGENTS.kairos} active={chat.isLoading} />
                )}
                <div ref={messagesEndRef} />
            </div>

            {!chat.isLoading && scanRequest && (
                <div className="portfolio-panel__action-bubble">
                    <button
                        className="portfolio-panel__review-btn portfolio-panel__review-btn--update kairos-panel__generate-btn"
                        onClick={() => { onOpenArgus?.(scanRequest); setScanRequest(null) }}
                    >
                        {scanRequest.ticker ? `Validate ${scanRequest.ticker} in Argus` : 'Open Argus'}
                    </button>
                </div>
            )}

            {/* Fit signal: the build lens found no clean read → offer a one-tap rebuild in the fitter lens. */}
            {!chat.isLoading && pendingCall?.lens_fit?.fit === 'weak' && pendingCall.lens_fit.suggested_mode && (
                <div className="portfolio-panel__action-bubble">
                    <button
                        className="portfolio-panel__review-btn kairos-panel__generate-btn kairos-panel__fit-switch"
                        onClick={() => { const sm = pendingCall.lens_fit.suggested_mode; pickMode(sm); _send(`Rebuild this as a ${sm} setup.`) }}
                    >
                        Weak {pendingCall.mode} fit — rebuild as {pendingCall.lens_fit.suggested_mode}?
                    </button>
                </div>
            )}

            {!chat.isLoading && (isEditing || callReady) && (
                <div className="portfolio-panel__action-bubble">
                    {/* No "Update call" until the user has actually changed something
                        (showChangedMind) — but the "I'll do it later" escape is always there. */}
                    {!showChangedMind && (
                        <button className="portfolio-panel__review-btn portfolio-panel__review-btn--update kairos-panel__generate-btn" onClick={isEditing ? handleUpdate : handleGenerate} disabled={!canGenerate}>
                            {ideaAccounts.length === 0 ? 'Mark an account to generate' : isEditing ? 'Update call' : 'Generate call'}
                        </button>
                    )}
                    {laterBtn}
                </div>
            )}

            <div className="kairos-panel__modes" role="group" aria-label="Analysis mode">
                <span className="kairos-panel__modes-label">lens</span>
                {KAIROS_MODES.map(m => (
                    <button
                        key={m.id}
                        type="button"
                        className={`kairos-panel__mode-chip${mode === m.id ? ' is-active' : ''}`}
                        title={m.title}
                        onClick={() => pickMode(m.id)}
                        disabled={chat.isLoading}
                    >
                        {m.short}
                    </button>
                ))}
            </div>

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
                canResume={chat.canResume}
                onResume={_continue}
                onClear={handleClear}
                clearDisabled={chat.isLoading || isEditing || !messages.length}
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
    onPendingCall:    PropTypes.func,
    onOpenArgus:      PropTypes.func,
    scanResult:       PropTypes.object,
    chatRestore:      PropTypes.object,
    editingCallId:    PropTypes.string,
    onEditDone:       PropTypes.func,
    availableAccounts: PropTypes.array,
    selectedAccounts:  PropTypes.array,
    mainAccountId:     PropTypes.string,
    resumeRef:         PropTypes.object,
}
