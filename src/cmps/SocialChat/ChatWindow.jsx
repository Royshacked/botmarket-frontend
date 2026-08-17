import { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
// The call pop-out (Confirm entry / Accept edit / Delete live there) — one opener, shared
// with the Calls list, so the window name and size can't drift between the two entry points.
import { openCallPopup, openSetupPopup } from '../TradeIdeas/tradeIdea.utils.js'
import { manageVerb } from '../TradeIdeas/setupManage.js'
import { eventBus, INVALIDATION_EDIT_IDEA, PORTFOLIO_REVIEW, MANUAL_FILLED, ENTRY_CONFIRM_OPEN, ENTRY_CONFIRM_DISMISS, CALL_CONFIRM_OPEN, SETUP_CONFIRM_OPEN, CALL_EXPIRY_EDIT, SETUP_INVALIDATION_EDIT, OPEN_COVERAGE, OPEN_SECTOR_VIEW, TILT_REVIEW_OPEN, MARKET_BRIEF_OPEN, OPEN_QUEUED_LIST } from '../../services/event-bus.service'
import { manualService } from '../../services/manual/manual.service.remote'
import { ChatInputRow } from '../ChatInputRow.jsx'
import { useMicInput } from '../../customHooks/useMicInput.js'
import { AGENTS, isBotId, CONVERSATIONAL_BOT_ID } from '../AxlHub/agentMeta.jsx'
import { AgentGlyph } from '../AxlHub/AgentBadges.jsx'
import { readResolution } from './cardResolution.js'
import { formatTime } from './messageStamp.js'

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
//
// `actionless` renders the same card WITHOUT the footer — the frontend half of the backend's rule
// that `actions` is what makes a message actionable (chat.service cardLifecycle: no actions → no
// `status`, so there is no lifecycle to drive). Some monitor cards are deliberately statements
// rather than requests — Talos's `ran_away` / `invalidated_fyi` / `let_run` all say "this happened,
// nothing is being asked of you" — and a Dismiss on those would invent a decision the card isn't
// making. Opt-in per card rather than derived from `msg.actions` here, so older history posted
// before a producer set actions keeps the buttons it has always rendered.
function NotificationCard({ agent, kind = 'fired', heading, asset, qualifier = null, body, primaryLabel, onPrimary, onResolve, onDismiss, msg, resolvedLabels = {}, reopenOnDone = false, primaryDisabled = false, actionless = false }) {
    const { resolved, status, outcome } = readResolution(msg)
    if (resolved) {
        const label  = resolvedLabels[outcome] ?? (status === 'done' ? '✓ Done' : 'Dismissed')
        const reopen = (reopenOnDone && status === 'done') ? onPrimary : null
        return <ResolvedChip agent={agent} outcome={label} asset={asset} qualifier={qualifier} reason={body} reopen={reopen} />
    }
    const label   = primaryLabel ?? msg.actions?.primary?.label ?? 'Open'
    const dismiss = onDismiss ?? (() => onResolve?.(msg.id, { status: 'dismissed', outcome: 'dismissed' }))

    // WHO CLOSES THIS CARD — read off the card, decided nowhere else.
    //
    // Cards that ASK FOR WORK ('work', the backend default) are not closed by being opened. Opening
    // one records that it was opened and leaves it PENDING: ignoring it, or opening it and getting
    // distracted, must leave the ask standing. It closes on Dismiss, or when the user's write to the
    // entity lands (chat.service resolveCardsFor, hooked into the one entity patch route).
    //
    // Cards that OFFER A READ ('open' — the brief, the sector board) are completed by opening.
    //
    // This used to be nine copies of `onResolve(done)` inside nine handlePrimary functions, each
    // firing on navigation. Cards silently died the moment they were looked at. The shell owns it
    // now; a bubble supplies only the side effect (navigate / emit) and never the lifecycle.
    // Legacy history has no `resolvesOn`, so absent means 'work' — the safe reading.
    const resolvesOnOpen = msg.actions?.primary?.resolvesOn === 'open'
    // Touched but not finished. Past the `resolved` early-return above, so this can only be a card
    // still pending — worth showing, or a card the user opened yesterday looks identical to one
    // they have never seen.
    const opened = msg.resolveOutcome === 'opened'
    function handlePrimaryClick() {
        onResolve?.(msg.id, resolvesOnOpen
            ? { status: 'done',    outcome: 'opened' }
            : { status: 'pending', outcome: 'opened' })
        onPrimary?.()
    }
    return (
        <div className={`social-chat__msg-bubble social-chat__invalidation-alert social-chat__invalidation-alert--${kind}${opened ? ' social-chat__invalidation-alert--opened' : ''}`}>
            <CardAgentTag agent={agent} />
            <div className="social-chat__invalidation-alert-header">{heading}</div>
            {body && <div className="social-chat__invalidation-alert-reason">{body}</div>}
            {opened && <div className="social-chat__invalidation-alert-opened">Opened — still waiting on you</div>}
            {!actionless && (
                <div className="social-chat__invalidation-alert-actions">
                    <button className="social-chat__invalidation-alert-btn" onClick={handlePrimaryClick} disabled={primaryDisabled}>{label}</button>
                    <button
                        className="social-chat__invalidation-alert-btn social-chat__invalidation-alert-btn--dismiss"
                        onClick={dismiss}
                    >Dismiss</button>
                </div>
            )}
        </div>
    )
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

    // Specialist bot threads (Atlas/Argus/Kairos…) are notify-only feeds — you reply and edit
    // in that agent's own chat via the card, not here. Only Axl and human DMs are chattable.
    // Notify-only shows NO composer and no explanatory line: the cards already route, and a
    // standing footer under every feed was noise on every message the user read.
    const otherId   = conversation.participants.find(p => p !== currentUserId) ?? ''
    const notifyBot = isBotId(otherId) && otherId !== CONVERSATIONAL_BOT_ID

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
                                : msg.type === 'queue_ready' && msg.payload
                                ? <QueueReadyBubble msg={msg} onClose={onClose} onResolve={onResolveMessage} />
                                // RETIRED 2026-08-07 — nothing posts orders_ready any more (the
                                // market-open sweep sends one queue_ready instead). Kept so the
                                // batch cards already in a user's history still render.
                                : msg.type === 'orders_ready' && msg.payload
                                ? <OrdersReadyBubble msg={msg} onClose={onClose} onResolve={onResolveMessage} />
                                : msg.type === 'call_expiry' && msg.payload
                                ? <CallExpiryBubble msg={msg} onClose={onClose} onResolve={onResolveMessage} />
                                : msg.type === 'call_manage' && msg.payload
                                ? <CallManageBubble msg={msg} onClose={onClose} onResolve={onResolveMessage} />
                                : msg.type === 'setup_invalidation' && msg.payload
                                ? <SetupInvalidationBubble msg={msg} onClose={onClose} onResolve={onResolveMessage} />
                                : msg.type === 'setup_manage' && msg.payload
                                ? <SetupManageBubble msg={msg} onClose={onClose} onResolve={onResolveMessage} />
                                : msg.type === 'call_reentry' && msg.payload
                                ? <CallReentryBubble msg={msg} onClose={onClose} onResolve={onResolveMessage} />
                                : msg.type === 'coverage_event' && msg.payload
                                ? <CoverageEventBubble msg={msg} onClose={onClose} onResolve={onResolveMessage} />
                                : msg.type === 'tilt_event' && msg.payload
                                ? <TiltEventBubble msg={msg} onClose={onClose} onResolve={onResolveMessage} />
                                : msg.type === 'tilt_review' && msg.payload
                                ? <TiltReviewBubble msg={msg} onClose={onClose} onResolve={onResolveMessage} />
                                : msg.type === 'coverage_refreshed' && msg.payload
                                ? <CoverageRefreshedBubble msg={msg} onClose={onClose} onResolve={onResolveMessage} />
                                : msg.type === 'market_brief_offer'
                                ? <MarketBriefOfferBubble msg={msg} onClose={onClose} onResolve={onResolveMessage} />
                                : <div className="social-chat__msg-bubble">{msg.content}</div>
                            }
                            <div className="social-chat__msg-time">{formatTime(msg.createdAt)}</div>
                        </div>
                    )
                })}
                <div ref={bottomRef} />
            </div>

            {notifyBot ? null : (
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

// "Entry triggered — confirm" card. An idea routes to the workspace's OrderConfirmDialog; a Kairos
// call opens its pop-out where Confirm entry lives. Replayable on the collapsed chip.
const ENTRY_CONFIRM_NOTE = { passed_earlier: 'Scheduled time already passed', off_hours: 'Fired while market was closed' }

function EntryConfirmBubble({ msg, onClose, onResolve }) {
    const { kind, ideaId, callId, setupId, asset, note, warning, scenario } = msg.payload
    const isCall  = kind === 'call'
    const isSetup = kind === 'setup'
    // Tag = the desk that sent it. A holding's confirm is Atlas's; a lone legacy idea keeps the
    // Idea mark (its desk is archived, but that IS who authored the plan).
    const agent   = isCall ? AGENTS.kairos : isSetup ? AGENTS.mentor
        : kind === 'portfolio_item' ? AGENTS.portfolio : AGENTS.idea

    function route() {
        if (isCall)       eventBus.emit(CALL_CONFIRM_OPEN,  { callId })
        else if (isSetup) eventBus.emit(SETUP_CONFIRM_OPEN, { setupId })
        else              eventBus.emit(ENTRY_CONFIRM_OPEN, { ideaId })
    }
    function handlePrimary() {
        onResolve?.(msg.id, { status: 'done', outcome: 'confirmed' })
        route()
        onClose?.()
    }
    // Dismissing an idea entry parks it back to 'waiting' (re-armable); a call or setup collapses.
    function handleDismiss() {
        onResolve?.(msg.id, { status: 'dismissed', outcome: 'dismissed' })
        if (!isCall && !isSetup) eventBus.emit(ENTRY_CONFIRM_DISMISS, { ideaId })
    }

    // A setup's card fires on ANY Talos verdict — advisory, never a veto — so when the verdict was
    // not "enter" the objection has to be visible BEFORE the button, not after. It rides in the
    // heading rather than the body, which is the agent's own copy.
    // `scenario` names WHICH way in fired (only sent when the setup holds rivals): the order about
    // to be confirmed belongs to one premise, at that premise's size and stop.
    const heading = (
        <>Confirm entry &middot; {asset}
            {scenario && <span className="social-chat__invalidation-alert-tag"> &middot; {scenario}</span>}
            {ENTRY_CONFIRM_NOTE[note] && <span className="social-chat__invalidation-alert-tag"> &middot; {ENTRY_CONFIRM_NOTE[note]}</span>}
            {warning && <span className="social-chat__invalidation-alert-tag"> &middot; {warning}</span>}
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

// "The market opened and several parked orders are ready" — the batch card the market-open sweep
// posts when more than one order comes off the bench at once (a portfolio activated overnight is
// the usual case). One card instead of nine, because the OrderConfirmDialog already walks pending
// orders one at a time: this only has to open the queue on the right workspace, and the dialog
// takes it from there.
//
// It routes with the FIRST order's id and reuses the existing per-kind events rather than adding a
// batch-specific one — the dialog's own selection logic decides what to show, so a card that named
// a specific order could only ever disagree with it.
function OrdersReadyBubble({ msg, onClose, onResolve }) {
    const { kind, count, firstId, staleHours } = msg.payload
    const isSetup = kind === 'setup'
    // Same rule as the single-order card: the batch belongs to the desk that authored it.
    const agent   = isSetup ? AGENTS.mentor
        : kind === 'portfolio_item' ? AGENTS.portfolio : AGENTS.idea

    function handlePrimary() {
        onResolve?.(msg.id, { status: 'done', outcome: 'confirmed' })
        if (isSetup) eventBus.emit(SETUP_CONFIRM_OPEN, { setupId: firstId })
        else         eventBus.emit(ENTRY_CONFIRM_OPEN, { ideaId: firstId })
        onClose?.()
    }
    // No ENTRY_CONFIRM_DISMISS here: that parks ONE idea back to 'waiting', and firing it for a
    // batch would silently disarm the other orders the user never looked at. Dismissing the card
    // dismisses the card — the orders stay confirmable in the workspace.
    function handleDismiss() {
        onResolve?.(msg.id, { status: 'dismissed', outcome: 'dismissed' })
    }

    const heading = (
        <>Orders ready &middot; {count} waiting
            {staleHours >= 12 && (
                <span className="social-chat__invalidation-alert-tag"> &middot; priced {staleHours}h ago</span>
            )}
        </>
    )

    return (
        <NotificationCard
            agent={agent} kind="confirm" heading={heading} body={msg.content}
            // The collapsed chip has no single asset to name, so it names the batch instead.
            asset={`${count} order${count === 1 ? '' : 's'}`}
            primaryLabel={msg.actions?.primary?.label ?? 'Review orders'} onPrimary={handlePrimary}
            onDismiss={handleDismiss} onResolve={onResolve} msg={msg} reopenOnDone
            resolvedLabels={{ confirmed: '✓ Opened' }}
        />
    )
}

/**
 * THE market-open nudge — one card for the whole open, from Axl, pointing at the queued list.
 *
 * It replaces the per-desk batch above (kept only to render history). That one fanned out a card
 * per desk per kind, so a single 09:30 produced a notification from Atlas and another from Mentor,
 * each answering "what does this desk have for you" — a question nobody asks. At the open the
 * question is "what is waiting on ME", and it has one answer.
 *
 * ROUTES, DOES NOT RESOLVE. Opening the list is not doing the work: the items are still sitting
 * there afterwards. So the primary only routes and the card stays live — it collapses when you
 * dismiss it, the same rule the portfolio-review card already follows.
 */
export function QueueReadyBubble({ msg, onClose, onResolve }) {
    const { count = 0, staleHours } = msg.payload ?? {}
    const { resolved } = readResolution(msg)

    function handlePrimary() {
        eventBus.emit(OPEN_QUEUED_LIST, {})
        onClose?.()
    }

    if (resolved) {
        return (
            <ResolvedChip
                agent={AGENTS.axl} outcome="✓ Dismissed"
                asset={`${count} item${count === 1 ? '' : 's'}`} reason={msg.content}
            />
        )
    }

    return (
        <div className="social-chat__msg-bubble social-chat__invalidation-alert">
            <CardAgentTag agent={AGENTS.axl} />
            <div className="social-chat__invalidation-alert-header">
                Market open &middot; {count} waiting
                {staleHours >= 12 && (
                    <span className="social-chat__invalidation-alert-tag"> &middot; oldest {staleHours}h</span>
                )}
            </div>
            <div className="social-chat__invalidation-alert-reason">{msg.content}</div>
            <div className="social-chat__invalidation-alert-actions">
                <button className="social-chat__invalidation-alert-btn" onClick={handlePrimary}>
                    {msg.actions?.primary?.label ?? 'Open the list'}
                </button>
                <button
                    className="social-chat__invalidation-alert-btn social-chat__invalidation-alert-btn--dismiss"
                    onClick={() => onResolve?.(msg.id, { status: 'dismissed', outcome: 'dismissed' })}
                >Dismiss</button>
            </div>
        </div>
    )
}

// "Trade thesis expiring / expired" card for a Kairos call. Primary re-maps it in Kairos's in-app
// edit mode (re-arms the monitor on save). Delete now lives in the Calls tab / call pop-out.
export function CallExpiryBubble({ msg, onClose, onResolve }) {
    const { callId, asset, kind, why } = msg.payload
    const heading   = `${kind === 'expired' ? 'Thesis expired' : 'Thesis expiring'} · ${asset}`
    const kindLabel = kind === 'expired' ? 'expired' : 'expiring'   // payload kind is 'edit'|'expired'

    function handlePrimary() {
        // `kind` rides along because it is the CARD's axis, not the call's status (see buildCallExpiry
        // — a stale thesis leaves the call at 'looking' either way). The desk opens on a different
        // question for a thesis that HAS expired than for one that is expiring, and nothing on the
        // document can tell them apart. The reason itself is not passed: that is read off the call
        // when the doorway resolves it, so it is the reason that stands now.
        eventBus.emit(CALL_EXPIRY_EDIT, { callId, kind })
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

// "Your setup's plan is no longer worth what it was" — Talos's invalidation card, Mentor's twin of
// CallExpiryBubble. FOUR events arrive on this one type and they are not the same card:
//
//   invalidated  the premise broke and the user asked to be given the chance to re-draw → primary
//                reopens the setup in the Mentor chat that built it (SETUP_INVALIDATION_EDIT).
//   stale_map    Talos's own read — the levels have drifted from where structure sits now. Same
//                route; the ask is the same re-draw.
//   ran_away / invalidated_fyi  statements, not requests (price left on the favourable side; or the
//                user chose notify_only). The backend sends them with NO actions, so they render
//                actionless — no button to press and nothing to resolve.
//
// `scenario` names WHICH way in died: a setup can hold rivals, and one premise breaking is not the
// setup breaking. It rides the qualifier so the collapsed chip still says which one it was.
const SETUP_INVALIDATION_COPY = {
    ran_away:        { head: 'Missed',        kind: 'missed'   },
    invalidated:     { head: 'Invalidated',   kind: 'fired'    },
    invalidated_fyi: { head: 'Invalidated',   kind: 'fired'    },
    stale_map:       { head: 'Levels drifted', kind: 'drifting' },
}
export function SetupInvalidationBubble({ msg, onClose, onResolve }) {
    const { setupId, asset, event, scenario, remaining } = msg.payload
    const copy      = SETUP_INVALIDATION_COPY[event] ?? { head: 'Needs a look', kind: 'fired' }
    const actionless = !msg.actions
    // What still stands matters as much as what died — carried on the collapsed chip too, so a
    // scrolled-back card doesn't read as "the trade is dead" when another way in is still armed.
    const survivors = remaining > 0 ? `${remaining} still armed` : null
    const qualifier = scenario ?? survivors
    // Both ride the HEADING as well, the same way EntryConfirmBubble names which premise fired: the
    // qualifier alone only surfaces once the card has collapsed, and which way in died is the first
    // thing to read, not the last.
    const heading = (
        <>{copy.head} &middot; {asset}
            {scenario  && <span className="social-chat__invalidation-alert-tag"> &middot; {scenario}</span>}
            {survivors && <span className="social-chat__invalidation-alert-tag"> &middot; {survivors}</span>}
        </>
    )

    function handlePrimary() {
        eventBus.emit(SETUP_INVALIDATION_EDIT, { setupId })
        onClose?.()
    }

    return (
        <NotificationCard
            agent={AGENTS.mentor} kind={copy.kind} heading={heading} asset={asset}
            qualifier={qualifier} body={msg.content} actionless={actionless}
            primaryLabel={msg.actions?.primary?.label ?? 'Re-draw it'} onPrimary={handlePrimary}
            onResolve={onResolve} msg={msg}
            resolvedLabels={{ editing: '✓ Opened in chat' }}
        />
    )
}

// "Talos wants to change something about a live setup position" — Mentor's twin of CallManageBubble.
// Primary opens the setup pop-out, where the proposal's Accept/Dismiss buttons are (and the position,
// and Talos's journal). `let_run` is a decision NOT to act, posted without actions, so it renders as
// a statement.
//
// `add_leg` is the exception, and routes somewhere else entirely: Talos has already built the order
// plan for the printing leg and parked it awaiting confirmation, so what the user needs is the ORDER
// dialog, not the management card. Same destination as the entry card — and the server refuses
// add_leg as a manage action for the same reason, so a pop-out route here would only lead to a no.
export function SetupManageBubble({ msg, onClose, onResolve }) {
    const { setupId, asset, verdict, read } = msg.payload
    // The verdict vocabulary is shared with the pop-out's management card (setupManage.js) — one
    // table, so the card and the surface it opens can't disagree about what a verdict is called.
    const verb = manageVerb(verdict)

    function handlePrimary() {
        if (verdict === 'add_leg') eventBus.emit(SETUP_CONFIRM_OPEN, { setupId })
        else                       openSetupPopup(setupId)
        onClose?.()
    }

    return (
        <NotificationCard
            agent={AGENTS.mentor} kind="manage" heading={`Manage ${asset} · ${verb}`} asset={asset}
            qualifier={verb} body={read || msg.content} actionless={!msg.actions}
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

// "Sector view changed" card for the strategy desk — Pythia republished and a sector THIS user
// researches moved. Primary opens the calendar's Forecasts tab: the house view is a STATE, so there
// is nothing to revise from the card the way a coverage verdict asks for a re-model.
export function TiltEventBubble({ msg, onClose, onResolve }) {
    const { sectors = [], balanced } = msg.payload ?? {}
    const moved   = sectors.length === 1 ? sectors[0] : `${sectors.length} sectors`
    // An unbalanced table is published rather than lost, so the card admits it — active weights that
    // do not net out are not directly allocatable.
    const heading = `Sector view · ${moved}${balanced === false ? ' — unbalanced' : ''}`

    function handlePrimary() {
        eventBus.emit(OPEN_SECTOR_VIEW, {})
        onClose?.()
    }

    return (
        <NotificationCard
            agent={AGENTS.strategy} kind="tilt" heading={heading} qualifier={sectors.join(', ')} body={msg.content}
            primaryLabel={msg.actions?.primary?.label ?? 'Open sector view'} onPrimary={handlePrimary}
            onResolve={onResolve} msg={msg}
            resolvedLabels={{ opened: '✓ Opened' }}
        />
    )
}

/**
 * "House view due for review" — Pythia's monitor found the standing view past its clock (a stance
 * came due, a macro catalyst landed, or the monthly floor expired) and is ASKING for a re-author.
 *
 * The sibling above (TiltEventBubble) opens the board, because a published view is a state and there
 * is nothing to revise from a card. This one is the opposite case and routes the opposite way: the
 * ask is to re-examine, so it opens Pythia's desk and the review turn runs there — where the user
 * can push back on it — rather than superseding the house view from a click in a chat window.
 *
 * Nothing is requested here, so there is no busy or failure state to hold: a review that fails,
 * fails visibly in Pythia's thread, which is also the one place it can be retried by just asking.
 */
export function TiltReviewBubble({ msg, onClose, onResolve }) {
    const { reason, stances, matured = [] } = msg.payload ?? {}
    // Lead with what the desk owes a verdict on. A matured stance is a CLOSED call — the review has
    // to grade it, not merely restate it — so it earns the heading over the generic "due".
    const heading = matured.length
        ? `Sector view · ${matured.length === 1 ? matured[0] : `${matured.length} stances`} due`
        : 'Sector view · review due'

    function handlePrimary() {
        eventBus.emit(TILT_REVIEW_OPEN, { reason: reason ?? null })
        onClose?.()
    }

    return (
        <NotificationCard
            agent={AGENTS.strategy} kind="tilt" heading={heading}
            qualifier={stances ? `${stances} standing` : null} body={msg.content}
            primaryLabel={msg.actions?.primary?.label ?? 'Run the review'} onPrimary={handlePrimary}
            onResolve={onResolve} msg={msg}
            resolvedLabels={{ opened: '✓ Reviewing' }}
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

    // A verdict card is Prometheus ASKING for a revision — so it opens the thesis in update mode, not
    // a clean desk. `mode` is the ask; MainPage resolves the doc and runs the pencil's pipeline.
    function handlePrimary() {
        eventBus.emit(OPEN_COVERAGE, { coverageId, symbol, mode: 'revise' })
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
/**
 * The daily market-brief offer. Its primary routes, like every other card here: to Axl, who then
 * writes the brief into his own thread.
 *
 * It used to ask for the brief FROM here and have the server post it back as a second social-chat
 * message — which put several hundred words of market prose in a surface built for one-liners, and
 * left the user reading it with nobody to ask about it. Now the card's whole job is to open the
 * conversation the brief belongs in; the waiting (writing a stale brief is a live model turn) is
 * shown by Axl's own chip, where the user is already looking.
 *
 * So there is no busy state and no failure state to hold here any more: nothing is requested on
 * this click. A brief that fails to write fails visibly in Axl's thread, which is also the one
 * place it can be retried by just asking.
 */
export function MarketBriefOfferBubble({ msg, onClose, onResolve }) {
    function handlePrimary() {
        eventBus.emit(MARKET_BRIEF_OPEN, { day: msg.payload?.day ?? null })
        onClose?.()
    }

    return (
        <NotificationCard
            agent={AGENTS.axl} kind="info" heading="Market brief"
            body={msg.content}
            primaryLabel={msg.actions?.primary?.label ?? 'Get the brief'}
            onPrimary={handlePrimary}
            onResolve={onResolve} msg={msg}
            // `delivered` is what cards resolved before the brief moved into Axl said — kept so an
            // old card in the user's history still reads as done rather than falling back to a raw
            // outcome key.
            resolvedLabels={{ opened: '✓ Got it', delivered: '✓ Sent' }}
        />
    )
}

export function CoverageRefreshedBubble({ msg, onClose, onResolve }) {
    const { symbol, coverageId, portfolioId, ok } = msg.payload
    const heading = `Research · ${symbol}${ok === false ? ' — refresh failed' : ' refreshed'}`

    function handlePrimary() {
        if (portfolioId) {
            eventBus.emit(PORTFOLIO_REVIEW, { portfolioId, reviewMode: true })
        } else {
            // 'open', not 'revise': this thesis was just rewritten — the ask is to READ it.
            eventBus.emit(OPEN_COVERAGE, { coverageId, symbol, mode: 'open' })
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
        // Entries (incl. a scale-in add) and a partial exit (trim) all carry a size; a full exit doesn't.
        const needsQty = isEntry || leg.partial
        const qty = needsQty ? Number(row.qty) : undefined
        if (needsQty && !(qty > 0)) { patch(leg.ideaId, { err: 'Enter a valid quantity' }); return }

        patch(leg.ideaId, { status: 'saving', err: null })
        try {
            // An add leg rides the entry card but scales INTO a live position → its own endpoint.
            const idea = leg.add
                ? await manualService.confirmAdd(leg.ideaId, { price, quantity: qty })
                : isEntry
                ? await manualService.confirmEntry(leg.ideaId, { price, quantity: qty })
                : await manualService.confirmExit(leg.ideaId, { price, quantity: qty })
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
                    const showQty  = isEntry || leg.partial   // entries, scale-in adds, and trims carry a size
                    const verb     = leg.add ? 'Add' : isEntry ? 'Fill' : leg.partial ? 'Trim' : 'Close'
                    const verbPast = leg.add ? 'added' : isEntry ? 'filled' : leg.partial ? 'trimmed' : 'closed'
                    return (
                        <div key={leg.ideaId} className={`social-chat__manual-leg${done ? ' is-done' : ''}`}>
                            <div className="social-chat__manual-leg-meta">
                                <span className={`social-chat__manual-leg-dir social-chat__manual-leg-dir--${leg.direction}`}>{String(leg.direction).toUpperCase()}</span>
                                <span className="social-chat__manual-leg-asset">{leg.asset}</span>
                                {showQty && leg.quantity != null && <span className="social-chat__manual-leg-qty">&times; {leg.quantity}</span>}
                            </div>
                            {done ? (
                                <span className="social-chat__manual-leg-done">✓ {verbPast} @ {row.price}</span>
                            ) : (
                                <div className="social-chat__manual-leg-inputs">
                                    {showQty && (
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
                                    >{row.status === 'saving' ? '…' : verb}</button>
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
