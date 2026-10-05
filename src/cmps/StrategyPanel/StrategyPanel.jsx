import { useState, useEffect, useRef } from 'react'
import PropTypes from 'prop-types'
import { strategyService } from '../../services/strategy/strategy.service.remote.js'
import { threadsService, newThreadId, clearThread } from '../../services/threads/threads.service.remote.js'
import { readStoredModel } from '../modelOptions.js'
import { useChatStream, toChatHistory, withoutPrefill } from '../../customHooks/useChatStream.js'
import { AgentMessages } from '../AgentMessages.jsx'
import { AgentChatInput } from '../AgentChatInput.jsx'
import { RouteOffer } from '../RouteOffer.jsx'
import { useRouteOffer } from '../../customHooks/useRouteOffer.js'
import { useSeedTurn } from '../../customHooks/useSeedTurn.js'
import { AGENTS } from '../AxlHub/agentMeta.jsx'
import { AgentIntro, AgentTurnTag } from '../AxlHub/AgentSummon.jsx'
import { ChatBubble } from '../ChatBubble.jsx'
import { ToolStatusChip } from '../ToolStatusChip/ToolStatusChip.jsx'
import { waitingLabel } from '../ToolStatusChip/waitingLabel.js'
import '../Radar/IndustryView.scss'   // the shared grade chip
import './StrategyPanel.scss'

// Pythia's desk — the industry desk since 2026-10-05 (backend docs/design/pythia-industry-questions.md).
// For a GICS sub-industry it answers three structural questions — demand, economics, cycle — and a
// turn that answered emits one <industry_view> DRAFT per industry, which the admin then publishes.
//
// Publishing is deliberately a SECOND act, one industry at a time: the draft is a proposal, and the
// server checks it against the measured numbers (a departure from a measured grade needs its argument).

const MessageBubble = ({ msg }) => <ChatBubble msg={msg} phaseLabels={[]} phaseTotal={0} />
MessageBubble.propTypes = { msg: PropTypes.object.isRequired }

const QUESTIONS = [['demand', 'Demand'], ['economics', 'Economics'], ['cycle', 'Cycle']]

/** One drafted industry answer before it is published. */
export function IndustryDraft({ view, error = '', onPublish, busy = false }) {
    return (
        <div className="strategy-panel__draft">
            <div className="strategy-panel__draft-head">
                <span className="strategy-panel__regime">GICS {view.industry}</span>
            </div>
            {view.summary && <p className="strategy-panel__thesis">{view.summary}</p>}
            <div className="strategy-panel__answers">
                {QUESTIONS.map(([q, label]) => {
                    const a = view[q] ?? {}
                    return (
                        <div key={q} className="strategy-panel__answer">
                            <span className="strategy-panel__answer-q">{label}</span>
                            <span className={`industry-grade industry-grade--${a.grade ?? 'none'}`}>{a.grade?.replace('_', ' ') ?? '—'}</span>
                            <p className="strategy-panel__answer-why">{a.rationale}</p>
                            {a.override_reason && <p className="strategy-panel__answer-override"><b>Departs from the measured grade:</b> {a.override_reason}</p>}
                        </div>
                    )
                })}
            </div>
            {(view.reopen_if?.length ?? 0) > 0 && (
                <div className="strategy-panel__kills">
                    <span className="strategy-panel__kills-label">reopen early if</span>
                    <ul>{view.reopen_if.map((k, i) => <li key={i}>{k}</li>)}</ul>
                </div>
            )}
            {error && <div className="strategy-panel__err">{error}</div>}
            <button className="portfolio-panel__review-btn portfolio-panel__review-btn--update" disabled={busy} onClick={onPublish}>
                Publish this answer
            </button>
        </div>
    )
}
IndustryDraft.propTypes = { view: PropTypes.object.isRequired, error: PropTypes.string, onPublish: PropTypes.func.isRequired, busy: PropTypes.bool }

export function StrategyPanel({ seed = null, onLoadingChange, onPublished, onRoute, pipeline = null, resumeRef = null }) {
    const chat = useChatStream({ threadPhases: true })
    const routeOffer = useRouteOffer()
    const { messages, isLoading } = chat
    const [pendingViews, setPendingViews] = useState([])
    const [errors, setErrors]             = useState({})
    const [publishing, setPublishing]     = useState(null)
    const threadIdRef = useRef(newThreadId())

    useEffect(() => { onLoadingChange?.(isLoading) }, [isLoading])   // eslint-disable-line react-hooks/exhaustive-deps

    /** Persist the conversation as a DRAFT THREAD — the shared mechanism every other desk uses. */
    function _saveThread(msgs, phase, drafts) {
        threadsService.saveDraft({
            pipeline,
            threadId: threadIdRef.current, agent: 'strategy',
            messages: msgs, phase: phase ?? null, subjectType: 'industry_view',
            state: drafts?.length ? { draft: drafts } : null,
        })
    }

    // A routed arrival's opening sentence (Axl's `<open>`), sent as this desk's next turn.
    useSeedTurn(seed, (text) => _send(text))

    /** The latest turn decides — a turn without a block withdraws the earlier drafts. */
    function _takeDrafts(data) {
        const views = Array.isArray(data.views) ? data.views : []
        setPendingViews(views)
        setErrors({})
        return views
    }

    async function _send(text) {
        routeOffer.clear()
        const history = toChatHistory(messages)
        history.push({ role: 'user', content: text })

        await chat.run(text, {
            log: '[strategy]',
            onStopped: () => _saveThread(history, chat.phase, pendingViews),
            onDone: (data) => {
                chat.finishStreaming({ role: 'assistant' })
                const views = _takeDrafts(data)
                routeOffer.capture(data)
                _saveThread([...history, { role: 'assistant', content: data.reply }], data.phase, views)
            },
            send: ({ signal, handlers }) => strategyService.sendStream(history, {
                model: readStoredModel(), chatState: {}, signal, ...handlers,
            }),
        })
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
                const views = _takeDrafts(data)
                routeOffer.capture(data)
                _saveThread([...withoutPrefill(history), { role: 'assistant', content: base + data.reply }], data.phase, views)
            },
        })
        if (!cont) return
        try {
            await strategyService.sendStream(history, { model: readStoredModel(), chatState: {}, signal: cont.signal, ...cont.handlers })
        } catch (err) {
            console.error('[strategy]', err)
            chat.restoreStopped(base)
        } finally {
            chat.endStream()
        }
    }

    function handleClear() { chat.reset(); routeOffer.clear(); setPendingViews([]); setErrors({}); clearThread(threadIdRef) }

    async function handleResumeThread(threadId) {
        const t = await threadsService.getThread(threadId)
        if (!t) return
        chat.setMessages(t.messages ?? [])
        setPendingViews(Array.isArray(t.state?.draft) ? t.state.draft : [])
        setErrors({})
        threadIdRef.current = t.threadId
    }
    if (resumeRef) resumeRef.current = handleResumeThread

    async function handlePublish(view) {
        setPublishing(view.industry)
        setErrors(e => ({ ...e, [view.industry]: '' }))
        try {
            const saved = await strategyService.publishIndustry(view.industry, view)
            const rest = pendingViews.filter(v => v !== view)
            setPendingViews(rest)
            if (saved?.id && !rest.length) {
                await threadsService.linkThread(threadIdRef.current, { subjectType: 'industry_view', subjectId: saved.id, artifactName: saved.name ?? null })
                threadIdRef.current = newThreadId()
            }
            onPublished?.(saved)
        } catch (err) {
            // 422 = the answer does not hold up against the measured numbers — most often a grade that
            // departs from the code's read without saying why. The detail names the question.
            const data = err?.response?.data
            setErrors(e => ({ ...e, [view.industry]: data?.detail || data?.error || 'Could not publish the answer' }))
        } finally {
            setPublishing(null)
        }
    }

    return (
        <div className="strategy-panel">
            <AgentMessages chat={chat}>
                {messages.length === 0 && <AgentIntro agent={AGENTS.strategy} />}
                {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
                {isLoading && <ToolStatusChip label={waitingLabel({ messages, streamStatus: chat.streamStatus, placeholder: 'reading the filings…' })} pulse={chat.reasoningPulse} />}
                {(isLoading || messages.some(m => m.role === 'assistant' && m.content)) && (
                    <AgentTurnTag agent={AGENTS.strategy} active={isLoading} />
                )}
            </AgentMessages>

            {!isLoading && pendingViews.length > 0 && (
                <div className="strategy-panel__draft-wrap">
                    {pendingViews.map(v => (
                        <IndustryDraft key={v.industry} view={v} error={errors[v.industry] ?? ''}
                            busy={publishing === v.industry} onPublish={() => handlePublish(v)} />
                    ))}
                    <span className="strategy-panel__hint">
                        A published answer replaces the house answer for that industry; the old one stays on its revision trail.
                    </span>
                </div>
            )}

            <RouteOffer offer={routeOffer.offer} busy={chat.isLoading} onGo={(o) => { routeOffer.clear(); onRoute?.(o) }} onDismiss={routeOffer.clear} />

            <AgentChatInput
                chat={chat}
                placeholder="Ask about an industry — e.g. “Review semiconductors” (Enter to send)"
                onSend={_send}
                onClear={handleClear}
                onResume={_continue}
            />
        </div>
    )
}

StrategyPanel.propTypes = {
    seed:            PropTypes.object,
    onRoute:         PropTypes.func,
    onLoadingChange: PropTypes.func,
    onPublished:     PropTypes.func,
    pipeline:        PropTypes.string,
    resumeRef:       PropTypes.object,
}
