import { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { eventBus, INVALIDATION_EDIT_IDEA, PORTFOLIO_REVIEW, MANUAL_FILLED, ENTRY_CONFIRM_OPEN, ENTRY_CONFIRM_DISMISS, CALL_CONFIRM_OPEN, CALL_EXPIRY_EDIT, OPEN_COVERAGE } from '../../services/event-bus.service'
import { manualService } from '../../services/manual/manual.service.remote'
import { ChatInputRow } from '../ChatInputRow.jsx'
import { useMicInput } from '../../customHooks/useMicInput.js'
import { AGENTS, isBotId, CONVERSATIONAL_BOT_ID } from '../AxlHub/agentMeta.jsx'
import { AgentGlyph } from '../AxlHub/AgentBadges.jsx'
import { readResolution } from './cardResolution.js'

// Compact "from <agent>" attribution chip for notification cards: the agent's
// sigil + brand, tinted by its hue. Makes a card read as coming from Idea / Atlas
// (each specialist owns its own alerts and the card routes back to that agent).
function CardAgentTag({ agent }) {
    return (
        <span className={`social-chat__card-agent social-chat__card-agent--${agent.hue}`}>
            <AgentGlyph agentKey={agent.tab} icon={agent.icon} size={16} />
            <span>{agent.brand}</span>
        </span>
    )
}

// Shared collapsed state for a handled "notify + route" card. Keeps the agent attribution + how it
// resolved (`outcome`) + what it was (`reason`), so a scrolled-back card still reads. `reopen`, when
// set, makes the whole chip a button that re-triggers its original target.
function ResolvedChip({ agent, outcome, asset, reason, qualifier = null, reopen = null }) {
    return (
        <div
            className={'social-chat__msg-bubble social-chat__invalidation-alert social-chat__invalidation-alert--dismissed' + (reopen ? ' social-chat__invalidation-alert--reopen' : '')}
            {...(reopen ? { role: 'button', tabIndex: 0, title: 'Re-open', onClick: reopen,
                onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reopen() } } } : {})}
        >
            {agent && <CardAgentTag agent={agent} />}
            <div className="social-chat__invalidation-alert-header">{outcome} &middot; {asset}{qualifier ? <> &middot; {qualifier}</> : null}</div>
            {reason && (
                <div className="social-chat__invalidation-alert-reason social-chat__invalidation-alert-reason--resolved">{reason}</div>
            )}
        </div>
    )
}

// The ONE shell every notify-and-route card renders through: agent tag + heading + body, then the
// standard TWO-button footer — the primary "do something" + Dismiss. Collapses to the shared
// ResolvedChip once resolved. Strictly two buttons: any finer choice lives in the surface the
// primary opens. `primaryLabel` mirrors msg.actions.primary.label (backend), with a card fallback.
function NotificationCard({ agent, kind = 'fired', heading, asset, qualifier = null, body, primaryLabel, onPrimary, onResolve, onDismiss, msg, resolvedLabels = {}, reopenOnDone = false }) {
    const { resolved, status, outcome } = readResolution(msg)
    if (resolved) {
        const label  = resolvedLabels[outcome] ?? (status === 'done' ? '✓ Done' : 'Dismissed')
        const reopen = (reopenOnDone && status === 'done') ? onPrimary : null
        return <ResolvedChip agent={agent} outcome={label} asset={asset} qualifier={qualifier} reason={body} reopen={reopen} />
    }
    const label   = primaryLabel ?? msg.actions?.primary?.label ?? 'Open'
    const dismiss = onDismiss ?? (() => onResolve?.(msg.id, { status: 'dismissed', outcome: 'dismissed' }))
    return (
        <div className={`social-chat__msg-bubble social-chat__invalidation-alert social-chat__invalidation-alert--${kind}`}>
            <CardAgentTag agent={agent} />
            <div className="social-chat__invalidation-alert-header">{heading}</div>
            {body && <div className="social-chat__invalidation-alert-reason">{body}</div>}
            <div className="social-chat__invalidation-alert-actions">
                <button className="social-chat__invalidation-alert-btn" onClick={onPrimary}>{label}</button>
                <button
                    className="social-chat__invalidation-alert-btn social-chat__invalidation-alert-btn--dismiss"
                    onClick={dismiss}
                >Dismiss</button>
            </div>
        </div>
    )
}

function formatTime(ms) {
    if (!ms) return ''
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function ChatWindow({ conversation, messages, currentUserId, loading, hasMore, onClose, onSend, onLoadMore, onResolveMessage, scrollToMsgId, onScrolledToMsg }) {
    const [draft,   setDraft]   = useState('')
    const [sending, setSending] = useState(false)
    const bottomRef   = useRef(null)
    const textareaRef = useRef(null)
    const msgRefs     = useRef({})

    // Same mic-to-text as the agent chats; transcript is appended to the draft.
    const { isRecording, isTranscribing, toggle: toggleMic, cancel: cancelMic } = useMicInput({
        onTranscript: text => setDraft(d => (d ? `${d} ${text}` : text)),
    })

    // Default: keep the newest message in view. A deep-link scroll (from a notification click)
    // takes precedence — don't yank to the bottom when we're trying to land on a specific card.
    useEffect(() => {
        if (scrollToMsgId) return
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, scrollToMsgId])

    // Land on the clicked notification once it's loaded into the list, then clear the target
    // (a one-shot). block:'center' brings the card into the middle so it's obviously the one.
    useEffect(() => {
        if (!scrollToMsgId) return
        const el = msgRefs.current[scrollToMsgId]
        if (!el) return
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        onScrolledToMsg?.()
    }, [scrollToMsgId, messages, onScrolledToMsg])

    async function handleSend() {
        const text = draft.trim()
        if (!text || sending) return
        setDraft('')
        setSending(true)
        try { await onSend(text) } catch { /* ignore */ } finally { setSending(false) }
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
    }

    if (!conversation) {
        return (
            <div className="social-chat__window social-chat__window--empty">
                <p style={{ margin: 'auto' }}>Select a conversation</p>
            </div>
        )
    }

    // Specialist bot threads (Idea/Atlas/Argus) are notify-only feeds — you reply and edit
    // in that agent's own chat via the card, not here. Only Axl and human DMs are chattable.
    const otherId    = conversation.participants.find(p => p !== currentUserId) ?? ''
    const notifyBot  = isBotId(otherId) && otherId !== CONVERSATIONAL_BOT_ID
    const notifyName = notifyBot ? (AGENTS[otherId]?.brand ?? 'this agent') : null

    return (
        <div className="social-chat__window">
            <div className="social-chat__messages">
                {hasMore && (
                    <button className="social-chat__load-more" onClick={onLoadMore} disabled={loading}>
                        {loading ? 'Loading…' : 'Load earlier'}
                    </button>
                )}

                {messages.map(msg => {
                    const isMine    = msg.senderId === currentUserId
                    const highlight = msg.id === scrollToMsgId
                    return (
                        <div
                            key={msg.id}
                            ref={el => { if (el) msgRefs.current[msg.id] = el }}
                            className={`social-chat__msg ${isMine ? 'social-chat__msg--mine' : 'social-chat__msg--theirs'}${highlight ? ' social-chat__msg--highlight' : ''}`}
                        >
                            {msg.type === 'invalidation_alert' && msg.payload
                                ? <InvalidationAlertBubble msg={msg} onClose={onClose} onResolve={onResolveMessage} />
                                : msg.type === 'portfolio_review' && msg.payload
                                ? <PortfolioReviewBubble msg={msg} onClose={onClose} onResolve={onResolveMessage} />
                                : (msg.type === 'manual_entry' || msg.type === 'manual_exit') && msg.payload
                                ? <ManualFillCard msg={msg} onResolve={onResolveMessage} />
                                : msg.type === 'entry_confirm' && msg.payload
                                ? <EntryConfirmBubble msg={msg} onClose={onClose} onResolve={onResolveMessage} />
                                : msg.type === 'call_expiry' && msg.payload
                                ? <CallExpiryBubble msg={msg} onClose={onClose} onResolve={onResolveMessage} />
                                : msg.type === 'call_manage' && msg.payload
                                ? <CallManageBubble msg={msg} onClose={onClose} onResolve={onResolveMessage} />
                                : msg.type === 'call_reentry' && msg.payload
                                ? <CallReentryBubble msg={msg} onClose={onClose} onResolve={onResolveMessage} />
                                : msg.type === 'coverage_event' && msg.payload
                                ? <CoverageEventBubble msg={msg} onClose={onClose} onResolve={onResolveMessage} />
                                : msg.type === 'coverage_refreshed' && msg.payload
                                ? <CoverageRefreshedBubble msg={msg} onClose={onClose} onResolve={onResolveMessage} />
                                : <div className="social-chat__msg-bubble">{msg.content}</div>
                            }
                            <div className="social-chat__msg-time">{formatTime(msg.createdAt)}</div>
                        </div>
                    )
                })}
                <div ref={bottomRef} />
            </div>

            {notifyBot ? (
                <div className="social-chat__notify-only">
                    Notifications from {notifyName}. Open a card to continue in {notifyName}&apos;s chat.
                </div>
            ) : (
                <ChatInputRow
                    prefix="social-chat"
                    textareaRef={textareaRef}
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message…"
                    onSend={handleSend}
                    sendDisabled={!draft.trim() || sending}
                    onToggleMic={toggleMic}
                    onCancelMic={cancelMic}
                    isRecording={isRecording}
                    isTranscribing={isTranscribing}
                    micDisabled={sending || isTranscribing}
                    textareaDisabled={sending || isRecording}
                />
            )}
        </div>
    )
}

// ── Cards ────────────────────────────────────────────────────────────────────
// Every card is a thin adapter over NotificationCard: it supplies the agent, heading/body, the
// primary "do something" (route + resolve done) and — where dismissing has a side effect — a
// custom dismiss. Strictly two buttons; finer actions (close/delete/edit) live in the surface the
// primary opens (the idea chat, the call pop-out, the Calls tab).

export function InvalidationAlertBubble({ msg, onClose, onResolve }) {
    const { reason, asset, status, inPosition, ideaId } = msg.payload
    const isDrifting = status === 'drifting'
    const kind    = isDrifting ? 'drifting' : 'fired'
    const heading = isDrifting
        ? `Setup drifting · ${asset}`
        : `Invalidation${inPosition ? ' (in position)' : ''} · ${asset}`

    // Primary routes to the idea's own chat, where you re-map or close it. (The old inline "Close"
    // now lives there / in the positions tab — strictly two buttons on the card.)
    function handlePrimary() {
        onResolve?.(msg.id, { status: 'done', outcome: 'editing' })
        eventBus.emit(INVALIDATION_EDIT_IDEA, { ideaId })
        onClose?.()
    }

    return (
        <NotificationCard
            agent={AGENTS.idea} kind={kind} heading={heading} asset={asset} qualifier={kind} body={reason}
            primaryLabel={msg.actions?.primary?.label ?? 'Edit in chat'} onPrimary={handlePrimary}
            onResolve={onResolve} msg={msg}
            resolvedLabels={{ editing: '✓ Opened in chat', closing: '✓ Closing' }}
        />
    )
}

// Open a Kairos call's pop-out detail window — Confirm entry / Accept edit / Delete all live there.
function openCallPopup(callId) {
    window.open(`/call/${callId}`, `call-${callId}`, 'width=1180,height=760')
}

// "Entry triggered — confirm" card. An idea routes to the workspace's OrderConfirmDialog; a Kairos
// call opens its pop-out where Confirm entry lives. Replayable on the collapsed chip.
const ENTRY_CONFIRM_NOTE = { passed_earlier: 'Scheduled time already passed', off_hours: 'Fired while market was closed' }

function EntryConfirmBubble({ msg, onClose, onResolve }) {
    const { kind, ideaId, callId, asset, note } = msg.payload
    const isCall = kind === 'call'
    const agent  = isCall ? AGENTS.kairos : AGENTS.idea

    function route() {
        if (isCall) eventBus.emit(CALL_CONFIRM_OPEN,  { callId })
        else        eventBus.emit(ENTRY_CONFIRM_OPEN, { ideaId })
    }
    function handlePrimary() {
        onResolve?.(msg.id, { status: 'done', outcome: 'confirmed' })
        route()
        onClose?.()
    }
    // Dismissing an idea entry parks it back to 'waiting' (re-armable); a call just collapses.
    function handleDismiss() {
        onResolve?.(msg.id, { status: 'dismissed', outcome: 'dismissed' })
        if (!isCall) eventBus.emit(ENTRY_CONFIRM_DISMISS, { ideaId })
    }

    const heading = (
        <>Confirm entry &middot; {asset}
            {ENTRY_CONFIRM_NOTE[note] && <span className="social-chat__invalidation-alert-tag"> &middot; {ENTRY_CONFIRM_NOTE[note]}</span>}
        </>
    )

    return (
        <NotificationCard
            agent={agent} kind="confirm" heading={heading} asset={asset} body={msg.content}
            primaryLabel={msg.actions?.primary?.label ?? 'Confirm order'} onPrimary={handlePrimary}
            onDismiss={handleDismiss} onResolve={onResolve} msg={msg} reopenOnDone
            resolvedLabels={{ confirmed: '✓ Opened' }}
        />
    )
}

// "Trade thesis expiring / expired" card for a Kairos call. Primary re-maps it in Kairos's in-app
// edit mode (re-arms the monitor on save). Delete now lives in the Calls tab / call pop-out.
export function CallExpiryBubble({ msg, onClose, onResolve }) {
    const { callId, asset, kind, why } = msg.payload
    const heading   = `${kind === 'expired' ? 'Thesis expired' : 'Thesis expiring'} · ${asset}`
    const kindLabel = kind === 'expired' ? 'expired' : 'expiring'   // payload kind is 'edit'|'expired'

    function handlePrimary() {
        onResolve?.(msg.id, { status: 'done', outcome: 'editing' })
        eventBus.emit(CALL_EXPIRY_EDIT, { callId })
        onClose?.()
    }

    return (
        <NotificationCard
            agent={AGENTS.kairos} kind="expiry" heading={heading} asset={asset} qualifier={kindLabel} body={why || msg.content}
            primaryLabel={msg.actions?.primary?.label ?? 'Edit call'} onPrimary={handlePrimary}
            onResolve={onResolve} msg={msg}
            resolvedLabels={{ editing: '✓ Opened in chat', deleted: '✓ Deleted' }}
        />
    )
}

// "Kairos wants to manage the position" card. Primary opens the call pop-out where the user accepts
// (move stop / take partial / exit / let run) or dismisses.
const MANAGE_VERB_COPY = { move_stop: 'move the stop', take_partial: 'take a partial', exit_now: 'exit now', let_run: 'let it run' }
export function CallManageBubble({ msg, onClose, onResolve }) {
    const { callId, asset, verdict, read } = msg.payload
    const verb = MANAGE_VERB_COPY[verdict] ?? verdict

    function handlePrimary() {
        onResolve?.(msg.id, { status: 'done', outcome: 'opened' })
        openCallPopup(callId)
        onClose?.()
    }

    return (
        <NotificationCard
            agent={AGENTS.kairos} kind="manage" heading={`Manage ${asset} · ${verb}`} asset={asset} qualifier={verb} body={read || msg.content}
            primaryLabel={msg.actions?.primary?.label ?? 'Review'} onPrimary={handlePrimary}
            onResolve={onResolve} msg={msg}
            resolvedLabels={{ opened: '✓ Opened' }}
        />
    )
}

// "Stopped out — re-enter?" card for a Kairos call. Primary opens the call pop-out where the user
// picks Re-enter (revive the plan) or Close (leave it terminal).
function CallReentryBubble({ msg, onClose, onResolve }) {
    const { callId, asset, exit_price, why } = msg.payload
    const heading = `Stopped out · ${asset}${Number.isFinite(exit_price) ? ` @ ${exit_price}` : ''} — re-enter?`

    function handlePrimary() {
        onResolve?.(msg.id, { status: 'done', outcome: 'opened' })
        openCallPopup(callId)
        onClose?.()
    }

    return (
        <NotificationCard
            agent={AGENTS.kairos} kind="reentry" heading={heading} asset={asset} body={why || msg.content}
            primaryLabel={msg.actions?.primary?.label ?? 'Review re-entry'} onPrimary={handlePrimary}
            onResolve={onResolve} msg={msg}
            resolvedLabels={{ opened: '✓ Opened' }}
        />
    )
}

// "Coverage update" card for the Analyst — a living thesis hit a material verdict (target hit /
// thesis broken / validating / diverging). Primary opens the Analyst (its coverage book).
const COVERAGE_STATE_COPY = { target_hit: 'target hit', thesis_broken: 'thesis broken', validating: 'validating', diverging: 'diverging' }
export function CoverageEventBubble({ msg, onClose, onResolve }) {
    const { symbol, coverageId, state } = msg.payload
    const stateCopy = COVERAGE_STATE_COPY[state] ?? state
    const heading   = `Coverage · ${symbol}${stateCopy ? ` — ${stateCopy}` : ''}`

    function handlePrimary() {
        onResolve?.(msg.id, { status: 'done', outcome: 'opened' })
        eventBus.emit(OPEN_COVERAGE, { coverageId, symbol })
        onClose?.()
    }

    return (
        <NotificationCard
            agent={AGENTS.analyst} kind="coverage" heading={heading} asset={symbol} qualifier={stateCopy} body={msg.content}
            primaryLabel={msg.actions?.primary?.label ?? 'Open coverage'} onPrimary={handlePrimary}
            onResolve={onResolve} msg={msg}
            resolvedLabels={{ opened: '✓ Opened' }}
        />
    )
}

// "Research refreshed" card for Prometheus — an async coverage refresh (requested by Atlas mid-review)
// has rewritten a held name's thesis. When it came from a portfolio review, the primary RESUMES that
// review (so Atlas re-reads the fresh coverage); otherwise it opens the coverage. `ok:false` = the
// refresh couldn't produce updated coverage (existing thesis left in place); still lets the user resume.
export function CoverageRefreshedBubble({ msg, onClose, onResolve }) {
    const { symbol, coverageId, portfolioId, ok } = msg.payload
    const heading = `Research · ${symbol}${ok === false ? ' — refresh failed' : ' refreshed'}`

    function handlePrimary() {
        if (portfolioId) {
            onResolve?.(msg.id, { status: 'done', outcome: 'resumed' })
            eventBus.emit(PORTFOLIO_REVIEW, { portfolioId, reviewMode: true })
        } else {
            onResolve?.(msg.id, { status: 'done', outcome: 'opened' })
            eventBus.emit(OPEN_COVERAGE, { coverageId, symbol })
        }
        onClose?.()
    }

    return (
        <NotificationCard
            agent={AGENTS.analyst} kind="coverage" heading={heading} asset={symbol} body={msg.content}
            primaryLabel={msg.actions?.primary?.label ?? (portfolioId ? 'Resume review' : 'Open coverage')} onPrimary={handlePrimary}
            onResolve={onResolve} msg={msg}
            resolvedLabels={{ resumed: '✓ Resumed', opened: '✓ Opened' }}
        />
    )
}

function PortfolioReviewBubble({ msg, onClose, onResolve }) {
    const { portfolioId, portfolioName, mode, account, lastReviewAt, nextReviewAt, triggers, outcome: legacyOutcome } = msg.payload
    const { resolved, outcome } = readResolution(msg)
    const fmtDate = (ms) => new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
    const lastReview = lastReviewAt ? fmtDate(lastReviewAt) : 'never'
    const modeLabel = mode ? mode.charAt(0).toUpperCase() + mode.slice(1) : null

    // Primary only ROUTES — the review is marked resolved server-side when the user actually
    // finishes it (resolvePortfolioReviewCard), so we don't collapse the card on the click.
    function handleReview() {
        eventBus.emit(PORTFOLIO_REVIEW, { portfolioId, reviewMode: true })
        onClose?.()
    }

    const outLabel = (outcome === 'updated' || legacyOutcome === 'updated') ? 'Updated'
        : (outcome === 'reviewed' || legacyOutcome === 'reviewed') ? 'Reviewed' : 'Dismissed'

    return (
        <div className={`social-chat__msg-bubble social-chat__portfolio-review${resolved ? ' social-chat__portfolio-review--resolved' : ''}`}>
            <CardAgentTag agent={AGENTS.portfolio} />
            <div className="social-chat__portfolio-review-header">
                Portfolio Review &middot; {portfolioName}
            </div>
            {(modeLabel || account) && (
                <div className="social-chat__portfolio-review-scope">
                    {modeLabel && (
                        <span className={`social-chat__portfolio-review-mode social-chat__portfolio-review-mode--${mode}`}>
                            {modeLabel}
                        </span>
                    )}
                    {account && <span className="social-chat__portfolio-review-account">{account}</span>}
                </div>
            )}
            {resolved ? (
                <>
                    <div className="social-chat__portfolio-review-meta">
                        {outLabel}{nextReviewAt ? ` · next review ${fmtDate(nextReviewAt)}` : ''}
                    </div>
                    <div className="social-chat__portfolio-review-done">✓ Review complete</div>
                </>
            ) : (
                <>
                    <div className="social-chat__portfolio-review-meta">Last reviewed: {lastReview}</div>
                    {Array.isArray(triggers) && triggers.length > 0 && (
                        <div className="social-chat__portfolio-review-triggers">
                            {triggers.slice(0, 4).map((t, i) => (
                                <span
                                    key={i}
                                    className={`social-chat__portfolio-review-trigger social-chat__portfolio-review-trigger--${t.severity ?? 'medium'}`}
                                >{t.label}</span>
                            ))}
                        </div>
                    )}
                    <div className="social-chat__invalidation-alert-actions">
                        <button className="social-chat__invalidation-alert-btn" onClick={handleReview}>
                            Review portfolio
                        </button>
                        <button
                            className="social-chat__invalidation-alert-btn social-chat__invalidation-alert-btn--dismiss"
                            onClick={() => onResolve?.(msg.id, { status: 'dismissed', outcome: 'dismissed' })}
                        >Dismiss</button>
                    </div>
                </>
            )}
        </div>
    )
}

// The unified manual-mode FillCard: broker-less mode can't place/close, so the user reports the
// real fill here. N legs (1 for an idea, N for a portfolio); each leg opens/closes the instant its
// price is submitted (incremental, partial baskets fine). Entry legs also carry an editable
// quantity. On a successful fill it emits MANUAL_FILLED. Follows the same resolve lifecycle: the
// footer button resolves the card 'done' (all legs filled) or 'dismissed'.
function ManualFillCard({ msg, onResolve }) {
    const { kind, reason, portfolioName, legs = [] } = msg.payload
    const isEntry = kind === 'entry'

    const [rows, setRows] = useState(() =>
        Object.fromEntries(legs.map(l => [l.ideaId, {
            price: '', qty: l.quantity != null ? String(l.quantity) : '', status: 'idle', err: null,
        }])))

    function patch(ideaId, fields) {
        setRows(prev => ({ ...prev, [ideaId]: { ...prev[ideaId], ...fields } }))
    }

    async function submit(leg) {
        const row   = rows[leg.ideaId] ?? {}
        const price = Number(row.price)
        if (!(price > 0)) { patch(leg.ideaId, { err: 'Enter a valid price' }); return }
        const qty = isEntry ? Number(row.qty) : undefined
        if (isEntry && !(qty > 0)) { patch(leg.ideaId, { err: 'Enter a valid quantity' }); return }

        patch(leg.ideaId, { status: 'saving', err: null })
        try {
            const idea = isEntry
                ? await manualService.confirmEntry(leg.ideaId, { price, quantity: qty })
                : await manualService.confirmExit(leg.ideaId, { price })
            patch(leg.ideaId, { status: 'done', err: null })
            eventBus.emit(MANUAL_FILLED, { idea })
        } catch (err) {
            patch(leg.ideaId, { status: 'error', err: err?.response?.data?.error || 'Failed — try again' })
        }
    }

    const { resolved, status } = readResolution(msg)
    if (resolved) {
        const label = status === 'done' ? (isEntry ? '✓ Filled' : '✓ Closed') : 'Dismissed'
        return (
            <div className="social-chat__msg-bubble social-chat__manual-card social-chat__manual-card--dismissed">
                <div className="social-chat__manual-card-header">{label} &middot; {isEntry ? 'entry' : 'exit'}</div>
            </div>
        )
    }

    const allDone = legs.every(l => rows[l.ideaId]?.status === 'done')
    const many    = legs.length > 1
    const title   = isEntry
        ? (many ? `Enter ${portfolioName || 'portfolio'} — ${legs.length} legs` : 'Confirm your entry fill')
        : (many ? `Exit ${portfolioName || 'portfolio'} — ${legs.length} legs`  : `Confirm your exit${reason && reason !== 'manual' ? ` · ${reason}` : ''}`)

    return (
        <div className={`social-chat__msg-bubble social-chat__manual-card social-chat__manual-card--${isEntry ? 'entry' : 'exit'}`}>
            <CardAgentTag agent={AGENTS.idea} />
            <div className="social-chat__manual-card-header">{title}</div>
            <div className="social-chat__manual-card-legs">
                {legs.map(leg => {
                    const row  = rows[leg.ideaId] ?? {}
                    const done = row.status === 'done'
                    return (
                        <div key={leg.ideaId} className={`social-chat__manual-leg${done ? ' is-done' : ''}`}>
                            <div className="social-chat__manual-leg-meta">
                                <span className={`social-chat__manual-leg-dir social-chat__manual-leg-dir--${leg.direction}`}>{String(leg.direction).toUpperCase()}</span>
                                <span className="social-chat__manual-leg-asset">{leg.asset}</span>
                                {isEntry && leg.quantity != null && <span className="social-chat__manual-leg-qty">&times; {leg.quantity}</span>}
                            </div>
                            {done ? (
                                <span className="social-chat__manual-leg-done">✓ {isEntry ? 'filled' : 'closed'} @ {row.price}</span>
                            ) : (
                                <div className="social-chat__manual-leg-inputs">
                                    {isEntry && (
                                        <input
                                            className="social-chat__manual-input" type="number" step="any" placeholder="qty"
                                            value={row.qty} onChange={e => patch(leg.ideaId, { qty: e.target.value })}
                                        />
                                    )}
                                    <input
                                        className="social-chat__manual-input" type="number" step="any"
                                        placeholder={isEntry ? 'fill price' : 'exit price'}
                                        value={row.price} onChange={e => patch(leg.ideaId, { price: e.target.value })}
                                    />
                                    <button
                                        className="social-chat__manual-btn" disabled={row.status === 'saving'}
                                        onClick={() => submit(leg)}
                                    >{row.status === 'saving' ? '…' : (isEntry ? 'Fill' : 'Close')}</button>
                                </div>
                            )}
                            {row.err && <div className="social-chat__manual-leg-err">{row.err}</div>}
                        </div>
                    )
                })}
            </div>
            <div className="social-chat__manual-card-actions">
                <button
                    className="social-chat__manual-btn social-chat__manual-btn--dismiss"
                    onClick={() => onResolve?.(msg.id, { status: allDone ? 'done' : 'dismissed', outcome: allDone ? 'filled' : 'dismissed' })}
                >{allDone ? 'Done' : 'Dismiss'}</button>
            </div>
        </div>
    )
}

ChatWindow.propTypes = {
    conversation:     PropTypes.object,
    messages:         PropTypes.array.isRequired,
    currentUserId:    PropTypes.string,
    loading:          PropTypes.bool,
    hasMore:          PropTypes.bool,
    onClose:          PropTypes.func,
    onSend:           PropTypes.func.isRequired,
    onLoadMore:       PropTypes.func.isRequired,
    onResolveMessage: PropTypes.func,
    scrollToMsgId:    PropTypes.string,
    onScrolledToMsg:  PropTypes.func,
}
