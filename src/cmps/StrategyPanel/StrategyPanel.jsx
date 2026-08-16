import { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { strategyService } from '../../services/strategy/strategy.service.remote.js'
import { threadsService, newThreadId, clearThread } from '../../services/threads/threads.service.remote.js'
import { readStoredModel } from '../modelOptions.js'
import { useChatStream, toChatHistory } from '../../customHooks/useChatStream.js'
import { AgentMessages } from '../AgentMessages.jsx'
import { AgentChatInput } from '../AgentChatInput.jsx'
import { AGENTS } from '../AxlHub/agentMeta.jsx'
import { AgentIntro, AgentTurnTag } from '../AxlHub/AgentSummon.jsx'
import { ChatBubble } from '../ChatBubble.jsx'
import { ToolStatusChip } from '../ToolStatusChip/ToolStatusChip.jsx'
import { waitingLabel } from '../ToolStatusChip/waitingLabel.js'
import { reviewPrompt } from './reviewPrompt.js'
import './StrategyPanel.scss'

// Pythia's desk. One turn produces a top-down read; a published turn also emits a `<tilt>` DRAFT —
// the regime plus sector stances as active weight vs the benchmark — which the user then publishes.
//
// Publishing is deliberately a SECOND act, exactly as initiating coverage is: the draft is a
// proposal, and a house view that supersedes the standing one should take a click.

const STRATEGY_PHASE_LABELS = ['Backdrop', 'Regime', 'Sector mapping', 'Cross-check', 'Publish']

const MessageBubble = ({ msg }) => (
    <ChatBubble msg={msg} phaseLabels={STRATEGY_PHASE_LABELS} phaseTotal={5} />
)
MessageBubble.propTypes = { msg: PropTypes.object.isRequired }

const STANCE_LABEL = { over: 'OW', neutral: 'NEU', under: 'UW' }
const _bp = v => (v === null || v === undefined ? '—' : `${v >= 0 ? '+' : ''}${v}bp`)

/**
 * The drafted view before it is published — the regime, and each stance with the weight it implies.
 *
 * Shows the NET explicitly: a tilt table redistributes a fully-invested book, so the weights must
 * cancel. Surfacing the sum here is what lets the user catch an unbalanced table before it becomes
 * the house view, rather than reading a warning on the board afterwards.
 */
export function TiltDraft({ tilt }) {
    const rows = Array.isArray(tilt.tilts) ? tilt.tilts : []
    const net  = rows.reduce((a, r) => a + (Number(r.active_bp) || 0), 0)
    // Mirrors BALANCE_TOLERANCE_BP on the server — the client only PREVIEWS the verdict; the
    // publish call is what actually decides, so a drift here costs a surprise, never a bad write.
    const balanced = Math.abs(net) <= 50

    return (
        <div className="strategy-panel__draft">
            <div className="strategy-panel__draft-head">
                <span className="strategy-panel__regime">{tilt.regime?.name ?? 'House view'}</span>
                <span className="strategy-panel__bench">vs {tilt.benchmark ?? 'SPX'}</span>
                <span className={`strategy-panel__net${balanced ? '' : ' strategy-panel__net--off'}`}
                    title={balanced ? 'Weights net out' : 'Active weights do not net to zero — not directly allocatable'}>
                    net {_bp(net)}
                </span>
            </div>
            {tilt.regime?.thesis && <p className="strategy-panel__thesis">{tilt.regime.thesis}</p>}
            <div className="strategy-panel__stances">
                {rows.map((r, i) => (
                    <div key={r.sector ?? i} className={`strategy-panel__stance strategy-panel__stance--${r.stance ?? 'none'}`}>
                        <span className="strategy-panel__stance-sector">{r.sector}</span>
                        <span className="strategy-panel__stance-tag">{STANCE_LABEL[r.stance] ?? '—'}</span>
                        <span className="strategy-panel__stance-bp">{_bp(r.active_bp)}</span>
                        <span className="strategy-panel__stance-h">{r.horizon ?? '—'}</span>
                    </div>
                ))}
            </div>
            {(tilt.regime?.kill_criteria?.length ?? 0) > 0 && (
                <div className="strategy-panel__kills">
                    <span className="strategy-panel__kills-label">what breaks it</span>
                    <ul>{tilt.regime.kill_criteria.map((k, i) => <li key={i}>{k}</li>)}</ul>
                </div>
            )}
        </div>
    )
}
TiltDraft.propTypes = { tilt: PropTypes.object.isRequired }

export function StrategyPanel({ currentTilt = null, onLoadingChange, onPublished, pipeline = null, resumeRef = null, reviewRequest = null, onReviewStart }) {
    const chat = useChatStream({ threadPhases: true })
    const { messages, isLoading } = chat
    const [pendingTilt, setPendingTilt] = useState(null)
    const [publishErr, setPublishErr]   = useState('')

    // The published view rides every turn so Pythia can REAFFIRM rather than re-author. Held in a
    // ref as well: `_send` runs before React re-renders, so reading the prop mid-send is stale.
    const currentRef = useRef(null)
    currentRef.current = currentTilt
    const threadIdRef = useRef(newThreadId())   // the view-building conversation's draft thread

    useEffect(() => { onLoadingChange?.(isLoading) }, [isLoading])   // eslint-disable-line react-hooks/exhaustive-deps

    /**
     * Persist the conversation as a DRAFT THREAD — the shared mechanism every other desk uses. This
     * desk had none, so a view the user walked out of mid-build left no marker, closed no door, and
     * survived only as React state behind a hidden tab (gone on reload). See AnalystPanel/_saveThread.
     *
     * `draft` is passed in because setPendingTilt lands after this turn's onDone runs.
     */
    function _saveThread(msgs, phase, draft) {
        threadsService.saveDraft({
            pipeline,
            threadId: threadIdRef.current, agent: 'strategy',
            messages: msgs, phase: phase ?? null, subjectType: 'tilt',
            state: draft ? { draft } : null,
        })
    }

    async function _send(text) {
        if (!text || isLoading) return
        setPublishErr('')
        const history = toChatHistory(messages)
        history.push({ role: 'user', content: text })

        const { signal, handlers } = chat.begin(text, {
            onDone: (data) => {
                chat.finishStreaming({ role: 'assistant' })
                if (data.tilt) setPendingTilt(data.tilt)
                _saveThread([...history, { role: 'assistant', content: data.reply }], data.phase, data.tilt ?? pendingTilt)
            },
        })

        try {
            await strategyService.sendStream(history, {
                model:           readStoredModel(),
                // The view in force, so a stance that still holds keeps its ORIGINAL clock and entry
                // prices instead of being silently re-based every review.
                chatState:       { current_tilt: currentRef.current },
                signal,
                ...handlers,
            })
        } catch (err) {
            console.error('[strategy]', err)
            chat.freezeError()
        } finally {
            chat.endStream()
        }
    }

    // The review asked for from Pythia's card in the social chat (MainPage bumps `reviewRequest`).
    // It goes through _send, so it is indistinguishable from the user typing the ask: same history,
    // same draft thread, same `current_tilt` riding along — which is what makes the answer a REVIEW
    // (reaffirm what holds, keep its clock and baseline) rather than a fresh view.
    //
    // `isLoading` is a dependency, not a guard to bail on: pressing the card mid-turn must not
    // swallow the review. The request is left unconsumed and this re-runs when the turn ends.
    useEffect(() => {
        if (!reviewRequest?.n || isLoading) return
        onReviewStart?.()
        _send(reviewPrompt(reviewRequest.reason))
    }, [reviewRequest?.n, isLoading])   // eslint-disable-line react-hooks/exhaustive-deps

    // Resume a stopped reply (▶) — continue the same bubble.
    async function _continue() {
        if (isLoading) return
        const last = messages[messages.length - 1]
        if (!last || last.role !== 'assistant' || !last.stopped) return
        const base = chat.resumeBase()
        const history = chat.finalizeResumeHistory(toChatHistory(messages), base)
        const cont = chat.beginContinue({
            onError: () => chat.restoreStopped(base),
            onDone: (data) => {
                chat.finishStreaming({ role: 'assistant', content: base + data.reply })
                if (data.tilt) setPendingTilt(data.tilt)
                _saveThread([...history.slice(0, -1), { role: 'assistant', content: base + data.reply }], data.phase, data.tilt ?? pendingTilt)
            },
        })
        if (!cont) return
        try {
            await strategyService.sendStream(history, {
                model:           readStoredModel(),
                chatState:       { current_tilt: currentRef.current },
                signal:          cont.signal,
                ...cont.handlers,
            })
        } catch (err) {
            console.error('[strategy]', err)
            // Restore the stopped bubble rather than freezing an error over it — a failed RESUME
            // must not cost the user the partial reply they already had.
            chat.restoreStopped(base)
        } finally {
            chat.endStream()
        }
    }

    // Clear is not walking away — the draft goes with the conversation. See clearThread.
    function handleClear() { chat.reset(); setPendingTilt(null); setPublishErr(''); clearThread(threadIdRef) }

    // Resume an unfinished view-building draft: restore the conversation + the tilt in progress, and
    // keep writing to the SAME thread. `current_tilt` is not restored — it rides from the live prop,
    // so a resumed review reaffirms against the view in force NOW, not a copy frozen on the way out.
    async function handleResumeThread(threadId) {
        const t = await threadsService.getThread(threadId)
        if (!t) return
        chat.setMessages(t.messages ?? [])
        setPendingTilt(t.state?.draft ?? null)
        setPublishErr('')
        threadIdRef.current = t.threadId
    }
    if (resumeRef) resumeRef.current = handleResumeThread

    async function handlePublish() {
        if (!pendingTilt) return
        setPublishErr('')
        try {
            const saved = await strategyService.publishTilt(pendingTilt)
            setPendingTilt(null)
            // AWAITED before onPublished — that callback ends the desk run, and finishing deletes the
            // run's remaining DRAFTS. See AnalystPanel/_linkThread.
            if (saved?.id) {
                await threadsService.linkThread(threadIdRef.current, { subjectType: 'tilt', subjectId: saved.id, artifactName: saved.regime ?? null })
                threadIdRef.current = newThreadId()
            }
            onPublished?.(saved)
        } catch (err) {
            // 422 = a stance contradicts its active weight. That is the one refusal worth spelling
            // out, because `active_bp` is what gets allocated: publishing it would move a book the
            // opposite way from what the words said.
            const data = err?.response?.data
            setPublishErr(data?.detail || data?.error || 'Could not publish the view')
        }
    }

    const rowCount = pendingTilt?.tilts?.length ?? 0

    return (
        <div className="strategy-panel">
            <AgentMessages chat={chat}>
                {/* The brand rides the shared pieces every other desk uses — badge, "Hi, I'm …",
                    the desk's own intro/hint from agentMeta. Only the standing-view note is
                    specific to this desk, so it goes in as a child. */}
                {messages.length === 0 && (
                    <AgentIntro agent={AGENTS.strategy}>
                        {currentTilt && (
                            <p className="strategy-panel__standing">
                                A view is already in force ({currentTilt.tilts?.length ?? 0} stances). Ask for a review and
                                Pythia reaffirms what still holds rather than starting over.
                            </p>
                        )}
                    </AgentIntro>
                )}
                {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
                {isLoading && <ToolStatusChip label={waitingLabel({ messages, streamStatus: chat.streamStatus, placeholder: 'reading the tape…' })} pulse={chat.reasoningPulse} />}
                {(isLoading || messages.some(m => m.role === 'assistant' && m.content)) && (
                    <AgentTurnTag agent={AGENTS.strategy} active={isLoading} />
                )}
            </AgentMessages>

            {!isLoading && pendingTilt && (
                <div className="strategy-panel__draft-wrap">
                    <TiltDraft tilt={pendingTilt} />
                    {publishErr && <div className="strategy-panel__err">{publishErr}</div>}
                    <button className="portfolio-panel__review-btn portfolio-panel__review-btn--update" onClick={handlePublish}>
                        {currentTilt ? `Replace the house view — ${rowCount} stances` : `Publish the house view — ${rowCount} stances`}
                    </button>
                    <span className="strategy-panel__hint">
                        {currentTilt
                            ? 'The current view is superseded, not deleted — it stays on the record with its stances still being graded.'
                            : 'Every stance starts its clock when you publish.'}
                    </span>
                </div>
            )}

            <AgentChatInput
                chat={chat}
                placeholder="Ask for the top-down read — e.g. “What regime are we in?” (Enter to send)"
                onSend={_send}
                onClear={handleClear}
                onResume={_continue}
            />
        </div>
    )
}

StrategyPanel.propTypes = {
    currentTilt:     PropTypes.object,   // the view in force — drives reaffirm-vs-re-author
    onLoadingChange: PropTypes.func,
    onPublished:     PropTypes.func,
    pipeline:        PropTypes.string,   // the DESK this run belongs to — what the marker keys on
    resumeRef:       PropTypes.object,
    reviewRequest:   PropTypes.shape({ n: PropTypes.number, reason: PropTypes.string }),  // from the review-due card
    onReviewStart:   PropTypes.func,     // consume it, so walking back here does not re-run the review
}
