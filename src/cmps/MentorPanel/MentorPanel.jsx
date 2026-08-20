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
import { SetupForm } from '../SetupForm/SetupForm.jsx'
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

// THREE OPENING MOVES, and the third is not a sentence.
//
// Two ways to arrive at this desk: with a name and a rough idea, which is a thing to say, or with
// the plan already written, which is a thing to DO. The express form used to hang below the chips as
// its own dashed block — a second kind of button for what is really a third way to start.
//
// The row itself is the shared one every desk uses (SuggestionChips, Axl's). Mentor had a private
// copy of the markup and the styling, which is how a desk ends up looking like a different app.
const SUGGESTIONS = [
    'I want to buy NVDA on a pullback',
    "I'm thinking of shorting TSLA this week",
]

// How long the express form is kept mounted after something closes it, so its exit can play. Must
// match the `setup-form-out` animation in SetupForm.scss — shorter and it is cut off, longer and the
// panel sits on a form nobody can see. Under prefers-reduced-motion the animation is suppressed and
// this becomes a brief, harmless delay rather than a wait for nothing visible.
const FORM_EXIT_MS = 170

const MessageBubble = ({ msg }) => <ChatBubble msg={msg} />

export function MentorPanel({
    onLoadingChange, onGenerated, onPendingSetup,
    chatRestore = null, seed = null, inbox = null, editingSetupId = null, onEditDone,
    availableAccounts = [], selectedAccounts = [], mainAccountId = null, resumeRef = null,
    // A keyed one-shot from MainPage: open the express form on a plan drawn elsewhere
    // ({ blueprint, locked, note, drawnAt, from, key }). See SETUP_FORM_OPEN.
    openForm = null,
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
    // The EXPRESS FORM, when it is open: { blueprint, locked, note, drawnAt, from, key }.
    //
    // Its own state rather than a mode of the worksheet, because it is not one — the worksheet
    // renders what the CONVERSATION has built, and the form is the user typing a plan that owes the
    // conversation nothing. Opened by the button here, by the `open_setup_form` tool mid-turn, or
    // (later) by a shared setup's card. `key` makes each open a fresh hydrate.
    const [setupForm,    setSetupForm]    = useState(null)
    // Playing its exit. The form is a MODE covering the whole panel, so appearing and vanishing on a
    // single frame reads as the desk breaking rather than as a surface opening — it has to be kept
    // mounted for the length of that animation.
    const [formLeaving,  setFormLeaving]  = useState(false)
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
    // The pending unmount. A ref because it is cleared from two places (a re-open, and the panel
    // going away) and neither should re-render to do it.
    const exitTimerRef = useRef(null)
    useEffect(() => () => clearTimeout(exitTimerRef.current), [])

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

    // A plan from outside the desk — an agent's `open_setup_form`, or a setup someone shared.
    // Keyed, so one hand-off is one opening however often the panel re-renders.
    useEffect(() => {
        if (openForm?.key) openSetupForm(openForm)
    }, [openForm?.key])   // eslint-disable-line react-hooks/exhaustive-deps

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
            // `onSetupForm` acts DURING the turn, not on `done`: the point of the form is that it is
            // already open when the sentence announcing it lands.
            handlers: { onCoverage: setCoverage, onSetupForm: openSetupForm },
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
        // Clear is a RESET, not a close: the whole desk goes at once, so animating one piece of it
        // out would be the only thing that lingered.
        clearTimeout(exitTimerRef.current)
        setSetupForm(null)
        setFormLeaving(false)
        // Clear is not walking away — the draft goes with the conversation. See clearThread.
        clearThread(threadIdRef)
    }

    /**
     * Open the express form. ONE door for all three ways in — the button below, the
     * `open_setup_form` tool mid-turn, and (once sharing lands) a setup someone sent you.
     *
     * `key` changes on every open so the form re-hydrates rather than reusing what it had; the
     * blueprint/draft objects are SNAPSHOTTED into state here so their identity is stable while it
     * is open, which is what keeps its open effect from re-firing on every panel render.
     *
     * A live draft is passed as `draft`, not as a blueprint: hydration strips quantities — that is
     * what makes a blueprint portable — and a user who asks for the form mid-build must not watch
     * sizes already on their screen vanish as it opens.
     */
    function openSetupForm({ prefill = null, note = null, blueprint = null, locked = [], drawnAt = null, from = null } = {}) {
        setCandidates(null)   // an offer and a form are two different asks
        setGenerated(null)
        // Re-opening during an exit cancels it. Without this the pending timer fires a moment later
        // and unmounts the form that was just opened.
        clearTimeout(exitTimerRef.current)
        setFormLeaving(false)
        // A BLUEPRINT WINS OVER THE LIVE DRAFT. It is a whole plan that arrived from somewhere else
        // — an agent's, or another user's — and folding it into whatever this conversation happened
        // to have built would open the form on a third setup that nobody authored. The live draft is
        // only the base when the caller brought no plan of its own (the button, or a bare prefill).
        const draft = (!blueprint && pendingSetup) ? { ...pendingSetup, ...(prefill ?? {}) } : null
        setSetupForm({
            blueprint: draft ? null : (blueprint ?? prefill ?? null),
            draft,
            locked, note, drawnAt, from,
            key: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        })
    }

    /**
     * The form is filled — hand the plan to Mentor to draw its bands.
     *
     * The typed draft becomes the live worksheet FIRST and is passed through explicitly, so the turn
     * carries it in `chatState.draft` (the state set here has not re-rendered yet — see `_send`).
     * Mentor re-emits the complete setup with real zones and a named lens, `_applyDone` replaces the
     * worksheet with it, and the ordinary Generate button takes it from there. Nothing is saved by
     * this: the user sees what Mentor made of their numbers before committing.
     *
     * SENT AS THE USER'S OWN WORDS, the way every other hand-off at this desk is (useSeedTurn: "the
     * words are the user's, the hand-off just says them for them"). A silent instruction would leave
     * the conversation with a reply to a turn that appears never to have happened.
     */
    async function handleFormHandoff(typed, { timeframes = [] } = {}) {
        if (!typed || chat.isLoading) return
        closeSetupForm()
        setPendingSetup(typed)
        setPreviewOpen(true)
        setCandidates(null)
        setGenerated(null)
        setEditDirty(true)

        // NO USER TURN. The instruction is composed on the SERVER (buildExpressHandoffPrompt) and
        // appended to the wire there, so nothing is attributed to the user, nothing enters their
        // history, and a fixed sentence cannot end up contradicting whatever they actually typed a
        // moment earlier. `silent` is the display half of the same decision.
        const history = toChatHistory(messages)

        await chat.run('', {
            log: '[mentor]',
            silent: true,
            handlers: { onCoverage: setCoverage },
            onStopped: () => _persist(history, null, typed),
            onDone: (data) => {
                chat.finishStreaming({ role: 'assistant', content: data.reply })
                _persist(history, data.reply, _applyDone(data, typed))
            },
            send: ({ signal, handlers }) => mentorService.sendStream(history, {
                ...streamOpts(typed),
                expressHandoff: { timeframes },
                signal,
                ...handlers,
            }),
        })
    }

    /**
     * Dismiss the form, letting it play its exit first.
     *
     * ONE closer for every way out — the ×, handing over to Mentor, and Generate landing — because
     * the form covering the whole panel means each of them is the same visual event: a surface
     * leaving. Three call sites setting state directly would have been three different exits, two of
     * them accidental.
     *
     * The conversation underneath does not return until the timer fires, which is what makes it a
     * transition rather than a cut.
     */
    function closeSetupForm() {
        if (!setupForm) return
        setFormLeaving(true)
        clearTimeout(exitTimerRef.current)
        exitTimerRef.current = setTimeout(() => {
            setSetupForm(null)
            setFormLeaving(false)
        }, FORM_EXIT_MS)
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
     * Save the draft. `draft` is passed by the EXPRESS FORM, which owns its own copy — the form is
     * not the worksheet and never writes into `pendingSetup`, so a plan typed there would otherwise
     * be saved as whatever the conversation happened to have built.
     */
    async function handleGenerate(draft = pendingSetup) {
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
            // The form's job is done the moment the setup exists — what comes next (Arm, or
            // deliberately not arming) belongs to the panel's own step, which is the one place that
            // distinction is made visible.
            closeSetupForm()
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
            {/* THE EXPRESS FORM IS THE WHOLE PANEL while it is open — not a section above the
                conversation, the only thing there is.

                It used to sit on top with the chat still running underneath, which read as two
                surfaces describing one setup and left the user to work out which was real. It is
                also the same conflict the hand-off had, one layer up: a half-filled form above a
                live conversation is two ways to say one thing, with nothing to decide which wins.

                So it is a MODE. Closing it (the ×, or Generate landing) puts the desk back exactly
                as it was — the conversation is hidden, never cleared, because opening the form is
                not leaving Mentor. */}
            {setupForm ? (
                <SetupForm
                    key={setupForm.key}
                    blueprint={setupForm.blueprint}
                    draft={setupForm.draft}
                    locked={setupForm.locked}
                    note={setupForm.note}
                    drawnAt={setupForm.drawnAt}
                    from={setupForm.from}
                    accounts={accounts}
                    busy={busy}
                    onGenerate={handleGenerate}
                    onHandoff={handleFormHandoff}
                    handoffLabel="Continue to Mentor"
                    leaving={formLeaving}
                    onCancel={closeSetupForm}
                    generateLabel={isEditing ? 'Update setup' : 'Generate setup'}
                />
            ) : (
            <>

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
                        {/* The mid-build door. The intro button is gone by now — it lives inside the
                            empty-conversation intro — and without this the only way to reach the form
                            once you have started talking is to spend a whole turn asking the agent
                            for it. This one opens on the LIVE draft (openSetupForm passes it as
                            `draft`, not as a blueprint), so nothing already on screen is lost. */}
                        {hasPreview && !generated && (
                            <button
                                type="button" className="mentor-panel__express mentor-panel__express--inline"
                                onClick={() => openSetupForm()}
                                title="Edit the whole setup as a form — type them straight in, no conversation."
                            >
                                edit as form
                            </button>
                        )}
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
                        {/* The third chip is the way in for someone who is not here to talk. A
                            CHIP and not a model turn: `open_setup_form` exists for the user who says
                            it in words, but making the express path cost ten seconds and a reply to
                            open a form is the opposite of express. Both doors end at openSetupForm. */}
                        <SuggestionChips
                            variant="intro"
                            disabled={chat.isLoading}
                            onPick={_send}
                            suggestions={[
                                ...SUGGESTIONS,
                                {
                                    label:  'I already have the exact setup →',
                                    title:  'Entry, stop, targets, size — type them straight in. No conversation.',
                                    action: true,
                                    onPick: () => openSetupForm(),
                                },
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

            {/* THE FORM IS THE INPUT WHILE IT IS OPEN, so the chat box goes away rather than sitting
                under it greyed out.
                Two ways to say the same thing at once is the conflict we just took out of the
                hand-off: a sentence typed here while a half-filled form sits above it gives Mentor a
                plan and a contradiction of it in the same turn, and nothing decides which wins. The
                form has its own way out — Continue, or the × that closes it — so this is a mode with
                a door, not a trap.

                REMOVED, not disabled: a dead input invites you to try, and having tried, to wonder
                what is broken. */}
            <AgentChatInput
                chat={chat}
                placeholder="A ticker, a direction and a horizon — plus your levels if you have them (Enter to send)"
                onSend={_send}
                onClear={handleClear}
                onResume={_continue}
                clearLocked={isEditing}
            />
            </>
            )}
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
