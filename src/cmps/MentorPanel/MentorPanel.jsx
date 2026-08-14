import { useState, useRef, useEffect } from 'react'
import PropTypes from 'prop-types'
import { mentorService } from '../../services/mentor/mentor.service.remote.js'
import { threadsService, newThreadId, clearThread } from '../../services/threads/threads.service.remote.js'
import { ChatBubble } from '../ChatBubble.jsx'
import { readStoredModel } from '../modelOptions.js'
import { useChatStream, toChatHistory } from '../../customHooks/useChatStream.js'
import { firstItem } from '../../services/pipeline/artifact.js'
import { useSeedTurn } from '../../customHooks/useSeedTurn.js'
import { AgentMessages } from '../AgentMessages.jsx'
import { AgentChatInput } from '../AgentChatInput.jsx'
import { LaterButton, LATER_BTN_CLASS } from '../LaterButton.jsx'
import { AgentIntro, AgentTurnTag } from '../AxlHub/AgentSummon.jsx'
import { AGENTS } from '../AxlHub/agentMeta.jsx'
import { ToolStatusChip } from '../ToolStatusChip/ToolStatusChip.jsx'
import { waitingLabel } from '../ToolStatusChip/waitingLabel.js'
import { CoverageChips } from './CoverageChips.jsx'
import { SetupSummary } from './SetupSummary.jsx'
import { CandidatePicker } from './CandidatePicker.jsx'
import '../PortfolioPanel/PortfolioPanel.scss'
import './MentorPanel.scss'

// Mentor — the trade assistant (Pipeline F). Forked from KairosPanel, which is the right shell:
// same stream hooks, same input row, same intro/turn-tag. What differs is the CONVERSATION model.
//
//   • No phases. Kairos threads its reply under numbered phase headings and posts `currentPhase`
//     back for model routing; Mentor has neither. Progress is <coverage> — a cumulative SET of
//     dimensions read, rendered as chips that fill in, order-free.
//   • No lens chip. Kairos's mode is chosen by the user before the build; Mentor's lens is
//     per-SETUP and named by the agent, so there is nothing to pick.
//   • Takes an Argus hand-off (the trade desk enters at a scan), but never ASKS for one: the
//     ticker arrives from the user or from a pick, so Mentor emits no scan_request.
//   • Generate and Arm are SEPARATE. A generated setup sits at `waiting`, unmonitored; arming is
//     a deliberate second act, and the server re-runs the readiness gate when it happens.

const SUGGESTIONS = [
    'I want to buy NVDA on a pullback',
    "I'm thinking of shorting TSLA this week",
    'Help me plan a swing trade on AAPL',
]

const MessageBubble = ({ msg }) => <ChatBubble msg={msg} />

export function MentorPanel({
    onLoadingChange, onGenerated, onPendingSetup,
    chatRestore = null, seed = null, inbox = null, editingSetupId = null, onEditDone,
    availableAccounts = [], selectedAccounts = [], mainAccountId = null, resumeRef = null,
    // The desk this conversation belongs to, stamped on its draft thread so an unfinished BUILD
    // can be told from a standalone chat at the same agent (deskWork.js). Null off a pipeline.
    pipeline          = null,
}) {
    const chat = useChatStream()
    const { messages } = chat

    useEffect(() => { onLoadingChange?.(chat.isLoading) }, [chat.isLoading])   // eslint-disable-line react-hooks/exhaustive-deps

    const [pendingSetup, setPendingSetup] = useState(null)
    const [readiness,    setReadiness]    = useState(null)
    const [coverage,     setCoverage]     = useState([])
    // The 2–3 candidate offer. Cleared the moment the user picks or types again — a stale picker
    // next to a live worksheet would let them "pick" something the conversation has moved past.
    const [candidates,   setCandidates]   = useState(null)
    // The saved setup, held only so we can offer Arm right after Generate. Arming is the real gate.
    const [generated,    setGenerated]    = useState(null)
    const [busy,         setBusy]         = useState(false)
    const [editDirty,    setEditDirty]    = useState(false)

    const threadIdRef = useRef(newThreadId())
    // The Argus candidate awaiting its turn. A ref, not state: it must ride the very send that the
    // hand-off effect fires, and a setState would not be readable until the render after.
    const seedRef     = useRef(null)

    const isEditing = !!editingSetupId
    const accounts  = availableAccounts.filter(a => selectedAccounts.includes(a.id))

    useEffect(() => { onPendingSetup?.(pendingSetup) }, [pendingSetup])   // eslint-disable-line react-hooks/exhaustive-deps

    // Edit pencil pushed a keyed restore: reopen the build conversation with its draft.
    useEffect(() => {
        if (!chatRestore) return
        chat.setMessages(chatRestore.messages ?? [])
        setPendingSetup(chatRestore.setup ?? null)
        setCoverage(chatRestore.coverage ?? [])
        setCandidates(null)
        setGenerated(null)
        setEditDirty(false)
    }, [chatRestore?.key])   // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { setEditDirty(false) }, [editingSetupId])

    // A calendar row (earnings / IPO) opened Mentor with the catalyst already worded as the user's
    // turn — see MainPage's seedMentorChat. The shared hand-off seed (useSeedTurn): sent not staged,
    // keyed so one click is one turn, landing in whatever conversation is open.
    useSeedTurn(seed, _send)

    // Argus handed a name over. The artifact arrives WHOLE rather than as a sentence (see
    // mentor.contract's `deliver`), because the lens Argus recommends has to reach the prompt as
    // data: Mentor authors `trade_mode`, and a recommendation surviving only as prose in the opening
    // line is indistinguishable from the user having asked for it.
    //
    // Keyed on the artifact so it fires once per hand-off. The panel `continues` rather than
    // remounting — this desk holds the user's own thinking — so the name arrives as a new turn in
    // whatever conversation is already open.
    useEffect(() => {
        const cand = firstItem(inbox)
        if (!cand?.ticker) return
        // Uppercased HERE, once, so the sentence and the seed name the same thing. The server
        // normalises the seed's ticker on its way into the prompt (sanitizeScanSeed) and cannot
        // reach the prose, so leaving it to the server means a turn that says `nvda` alongside a
        // seed that says `NVDA`.
        const ticker = cand.ticker.toUpperCase()
        seedRef.current = {
            ticker,
            direction:        cand.direction ?? null,
            thesis:           cand.thesis ?? null,
            analysis:         cand.analysis ?? null,
            recommended_mode: cand.recommended_mode ?? null,
        }
        // The user's own opening move — the hand-off says it for them. Deliberately NOT "my own
        // trade": a name off a screen is not one they brought, and opening as though it were invites
        // Mentor to pressure-test a plan nobody has made yet.
        // Trailing stop trimmed: a thesis usually ends in one and the template adds another.
        const read = (cand.thesis || cand.analysis || '').trim().replace(/\.+$/, '')
        _send(read
            ? `I want to work on a ${ticker} trade — the read on it is: ${read}. Let's build the setup together.`
            : `I want to work on a ${ticker} trade. Let's build the setup together.`)
    }, [inbox?.key])   // eslint-disable-line react-hooks/exhaustive-deps

    function persistedMessages() {
        return messages
            .filter(m => !m.streaming && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
            .map(m => ({ role: m.role, content: m.content }))
    }

    // The chatState the server echoes back into the system prompt. The draft matters most: Mentor's
    // own <setup> block is stripped from the visible history, so without this a thin re-emit on an
    // edit turn would wipe already-settled zones.
    //
    // `draft` is passed EXPLICITLY rather than read from state: a caller that sets the draft and
    // sends in the same tick (picking a candidate) would otherwise read the pre-update value from
    // this closure and send `draft: null` — the conversation and the worksheet diverging on the one
    // turn where they must agree.
    const streamOpts = (draft = pendingSetup) => {
        // One-shot: the hand-off turn carries it, every turn after has it in the history. Read and
        // cleared together so a second send cannot re-announce a name as newly handed over.
        const candidate = seedRef.current; seedRef.current = null
        return {
            model:           readStoredModel(),
            accounts,
            mainAccountId,
            chatState: { active_asset: draft?.asset || candidate?.ticker || '', draft, coverage },
            seed: candidate,   // structured Argus candidate — carries the recommended lens
        }
    }

    function _applyDone(data, draft) {
        if (data.coverage) setCoverage(data.coverage)
        if (data.setup) {
            setPendingSetup(data.setup)
            setReadiness(data.readiness ?? null)
            setCandidates(null)          // a worksheet supersedes an offer
        }
        if (data.setups) setCandidates(data.setups.candidates ?? null)
        return data.setup ?? draft
    }

    function _persist(history, reply, setup) {
        const msgs = [...history, { role: 'assistant', content: reply }]
        if (editingSetupId) {
            // Conversation ONLY — never the plan. A mid-edit turn that went through updateSetup
            // would re-run the venue gate and send a watched setup back to 'waiting', so Talos
            // would stop watching because the user asked a question. The plan is written when
            // they press "Update setup".
            mentorService.saveChatState(editingSetupId, { messages: msgs, draft: setup, coverage })
                .catch(err => console.error('[mentor] chat_state save', err))
        } else {
            threadsService.saveDraft({
                        pipeline,
                threadId: threadIdRef.current, agent: 'mentor',
                messages: msgs, subjectType: 'setup',
                state: setup ? { draft: setup, coverage } : null,
            })
        }
    }

    // `draft` overrides the state closure for callers that set it in the same tick (see streamOpts).
    async function _send(text, draft = pendingSetup) {
        if (!text || chat.isLoading) return
        setEditDirty(true)
        setCandidates(null)   // a new user turn supersedes any pending offer
        setGenerated(null)

        const history = toChatHistory(messages)
        history.push({ role: 'user', content: text })

        const { signal, handlers } = chat.begin(text, {
            onCoverage: setCoverage,
            onDone: (data) => {
                chat.finishStreaming({ role: 'assistant', content: data.reply })
                _persist(history, data.reply, _applyDone(data, draft))
            },
        })

        try {
            await mentorService.sendStream(history, { ...streamOpts(draft), signal, ...handlers })
        } catch (err) {
            console.error('[mentor]', err)
            chat.freezeError()
        } finally {
            chat.endStream()
        }
    }

    // Resume a stopped reply in place (prefill continuation), mirroring the other chats.
    async function _continue() {
        if (chat.isLoading) return
        const last = messages[messages.length - 1]
        if (!last || last.role !== 'assistant' || !last.stopped) return
        const base = chat.resumeBase()
        setEditDirty(true)

        const history = chat.finalizeResumeHistory(toChatHistory(messages), base)
        const cont = chat.beginContinue({
            onCoverage: setCoverage,
            onError: () => chat.restoreStopped(base),
            onDone: (data) => {
                const content = base + data.reply
                chat.finishStreaming({ role: 'assistant', content })
                _persist(history.slice(0, -1), content, _applyDone(data, pendingSetup))
            },
        })
        if (!cont) return

        try {
            await mentorService.sendStream(history, { ...streamOpts(), signal: cont.signal, ...cont.handlers })
        } catch (err) {
            console.error('[mentor]', err)
            chat.restoreStopped(base)
        } finally {
            chat.endStream()
        }
    }

    function handleClear() {
        chat.reset()
        setPendingSetup(null)
        setReadiness(null)
        setCoverage([])
        setCandidates(null)
        setGenerated(null)
        setEditDirty(false)
        // Clear is not walking away — the draft goes with the conversation. See clearThread.
        clearThread(threadIdRef)
    }

    // Picking a candidate makes it the live worksheet locally AND tells Mentor in words, so the
    // conversation and the draft can't diverge on which one was chosen.
    function handlePickCandidate(candidate) {
        setPendingSetup(candidate.setup)
        setCandidates(null)
        // Pass the picked setup THROUGH — the state update above lands after this call.
        _send(`Let's go with "${candidate.label}".`, candidate.setup)
    }

    async function handleResumeThread(threadId) {
        const t = await threadsService.getThread(threadId)
        if (!t) return
        chat.setMessages(t.messages ?? [])
        setPendingSetup(t.state?.draft ?? null)
        setCoverage(t.state?.coverage ?? [])
        setCandidates(null)
        setEditDirty(false)
        threadIdRef.current = t.threadId
    }
    if (resumeRef) resumeRef.current = handleResumeThread

    async function handleGenerate() {
        if (!pendingSetup || accounts.length === 0 || busy) return
        setBusy(true)
        try {
            const state = { messages: persistedMessages(), draft: pendingSetup, coverage }
            const saved = isEditing
                ? await mentorService.updateSetup(editingSetupId, pendingSetup, accounts, mainAccountId, state)
                : await mentorService.generateSetup(pendingSetup, accounts, mainAccountId, state)

            // AWAITED: arming (or leaving it waiting) ends the desk run, which deletes its remaining
            // DRAFTS — and this thread is one of them until the link lands. The Arm click is a human
            // beat away, so the race is unlikely rather than impossible; ordering it is free.
            if (!isEditing && saved?.id) {
                await threadsService.linkThread(threadIdRef.current, { subjectType: 'setup', subjectId: saved.id, artifactName: pendingSetup.asset ?? null })
                threadIdRef.current = newThreadId()
            }
            // Deliberately NOT returning to the hub yet: the setup exists but is not monitored, and
            // that distinction is invisible unless we stop here and offer Arm explicitly.
            setGenerated(saved)
            if (isEditing) { handleClear(); onEditDone?.() }
        } catch (err) {
            console.error('[mentor] generate', err)
        } finally {
            setBusy(false)
        }
    }

    async function handleArm() {
        if (!generated?.id || busy) return
        setBusy(true)
        try {
            await mentorService.armSetup(generated.id)
            handleClear()
            onGenerated?.()
        } catch (err) {
            // The server re-runs the full gate on arm, so this is a real, explainable refusal
            // (e.g. the broker disconnected after Generate) — surface it rather than failing silent.
            console.error('[mentor] arm', err)
            window.alert(`Couldn't arm this setup: ${err?.message || 'unknown reason'}`)
        } finally {
            setBusy(false)
        }
    }

    const hasPreview = !!pendingSetup?.asset
    // A missing account is a readiness gap like any other, so it belongs in `missing` rather than
    // being a separate silent reason the button is dark.
    //
    // `problems` must survive this. Readiness has TWO refusals — something ABSENT (missing) and
    // something INCOHERENT (problems: a validity floor drawn below its own stop, say) — and the
    // second one used to be dropped here and never rendered below. A setup that was complete but
    // contradictory therefore showed a dark Generate button with no stated reason at all, which is
    // exactly the dead button the copy under it exists to prevent. Seen on a live run.
    const effectiveReadiness = accounts.length === 0
        ? { ...readiness, ready: false, missing: [...(readiness?.missing ?? []), 'trading account'] }
        : readiness
    const ready = !!effectiveReadiness?.ready
    // Both refusals, worded for their kind: one is a gap to fill, the other a contradiction to fix.
    const blockers = [
        ...(effectiveReadiness?.missing ?? []).map(m => ({ kind: 'missing', text: m })),
        ...(effectiveReadiness?.problems ?? []).map(p => ({ kind: 'problem', text: p })),
    ]

    return (
        <div className="portfolio-panel mentor-panel">
            {(hasPreview || coverage.length > 0) && (
                <div className="portfolio-panel__build-summary mentor-panel__build">
                    <div className="mentor-panel__build-head">
                        <span className="portfolio-panel__build-summary-title">your setup</span>
                        <CoverageChips coverage={coverage} />
                    </div>
                    {hasPreview && (
                        <SetupSummary
                            setup={pendingSetup}
                            onChange={setPendingSetup}
                            readOnly={!!generated}
                        />
                    )}
                </div>
            )}

            <AgentMessages chat={chat} watch={`${hasPreview}|${!!candidates}`}>
                {messages.length === 0 && (
                    <AgentIntro agent={AGENTS.mentor}>
                        <div className="mentor-panel__suggestions">
                            {SUGGESTIONS.map(s => (
                                <button key={s} className="mentor-panel__suggestion" onClick={() => _send(s)} disabled={chat.isLoading}>{s}</button>
                            ))}
                        </div>
                    </AgentIntro>
                )}
                {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
                {chat.isLoading && <ToolStatusChip label={waitingLabel({ messages, streamStatus: chat.streamStatus })} pulse={chat.reasoningPulse} />}
                {(chat.isLoading || messages.some(m => m.role === 'assistant' && m.content)) && (
                    <AgentTurnTag agent={AGENTS.mentor} active={chat.isLoading} />
                )}
            </AgentMessages>

            {!chat.isLoading && candidates?.length > 0 && (
                <CandidatePicker candidates={candidates} onPick={handlePickCandidate} />
            )}

            {/* Generate lives HERE, at the foot of the conversation, not in the preview above —
                the preview is a reference, this is the action. Shown as soon as there is a setup so
                the user can see what is still missing rather than hunting for a hidden button. */}
            {!chat.isLoading && hasPreview && !generated && !isEditing && (
                <div className="portfolio-panel__action-bubble mentor-panel__generate">
                    <button
                        className="portfolio-panel__review-btn portfolio-panel__review-btn--update mentor-panel__btn"
                        onClick={handleGenerate}
                        disabled={!ready || busy}
                    >
                        {busy ? 'Generating…' : 'Generate setup'}
                    </button>
                    {!ready && blockers.length > 0 && (
                        <span className="mentor-panel__missing">
                            {blockers.filter(b => b.kind === 'missing').length > 0 && (
                                <>Still needs: {blockers.filter(b => b.kind === 'missing').map(b => b.text).join(', ')}</>
                            )}
                            {blockers.filter(b => b.kind === 'problem').map((b, i) => (
                                <span className="mentor-panel__problem" key={i}>Doesn’t add up: {b.text}</span>
                            ))}
                        </span>
                    )}
                    {/* A refusal with nothing to name would be a dead button. It can only happen if
                        the server grows a reason it doesn't report, so say that rather than nothing. */}
                    {!ready && blockers.length === 0 && (
                        <span className="mentor-panel__missing">Not ready yet — ask Mentor what’s outstanding.</span>
                    )}
                    {ready && <span className="mentor-panel__missing">Generates as <em>waiting</em> — arm it to start monitoring.</span>}
                </div>
            )}

            {/* Generated but not armed: the setup exists and is NOT being watched. This is the one
                moment that has to be unmissable, so it gets its own step rather than a toast. */}
            {!chat.isLoading && generated && (
                <div className="portfolio-panel__action-bubble mentor-panel__armed">
                    <p className="mentor-panel__armed-copy">
                        <strong>{generated.asset}</strong> saved as <em>waiting</em> — nothing is watching it yet.
                    </p>
                    <button className="portfolio-panel__review-btn portfolio-panel__review-btn--update mentor-panel__btn" onClick={handleArm} disabled={busy}>
                        {busy ? 'Arming…' : 'Arm it — start monitoring'}
                    </button>
                    <button className="portfolio-panel__review-btn portfolio-panel__review-btn--later mentor-panel__btn" onClick={() => { handleClear(); onGenerated?.() }}>
                        Leave it waiting
                    </button>
                </div>
            )}

            {!chat.isLoading && isEditing && (
                <div className="portfolio-panel__action-bubble">
                    {editDirty && (
                        <button className="portfolio-panel__review-btn portfolio-panel__review-btn--update mentor-panel__btn" onClick={handleGenerate} disabled={!ready || busy}>
                            {accounts.length === 0 ? 'Mark an account to update' : 'Update setup'}
                        </button>
                    )}
                    <LaterButton
                        className={`${LATER_BTN_CLASS} mentor-panel__btn`}
                        onClick={() => { handleClear(); onEditDone?.() }}
                    />
                </div>
            )}

            <AgentChatInput
                chat={chat}
                placeholder="A ticker, a direction and a horizon — plus your levels if you have them (Enter to send)"
                onSend={_send}
                onClear={handleClear}
                onResume={_continue}
                clearLocked={isEditing}
            />
        </div>
    )
}

MentorPanel.propTypes = {
    pipeline:            PropTypes.string,
    onLoadingChange:   PropTypes.func,
    onGenerated:       PropTypes.func,
    onPendingSetup:    PropTypes.func,
    chatRestore:       PropTypes.object,
    seed:              PropTypes.object,
    inbox:             PropTypes.object,
    editingSetupId:    PropTypes.string,
    onEditDone:        PropTypes.func,
    availableAccounts: PropTypes.array,
    selectedAccounts:  PropTypes.array,
    mainAccountId:     PropTypes.string,
    resumeRef:         PropTypes.object,
}
