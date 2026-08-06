import { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { strategyService } from '../../services/strategy/strategy.service.remote.js'
import { readStoredModel } from '../modelOptions.js'
import { readStoredReasoning } from '../reasoningOptions.js'
import { useChatStream, toChatHistory } from '../../customHooks/useChatStream.js'
import { AgentMessages } from '../AgentMessages.jsx'
import { AgentChatInput } from '../AgentChatInput.jsx'
import { ChatBubble } from '../ChatBubble.jsx'
import { ToolStatusChip } from '../ToolStatusChip/ToolStatusChip.jsx'
import { waitingLabel } from '../ToolStatusChip/waitingLabel.js'
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

export function StrategyPanel({ currentTilt = null, onLoadingChange, onPublished }) {
    const chat = useChatStream({ threadPhases: true })
    const { messages, isLoading } = chat
    const [pendingTilt, setPendingTilt] = useState(null)
    const [publishErr, setPublishErr]   = useState('')

    // The published view rides every turn so Pythia can REAFFIRM rather than re-author. Held in a
    // ref as well: `_send` runs before React re-renders, so reading the prop mid-send is stale.
    const currentRef = useRef(null)
    currentRef.current = currentTilt

    useEffect(() => { onLoadingChange?.(isLoading) }, [isLoading])   // eslint-disable-line react-hooks/exhaustive-deps

    async function _send(text) {
        if (!text || isLoading) return
        setPublishErr('')
        const history = toChatHistory(messages)
        history.push({ role: 'user', content: text })

        const { signal, handlers } = chat.begin(text, {
            onDone: (data) => {
                chat.finishStreaming({ role: 'assistant' })
                if (data.tilt) setPendingTilt(data.tilt)
            },
        })

        try {
            await strategyService.sendStream(history, {
                model:           readStoredModel('strategyModel'),
                reasoningEffort: readStoredReasoning('strategyReasoning'),
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
            },
        })
        if (!cont) return
        try {
            await strategyService.sendStream(history, {
                model:           readStoredModel('strategyModel'),
                reasoningEffort: readStoredReasoning('strategyReasoning'),
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

    function handleClear() { chat.reset(); setPendingTilt(null); setPublishErr('') }

    async function handlePublish() {
        if (!pendingTilt) return
        setPublishErr('')
        try {
            const saved = await strategyService.publishTilt(pendingTilt)
            setPendingTilt(null)
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
                {messages.length === 0 && (
                    <div className="strategy-panel__intro">
                        <h3>Pythia</h3>
                        <p>
                            The top-down desk. One house view: what regime we are in, what would break that read,
                            and the sector stances it implies — as active weight against the benchmark, so each one
                            gets graded on whether the sector beat the index.
                        </p>
                        {currentTilt && (
                            <p className="strategy-panel__standing">
                                A view is already in force ({currentTilt.tilts?.length ?? 0} stances). Ask for a review and
                                Pythia reaffirms what still holds rather than starting over.
                            </p>
                        )}
                    </div>
                )}
                {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
                {isLoading && <ToolStatusChip label={waitingLabel({ messages, streamStatus: chat.streamStatus, placeholder: 'reading the tape…' })} pulse={chat.reasoningPulse} />}
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
}
