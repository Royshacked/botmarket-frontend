import { useState, useRef, useEffect } from 'react'
import PropTypes from 'prop-types'
import { mentorService } from '../../services/mentor/mentor.service.remote.js'
import { threadsService, newThreadId, clearThread } from '../../services/threads/threads.service.remote.js'
import { ChatBubble } from '../ChatBubble.jsx'
import { readStoredModel } from '../modelOptions.js'
import { useChatStream, toChatHistory, withoutPrefill } from '../../customHooks/useChatStream.js'
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
import { SetupSummary, setupDigest } from './SetupSummary.jsx'
import { CandidatePicker } from './CandidatePicker.jsx'
import { SuggestionChips } from '../SuggestionChips.jsx'
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

// TWO OPENING MOVES, and both of them are sentences.
//
// There used to be a third that was not: an EXPRESS FORM, a whole-panel worksheet for the user who
// arrived with the plan already made and did not want it drawn out of them a question at a time.
// It was deleted (2026-08-21) because the premise was wrong — that user does not want a different
// SURFACE, they want a shorter conversation. Mentor INTERVIEWS them for it instead: one question,
// one answer, skipping everything they already said, and it draws the bands from the answers (see
// "The interview" in mentor_system_prompt.md). A plan typed in full in the opening line is taken
// whole and asked nothing.
//
// So there is no mode here and nothing covering the chat. The row below is the shared one every
// desk uses (SuggestionChips, Axl's); Mentor had a private copy of the markup and the styling,
// which is how a desk ends up looking like a different app.
const SUGGESTIONS = [
    'I want to buy NVDA on a pullback',
    "I'm thinking of shorting TSLA this week",
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
    // The worksheet is a REFERENCE you glance up at, not the work — and it grows past a screen once
    // there are two ways in. So it opens FOLDED to its one-line digest and expands on request; the
    // choice sticks for the conversation, because a preview that re-collapsed on every turn would
    // be unreadable exactly when the setup is moving.
    const [previewOpen,  setPreviewOpen]  = useState(false)

    const threadIdRef = useRef(newThreadId())
    // The Argus candidate awaiting its turn. A ref, not state: it must ride the very send that the
    // hand-off effect fires, and a setState would not be readable until the render after.
    const seedRef     = useRef(null)

    const isEditing = !!editingSetupId
    const accounts  = availableAccounts.filter(a => selectedAccounts.includes(a.id))

    useEffect(() => { onPendingSetup?.(pendingSetup) }, [pendingSetup])   // eslint-disable-line react-hooks/exhaustive-deps

    // Edit pencil pushed a keyed restore: reopen the build conversation with its draft.
    //
    // `ask` is what tells the two doorways apart. The PENCIL sends none — the user chose to edit and
    // the desk has nothing to say until they say something. A CARD sends one, because a monitor
    // raised its hand and arriving to a silent desk is what made "Re-draw it" feel like a dead
    // button. Both restore the same conversation; only one of them opens the turn.
    //
    // The restored history and draft are passed to `_send` EXPLICITLY rather than left to the state
    // set two lines above: this is an effect, so neither has re-rendered yet (see _send's `base`).
    useEffect(() => {
        if (!chatRestore) return
        const restored = chatRestore.messages ?? []
        const draft    = chatRestore.setup ?? null
        const cov      = chatRestore.coverage ?? []
        chat.setMessages(restored)
        setPendingSetup(draft)
        setCoverage(cov)
        setCandidates(null)
        setGenerated(null)
        setEditDirty(false)
        setPreviewOpen(false)
        if (chatRestore.ask) _send(chatRestore.ask, draft, restored, cov)
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
    const streamOpts = (draft = pendingSetup, cov = coverage) => {
        // One-shot: the hand-off turn carries it, every turn after has it in the history. Read and
        // cleared together so a second send cannot re-announce a name as newly handed over.
        const candidate = seedRef.current; seedRef.current = null
        return {
            model:           readStoredModel(),
            accounts,
            mainAccountId,
            chatState: { active_asset: draft?.asset || candidate?.ticker || '', draft, coverage: cov },
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

    // `reply` null = the turn was STOPPED (useChatStream's onStopped). What is saved is then the
    // user's message and the turns completed before it — there is no assistant turn to append, and
    // an empty bubble would come back on resume as a reply Mentor never gave.
    function _persist(history, reply, setup) {
        const msgs = reply == null ? history : [...history, { role: 'assistant', content: reply }]
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
    //
    // `base` is the same escape hatch for the CONVERSATION, and the restore below is the only caller
    // that needs it. An effect runs before React re-renders, so a caller that has just handed
    // `chat.setMessages` a restored history still reads the OLD `messages` here — which for a
    // re-draw means shipping the turn with either nothing behind it or, worse, the previous
    // setup's conversation. The display is safe either way (`begin` appends functionally); it is
    // the history sent to the model that has to be passed through. `cov` is the third of the same
    // set — coverage is the dimensions READ so far, so the previous setup's chips would tell Mentor
    // it had already looked at things it has not looked at for this one.
    async function _send(text, draft = pendingSetup, base = messages, cov = coverage) {
        setEditDirty(true)
        setCandidates(null)   // a new user turn supersedes any pending offer
        setGenerated(null)

        const history = toChatHistory(base)
        history.push({ role: 'user', content: text })

        await chat.run(text, {
            log: '[mentor]',
            handlers: { onCoverage: setCoverage },
            // Stopped mid-answer: keep the conversation anyway (see _persist).
            onStopped: () => _persist(history, null, draft),
            onDone: (data) => {
                chat.finishStreaming({ role: 'assistant', content: data.reply })
                _persist(history, data.reply, _applyDone(data, draft))
            },
            send: ({ signal, handlers }) => mentorService.sendStream(history, { ...streamOpts(draft, cov), signal, ...handlers }),
        })
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
                _persist(withoutPrefill(history), content, _applyDone(data, pendingSetup))
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
        setPreviewOpen(false)
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

    /**
     * Save the worksheet.
     *
     * TAKES NO ARGUMENT, and that is load-bearing. It used to accept a `draft` override for the
     * express form, which owned a copy of the plan the conversation had never seen. The form is
     * gone and both remaining call sites are `onClick={handleGenerate}` — which hands a React
     * SYNTHETIC EVENT to the first parameter. An event is truthy, so the `!draft` guard waved it
     * through and the server was posted a DOM node: it threw, the catch logged, and the button did
     * nothing at all. The bug was invisible for as long as the form was the way people generated.
     *
     * So the plan is read from state here and nowhere else. A future caller that genuinely needs to
     * save something other than `pendingSetup` should set it first, the way handlePickCandidate does.
     */
    async function handleGenerate() {
        const draft = pendingSetup
        if (!draft || accounts.length === 0 || busy) return
        setBusy(true)
        try {
            const state = { messages: persistedMessages(), draft, coverage }
            const saved = isEditing
                ? await mentorService.updateSetup(editingSetupId, draft, accounts, mainAccountId, state)
                : await mentorService.generateSetup(draft, accounts, mainAccountId, state)

            // AWAITED: arming (or leaving it waiting) ends the desk run, which deletes its remaining
            // DRAFTS — and this thread is one of them until the link lands. The Arm click is a human
            // beat away, so the race is unlikely rather than impossible; ordering it is free.
            if (!isEditing && saved?.id) {
                await threadsService.linkThread(threadIdRef.current, { subjectType: 'setup', subjectId: saved.id, artifactName: draft.asset ?? null })
                threadIdRef.current = newThreadId()
            }
            // Deliberately NOT returning to the hub yet: the setup exists but is not monitored, and
            // that distinction is invisible unless we stop here and offer Arm explicitly.
            setGenerated(saved)
            if (isEditing) { handleClear(); onEditDone?.() }
        } catch (err) {
            // SAY SO. A silent catch here is what let the event-as-draft bug above live: the button
            // looked pressed, the console had the reason, and the user had nothing. Generate is the
            // moment a plan becomes a document — a refusal has to reach the person pressing it, the
            // same way Arm's does.
            console.error('[mentor] generate', err)
            window.alert(`Couldn't ${isEditing ? 'update' : 'generate'} this setup: ${err?.message || 'unknown reason'}`)
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
                <div className={`portfolio-panel__build-summary mentor-panel__build${previewOpen ? ' is-open' : ''}`}>
                    <div className="mentor-panel__build-head">
                        {/* WHICH setup, when there is a particular one. Editing used to be invisible:
                            this read "your setup" in both modes, so the only difference between
                            re-drawing AVGO and starting fresh was that Generate had disappeared — a
                            desk that looks broken rather than a desk that is in a mode.

                            The whole line is the fold's handle when there is something to unfold —
                            a caret alone is a smaller target than the thing it describes. With only
                            coverage chips and no draft yet there is nothing to open, so it stays a
                            plain label rather than a button that does nothing. */}
                        {hasPreview ? (
                            <button
                                type="button"
                                className="mentor-panel__build-toggle"
                                onClick={() => setPreviewOpen(open => !open)}
                                aria-expanded={previewOpen}
                                title={previewOpen ? 'Fold the setup away' : 'Open the full setup'}
                            >
                                <span className="mentor-panel__build-caret" aria-hidden="true">{previewOpen ? '▾' : '▸'}</span>
                                <span className="portfolio-panel__build-summary-title">
                                    {isEditing ? `editing ${pendingSetup?.asset ?? 'this setup'}` : 'your setup'}
                                </span>
                                {/* Folded, this line IS the preview — so it carries what you would
                                    otherwise open it to check. */}
                                {!previewOpen && <span className="mentor-panel__build-digest">{setupDigest(pendingSetup)}</span>}
                            </button>
                        ) : (
                            <span className="portfolio-panel__build-summary-title">
                                {isEditing ? `editing ${pendingSetup?.asset ?? 'this setup'}` : 'your setup'}
                            </span>
                        )}
                        <CoverageChips coverage={coverage} />
                    </div>
                    {hasPreview && previewOpen && (
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
                        {/* Every chip is a SENTENCE now, including the one for the user who already
                            has the plan — it opens the interview instead of a form, and Mentor asks
                            only for what that opening line did not already say. */}
                        <SuggestionChips
                            variant="intro"
                            disabled={chat.isLoading}
                            onPick={_send}
                            suggestions={[
                                ...SUGGESTIONS,
                                'I already have the exact setup — take it down',
                            ]}
                        />
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
                    {/* Nothing has changed yet, so there is genuinely nothing to write — but an
                        action bubble whose only button is "I'll do it later" reads as a dead end
                        rather than as a turn waiting to be taken. Say what makes the button appear. */}
                    {!editDirty && (
                        <span className="mentor-panel__missing">Tell Mentor what to change — “Update setup” appears once the plan moves.</span>
                    )}
                    <LaterButton
                        className={`${LATER_BTN_CLASS} mentor-panel__btn`}
                        onClick={() => { handleClear(); onEditDone?.() }}
                    />
                </div>
            )}

            {/* THE ONE INPUT AT THIS DESK, on every path. The express form used to replace it while
                it was open, because a sentence typed under a half-filled form gives Mentor a plan
                and a contradiction of it in the same turn. The interview has no such conflict —
                answering a question IS typing here — so the box never goes away. */}
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
