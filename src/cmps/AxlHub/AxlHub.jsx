import { useState, useRef, useEffect, useCallback } from 'react'
import PropTypes from 'prop-types'
import { useAuth } from '../../context/AuthContext.jsx'
import { BrandTitle } from '../BrandTitle.jsx'
import { AgentSummon } from './AgentSummon.jsx'
import { threadsService, newThreadId, clearThread } from '../../services/threads/threads.service.remote'
import { deskWork, blockedDesks } from './deskWork.js'
import { AgentGlyph } from './AgentBadges.jsx'
import { AGENTS, SUMMON_MS, DESKS, TICKET_DESK } from './agentMeta.jsx'
import { axlService } from '../../services/axl/axl.service.remote'
import { useChatStream, toChatHistory } from '../../customHooks/useChatStream.js'
import { useChatScroll } from '../../customHooks/useChatScroll.js'
import { useMicInput } from '../../customHooks/useMicInput.js'
import { ChatInputRow } from '../ChatInputRow.jsx'
import { SuggestionChips } from '../SuggestionChips.jsx'
import { ChatMarkdown } from '../ChatMarkdown.jsx'
import { ChatReasoning } from '../ChatReasoning.jsx'
import { ToolStatusChip } from '../ToolStatusChip/ToolStatusChip.jsx'
import { waitingLabel } from '../ToolStatusChip/waitingLabel.js'
import { ChatChartDock } from '../ChatChartDock.jsx'
import { ChatChart } from '../ChatChart.jsx'
import { closeChart } from '../../services/chartSurface.service.js'
import { readStoredModel } from '../modelOptions.js'
import './AxlHub.scss'

// ── axl ────────────────────────────────────────────────────────────────────────
// The ONE Axl surface, and where the user lands. Axl greets them, shows the desk
// buttons, and holds a real conversation: it answers app questions, docks charts,
// remembers the thread, and summons a desk when the reply carries a route.
//
// This used to be two screens. The landing box talked to a one-shot `/route`
// doorman — no history, no app knowledge — while the Axl that could actually
// converse sat behind an "or chat with axl" link. So the front door answered
// questions by inventing them, and a follow-up ("give spy" … "now the 4h") had
// nothing to resolve against. One agent, one endpoint, one screen.

function firstName(fullname = '') {
    const n = String(fullname).trim().split(/\s+/)[0]
    return n || ''
}

// ── the landing asks ───────────────────────────────────────────────────────────
// Explaining the app is one of Axl's jobs, and until now nothing ever asked it to: the app-guide
// half of the prompt only fires if the user already knows there is something to ask about, which a
// first-time user does not. These are that ask, made out loud — the same chips Axl offers after a
// reply, seeded before the first one.
//
// They must never answer the question the SEVEN CARDS answer. The cards are places to go ("Trade an
// asset"); these are questions the cards cannot take. A chip that said "find me a trade" would steal
// the click from the card that does it properly, and the grid is the point of this screen.
//
// Written in the user's voice, because a chip sends its text AS the user's next message.
// Each has a section of the prompt behind it: `## What can this app do`/`## How the app works` and
// `## What you can do today`.
const LANDING_ASKS = [
    'What can this app do?',
    'How does it work?',
    'What can you do for me?',
]

// Axl keeps its own bubble rather than the shared ChatBubble — its own SCSS namespace. The waiting
// mark is not its business either way: that renders once, below the thread, like every other desk.
export function MessageBubble({ msg }) {
    // A history-only note (a wordless turn that docked a chart) — nothing for the user to read.
    if (msg.hidden) return null
    // A chart Axl was asked to READ (an agent-rendered still). The live chart the user asked for
    // isn't a message at all — it's docked below the thread.
    if (msg.type === 'chart') return <ChatChart msg={msg} />

    if (msg.role === 'user') {
        return <div className="axl-hub__bubble axl-hub__bubble--user">{msg.content}</div>
    }
    // Before any words land the turn carries no mark of its own — the waiting label renders once,
    // below the thread. Reasoning still belongs to the turn, and shows without the bubble's chrome;
    // with neither there is nothing to draw at all.
    const pending = msg.streaming && !msg.content
    if (pending && !msg.reasoning) return null
    return (
        <div className={`axl-hub__bubble axl-hub__bubble--assistant${pending ? ' axl-hub__bubble--pending' : ''}`}>
            <ChatReasoning reasoning={msg.reasoning} live={pending} streaming={msg.streaming} />
            {!pending && <ChatMarkdown>{msg.content ?? ''}</ChatMarkdown>}
        </div>
    )
}

// The pad's mark — the desks show their agent's glyph, and this one has no agent to show.
function TicketGlyph({ size = 32 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 13V7"  stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M8 13V3"  stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M13 13V9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
    )
}

export function AxlHub({ user, onPick, onOpenTicket, briefRequest = 0, onBriefStart, live = [] }) {
    const name = firstName(user?.fullname)
    const { isAdmin } = useAuth()
    const visibleDesks = DESKS.filter(d => !d.adminOnly || isAdmin)
    const chat = useChatStream()
    const { messages, isLoading } = chat

    const [summoning, setSummoning]       = useState(null)
    const [draft, setDraft]               = useState('')
    // Unfinished work per desk, for the route badges. Loaded on mount, which is every time the user
    // returns from a desk — precisely when it can have changed. Cheap: drafts only, last message only.
    const [unfinished, setUnfinished] = useState([])
    // Re-read when a background turn ENDS, as well as on mount. A desk left mid-answer goes on
    // streaming while the user stands here, and its draft is written when the reply lands — after
    // the mount fetch has already been and gone. Without this the route went quiet at the exact
    // moment it had something to say. Keyed on the live set, so it costs one read per turn ending.
    const liveKey = live.map(w => `${w.agent}:${w.pipeline ?? ''}`).sort().join('|')
    useEffect(() => { threadsService.listUnfinished().then(setUnfinished) }, [liveKey])

    // ── the reception conversation, persisted ─────────────────────────────────
    // Axl's thread is a DRAFT THREAD like every desk's — the same threadsService, the same store,
    // the same TTL and LRU cap. It had none, and was the only chat surface in the app without one:
    // this panel is rendered only while the axl tab is active (MainPage), so walking to a desk
    // UNMOUNTS it and its messages are React state. Every desk visit and every reload started Axl
    // from nothing while the user still had the conversation in mind — which is what "Axl forgets
    // what we were talking about" actually was.
    //
    // `pipeline: null`, deliberately, and it is what keeps this out of the desk UI: deskOfThread
    // falls back to the desks entering at this agent and none enters at `axl`, so it badges no
    // route; blockedDesks skips any thread with no pipeline, so it locks no door. See deskWork.js.
    const threadIdRef  = useRef(newThreadId())
    const lastSavedRef = useRef(null)
    const restoredRef  = useRef(false)
    // Live mirror of the thread, so a restore that lands LATE can ask what is on screen NOW rather
    // than what was there when it was requested — the read inside the fetch's `.then` is a closure
    // over the render that started it, and by then the user may have typed.
    const liveThreadRef = useRef(messages)
    liveThreadRef.current = messages

    // Written on SETTLED messages rather than from a turn's onDone, which is where the desks write.
    // Two things live here that onDone cannot see. The hidden chart note is appended inside
    // finishStreaming's typewriter drain, AFTER onDone has returned — and that note is the whole
    // reason "now the 4h" resolves, so a payload built in onDone would persist a thread that forgets
    // which chart is up. And the paths that never reach onDone at all — the market brief, a stopped
    // turn, a frozen error — are conversations too. The MECHANISM is still the shared saveDraft;
    // only the write trigger differs, the same split the threads controller already documents.
    useEffect(() => {
        if (isLoading || messages === lastSavedRef.current) return
        // Display-only rows are not conversation: a chart bubble carries an image and no text, and a
        // phase row is a divider. Everything else is kept AS THE OBJECT — `hidden` and `reasoning`
        // have to survive the round trip, and MessageBubble already skips a hidden one.
        const persistable = messages.filter(m => !m.streaming && m.role !== 'phase' && m.type !== 'chart')
        // Nothing said back yet — the server floor passes every axl save on the understanding that
        // the client only asks once a reply exists (thread.util.js isSubstantive).
        if (!persistable.some(m => m.role === 'assistant')) return
        lastSavedRef.current = messages
        _saveThread(persistable)
    }, [messages, isLoading])

    /** The one write. Both callers below go through it, so `agent` and `pipeline` are stated once. */
    function _saveThread(msgs) {
        threadsService.saveDraft({ threadId: threadIdRef.current, agent: 'axl', messages: msgs, pipeline: null })
    }

    // Is this panel still on screen? An effect cannot run once it is not, and walking to a desk
    // UNMOUNTS this whole hub — which is the commonest way to leave reception: ask something, lose
    // patience, click a desk while it is still answering. The turn goes on streaming (nothing aborts
    // it), so the desks' own saves still land: they are plain calls inside a promise chain, which
    // outlives the component. The effect above is not, so the walk-out is the one ending it cannot
    // see, and it is the ending this whole feature exists for.
    // Set on the way IN as well as out, which is not belt-and-braces: an effect that only ever
    // clears the flag is left permanently false by a setup→cleanup→setup cycle (StrictMode does
    // exactly that in dev), and every turn would then take the walk-out path AND the effect — two
    // writes for one turn, on the busiest desk in the app.
    const mountedRef = useRef(true)
    useEffect(() => {
        mountedRef.current = true
        return () => { mountedRef.current = false }
    }, [])

    // Restore on arrival, off the unfinished list this hub already fetches — the axl draft is a row
    // in it, so this costs one read of the thread and no second listing call.
    //
    // Guarded three ways because that fetch re-runs on `liveKey`: once only (restoredRef), and never
    // over a conversation already on screen or a turn in flight, so a slow restore cannot overwrite
    // what the user is in the middle of typing.
    useEffect(() => {
        if (restoredRef.current || isLoading || messages.length) return
        const mine = unfinished.find(t => t.agent === 'axl')
        if (!mine) return
        restoredRef.current = true
        const openedOn = threadIdRef.current
        threadsService.getThread(mine.threadId).then(t => {
            if (!t?.messages?.length) return
            // Asked AGAIN on arrival, not only before the request: a read the user out-typed must
            // lose. Restoring over a question they have already asked would delete it from the
            // screen and answer the old conversation instead.
            if (liveThreadRef.current.length) return
            // And Clear mints a fresh id — so an id that moved while this was in flight means the
            // user threw the conversation away mid-read, and it must not walk back in.
            if (threadIdRef.current !== openedOn) return
            const restored = t.messages
            lastSavedRef.current = restored      // it came FROM the store; don't post it straight back
            chat.setMessages(restored)
            threadIdRef.current = t.threadId     // keep writing to the SAME thread, not a fork of it
        })
    }, [unfinished]) // eslint-disable-line react-hooks/exhaustive-deps

    // Which desks are closed because another desk is holding an agent they need. A panel is a
    // singleton, so entering the scan desk while a portfolio build is parked at Argus would clobber the
    // run — the door closes and says so, rather than letting the user create an impossible state.
    const blocked = blockedDesks(unfinished, DESKS)

    const [pendingRoute, setPendingRoute] = useState(null)   // { desk, symbol, opening, edit, adopt } — the hand-off
    // Follow-ups Axl offered on the LAST turn. Latest turn only: they answer "what now", and a
    // question from four turns ago is not that. Cleared the moment anything is sent.
    const [suggestions, setSuggestions] = useState([])
    const [hoveredDesk, setHoveredDesk]   = useState(null)
    const timerRef  = useRef(null)
    const inputRef  = useRef(null)

    const { messagesRef, messagesEndRef, handleScroll } = useChatScroll(messages)

    useEffect(() => () => clearTimeout(timerRef.current), [])

    // Once Axl's reply has finished streaming, pause briefly so the user can read it, then start
    // the summon animation to the desk it routed them to.
    useEffect(() => {
        if (!pendingRoute || isLoading) return
        const t = setTimeout(() => {
            const { desk, ...hand } = pendingRoute
            _summon(desk, hand)
            setPendingRoute(null)
        }, 900)
        return () => clearTimeout(t)
    }, [pendingRoute, isLoading]) // eslint-disable-line react-hooks/exhaustive-deps

    // `symbol` is the name Axl already has from the conversation, riding along with the desk so the
    // first agent opens ON it instead of asking for a ticker the user just gave. A desk the user
    // picked by BUTTON carries none — that click says which desk, not which name.
    // `edit` ({ kind, ref }) is the other kind of hand-off: not "open this desk" but "reopen this
    // item at it". The summon animation is identical — the user is still being taken to an agent —
    // but the desk's entryTab is only a fallback from here on: the item picks its own tab (a call is
    // edited in Kairos, though the trading desk ENTERS at Argus), which the host resolves.
    // `opening` is what the user said they came for, in their own words. It is sent at the desk as
    // THEIR first message, which is the whole hand-off: Axl works out where they belong, and the
    // sentence goes with them so the desk starts on the job instead of asking what brought them.
    // `adopt` says the portfolio desk must open on a book that ALREADY EXISTS somewhere else. It is a
    // mode, not a destination, which is why it rides beside the desk rather than being one.
    // `resume` is the unfinished thread being walked back into — the whole thread, not just its id,
    // because WHERE it opens is part of the answer (see the tab below).
    function _summon(desk, { symbol = null, edit = null, opening = null, adopt = false, resume = null } = {}) {
        setSummoning(desk)
        // A resumed conversation opens where it was LEFT, not where the desk starts. `entryTab` is the
        // front door — right for a fresh arrival, wrong for a walk-back: the trade desk enters at
        // Argus, so resuming a Mentor thread through it dropped the user at the end of a scan they
        // were already finished with, and handed a Mentor threadId to Argus's panel besides.
        const tab = (resume ? AGENTS[resume.agent]?.tab : null) ?? desk.entryTab
        timerRef.current = setTimeout(
            () => onPick(tab, {
                pipeline: desk.key, symbol,
                ...(edit ? { edit } : {}), ...(opening ? { opening } : {}), ...(adopt ? { adopt: true } : {}),
                ...(resume ? { resumeThreadId: resume.threadId } : {}),
            }),
            SUMMON_MS,
        )
    }

    /**
     * What a desk route says about work left there. Rendered on both surfaces, because a user who left
     * something unfinished has to see it wherever the routes are shown — otherwise the one that
     * happens to be visible lies by omission.
     *
     * `your turn` is a different weight from a plain count and looks different: one is something to do,
     * the other is something in progress.
     */
    /**
     * What a closed door says. Never a bare disabled control: a greyed route with no explanation is the
     * worst version of this feature, because the user cannot tell a bug from a rule.
     */
    function deskLockTitle(desk) {
        const holder = blocked.get(desk.key)
        if (!holder) return null
        const owner = DESKS.find(d => d.key === holder.thread.pipeline)
        // The agent by its BRAND, which is the only name the user has ever seen it under — the raw key
        // ("is using mentor") names an internal id at them. This title carries the whole explanation
        // now that the card no longer responds to a click, so it has to read like a sentence.
        const agent = AGENTS[holder.agent]?.brand ?? holder.agent
        return `${owner?.label ?? 'Another desk'} is using ${agent} — go there to finish or clear it`
    }

    /**
     * A SIGNAL that something was left here — not a tally of it.
     *
     * It counted drafts first, which read as noise: the number answered a question nobody asked ("how
     * many?") while burying the one that matters ("is there something I walked out of?"). And since
     * clicking the route now picks the conversation up, a count would not even be actionable — there is
     * one thing to resume, whatever the number.
     *
     * It says it in WORDS. A pulsing dot beside a greyed-out row is a symbol the user has to decode,
     * and next to the closed doors it reads as decoration rather than state — the one thing on the
     * screen that is actually still going should be the one thing that says so.
     *
     * `your turn` stays a separate word: something waiting on an ANSWER is a different thing from
     * something still running, and must not read as ambient.
     */
    function deskBadge(desk) {
        // DESKS is passed so a thread that named no pipeline still finds its home desk — see
        // deskOfThread. Without it a chat opened straight at a tab would be marked nowhere.
        //
        // LIVE TURNS COUNT HERE and nowhere else. A turn still streaming is work left at that desk in
        // every sense the user means — but it is not resumable (there is no thread to open yet) and
        // it must not close another desk's door, so `resumableThread` and `blockedDesks` go on
        // reading the saved drafts alone.
        const { count, yourTurn } = deskWork([...live, ...unfinished], desk, DESKS)
        if (!count) return null
        return (
            <span
                className={`axl-hub__desk-flag${yourTurn ? ' is-turn' : ''}`}
                title={yourTurn
                    ? 'Waiting for you — pick up where you left off'
                    : 'Unfinished — pick up where you left off'}
            >
                {yourTurn ? 'Your turn' : 'Working..'}
            </span>
        )
    }

    /** Is a turn streaming at this desk right now? Filed by the same rule as a saved draft. */
    function isLive(desk) {
        return deskWork(live, desk, DESKS).count > 0
    }

    /** The conversation this desk would pick up: its newest unfinished one. */
    function resumableThread(desk) {
        // `unfinished` arrives newest-first from the server, so the first match is the one the user was
        // most recently in — which is what "where I left off" means to them. On the trade desk that is
        // the Mentor thread, not the Argus one they walked past to reach it.
        return deskWork(unfinished, desk, DESKS).threads[0] ?? null
    }

    function handleDeskPick(desk) {
        if (summoning || isLoading) return
        // A closed door does not open. The panel behind it is a singleton and another desk is holding
        // the agent, so entering would clobber a run the user has not finished. The card carries the
        // reason (deskLockTitle) — the click itself has nothing to add.
        if (blocked.has(desk.key)) return
        // Left something here → walk back INTO it. Going to a blank desk and making the user find the
        // conversation in a drawer is a step too many when the route already knows which one it is.
        // …unless a turn is streaming there NOW. Resuming replaces the panel's conversation with the
        // saved one, and the running turn is not in it yet — so walking back into a desk mid-answer
        // would overwrite the answer with the state from before it was asked for. Open it; the live
        // conversation is already on screen behind the tab.
        const resume = isLive(desk) ? null : resumableThread(desk)
        _summon(desk, resume ? { resume } : {})
    }

    // The pad opens straight away — there is no agent to summon, and a wait would sit between
    // the user and a market order, which is the one thing this route exists to avoid.
    function handleTicketPick() {
        if (summoning || isLoading) return
        setHoveredDesk(null)
        onOpenTicket?.()
    }

    function handleSend() {
        const trimmed = draft.trim()
        if (!trimmed || isLoading) return
        setDraft('')
        _send(trimmed)
    }

    async function _send(text) {
        setSuggestions([])          // the offer is spent the moment anything is sent

        const history = toChatHistory(messages)
        // What this turn leaves behind if the user walks out of it — see `onSettled` below.
        const turn = [...history, { role: 'user', content: text }]
        let answered = null
        await chat.run(text, {
            log: '[axl]',
            errorMessage: 'Error communicating with Axl. Please try again.',
            // However this turn ended, and whether or not this panel is still here to see it. On the
            // mounted path the effect above has already saved the richer version — the hidden chart
            // note, the reasoning — so this only writes when there is nobody left to run an effect.
            // Without it, the question the user got impatient with is the one that vanishes.
            onSettled: () => {
                if (mountedRef.current) return
                _saveThread(answered ? [...turn, { role: 'assistant', content: answered }] : turn)
            },
            onDone: (data) => {
                answered = data.reply
                const reasoning = chat.reasoningRef.current
                chat.finishStreaming({ role: 'assistant', content: data.reply, ...(reasoning ? { reasoning } : {}) })
                // A chart request needs nothing here — the `chart` event already docked it below.
                // A ROUTE means Axl is handing them to a desk: let the reply land, then summon.
                // No route (a clarifying question, a plain answer) simply keeps them here.
                //
                // An EDIT is the same hand-off aimed at a document instead of a blank page, and it
                // names its own desk (kind → desk is decided on the server), so it is read first:
                // a turn that reopens the user's TSLA call is going to Kairos whatever else it said.
                // Empty on a routing turn — the server guarantees it, since the door Axl just
                // opened IS the next step and chips beside it would compete with the one thing
                // he decided.
                setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : [])

                const desk = DESKS.find(d => d.key === (data.edit?.desk ?? data.route))
                if (desk) setPendingRoute({
                    desk,
                    symbol:  data.routeSymbol ?? null,
                    edit:    data.edit ?? null,
                    // What the user said they came for, in their words — sent as their first message
                    // at the desk. Null on an edit (that reopens a conversation that already exists)
                    // and whenever Axl had nothing to carry, in which case the desk opens by asking.
                    opening: data.opening ?? null,
                    // The user already owns the book they want managed → Atlas opens on their existing
                    // holdings and works backwards to the mandate, instead of on a blank construction.
                    adopt:   data.adopt === true,
                })
            },
            send: ({ signal, handlers }) => axlService.streamAxl(
                turn,
                {
                    model:           readStoredModel(),
                    signal,
                    ...handlers,
                },
            ),
        })
    }

    // The daily market brief, asked for from its card in the social chat (MainPage bumps
    // `briefRequest`). It runs through the same begin/stream/finish machinery as a typed turn, so
    // the user's ask shows as their own bubble, the waiting chip names what is happening, and the
    // text types itself in — the difference is only that the words come from the brief service
    // instead of a model turn, and that no history is sent (there is nothing to answer against).
    //
    // The ask is written as the user's turn rather than injected as a wordless assistant message so
    // the thread reads as a conversation: the follow-up ("what does that mean for my book?") then
    // reaches Axl with the brief and the question that produced it already in the history.
    async function _sendBrief() {
        if (isLoading) return
        // The brief runs its own begin/stream/finish rather than going through _send, so it has to
        // spend the offer itself — chips from the previous turn hanging under a fresh brief would
        // answer a question nobody is looking at any more.
        setSuggestions([])

        const ask = "Today's market brief, please."
        const turn = [...toChatHistory(messages), { role: 'user', content: ask }]
        let answered = null

        const { signal, handlers } = chat.begin(ask, {
            onDone: (data) => {
                answered = data.reply ?? ''
                const reasoning = chat.reasoningRef.current
                chat.finishStreaming({ role: 'assistant', content: answered, ...(reasoning ? { reasoning } : {}) })
            },
        })

        try {
            await axlService.streamBrief({ signal, ...handlers })
        } catch (err) {
            console.error('[axl:brief]', err)
            // Carry the underlying reason. The fixed sentence this used to show read as "the brief
            // could not be written" for every failure — including the ones where it was never asked
            // for (a stale server with no such route, a dropped connection), which sends you looking
            // at the brief service for a fault that is not there.
            const why = err?.message ? ` (${err.message})` : ''
            chat.freezeError(`Couldn't fetch today's brief just now${why}. Ask me again in a moment.`)
        } finally {
            chat.endStream()
            // The same walk-out cover `_send` has, for the same reason: this is the longest thing
            // Axl ever puts in the thread, and a brief the user left to write itself is exactly the
            // one they come back for. On the mounted path the save effect handles it.
            if (!mountedRef.current) _saveThread(answered ? [...turn, { role: 'assistant', content: answered }] : turn)
        }
    }

    // Fires on every bump, INCLUDING one already set at mount — routing here from another tab
    // remounts the hub, so the request has to survive the remount to arrive at all. Consuming it
    // (onBriefStart) is what stops it firing again the next time the user walks back to Axl.
    //
    // `isLoading` is a dependency, not a guard to bail on: pressing the card while Axl is already
    // mid-turn must not swallow the brief. The request is left unconsumed and this re-runs when the
    // turn ends, so the brief follows the reply instead of vanishing.
    useEffect(() => {
        if (!briefRequest || isLoading) return
        onBriefStart?.()
        _sendBrief()
    }, [briefRequest, isLoading]) // eslint-disable-line react-hooks/exhaustive-deps

    function handleClear() {
        chat.handleStop?.()
        chat.setMessages([])
        setDraft('')
        setSuggestions([])          // chips belong to a thread that no longer exists
        // One Clear, one clean slate — a chart left docked under an empty hub reads as a leftover.
        closeChart()
        // Clearing is not walking away: the draft goes with the conversation, or a thread the user
        // explicitly threw away sits in the store for another fourteen days and is restored on the
        // next arrival. clearThread discards the spent one and mints the id the next chat writes to.
        clearThread(threadIdRef)
        lastSavedRef.current = null
        // A fresh thread has nothing to restore, and the unfinished list still holds the row we just
        // deleted until its next fetch — without this, Clear would be undone on the following render.
        restoredRef.current  = true
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
    }

    // Dictation goes straight out as a turn, through a REF rather than the closure itself.
    //
    // THE TRAP THIS CLOSES: `useCallback(text => _send(text), [])` froze the FIRST render's `_send`,
    // and `_send` reads `messages` off the render it was made in — which on the first render is `[]`.
    // Every dictated turn therefore reached Axl with an empty history: a brand-new conversation,
    // spoken into the middle of an existing one. Typed turns were fine, which is exactly why it
    // showed up as Axl forgetting only SOMETIMES.
    //
    // The empty dep array is still right, and the ref is why: useMicInput's `start` closes over
    // `onTranscript`, so an identity that changes every render would rebuild it mid-recording. The
    // ref keeps that stable while the SEND is read at fire time, which is when the history is true.
    const sendRef = useRef(_send)
    sendRef.current = _send
    const onTranscript = useCallback((text) => { if (text) sendRef.current(text) }, [])
    const { isRecording, isTranscribing, toggle: toggleMic, cancel: cancelMic } = useMicInput({ onTranscript })

    // The landing (greeting + desk cards) gives way to the thread on the first message.
    const hasThread = messages.length > 0

    if (summoning) {
        const agent = AGENTS[summoning.agentKey]
        return (
            <div className="axl-hub axl-hub--summon" role="status" aria-live="polite">
                <AgentSummon
                    hue={summoning.hue}
                    label={
                        <>
                            Routing to the{' '}
                            <span className="axl-summon__brand">
                                <BrandTitle text={summoning.label} />
                            </span>
                            <span className="axl-summon__dots" aria-hidden="true"><i /><i /><i /></span>
                        </>
                    }
                    sub="Step 1 is ready for you"
                >
                    <AgentGlyph agentKey={summoning.agentKey} icon={agent?.icon} size={54} />
                </AgentSummon>
            </div>
        )
    }

    return (
        <div className="axl-hub">
            {/* ── pipeline header ── */}
            <div className="panel-header axl-hub__header">
                {hoveredDesk ? (
                    <span className="axl-hub__pipeline-path" key={hoveredDesk.key}>
                        <span className="axl-hub__pipeline-desk">{hoveredDesk.label}</span>
                        {hoveredDesk.steps.flatMap((step, i) => [
                            <span key={`l${i}`} className="axl-hub__pipeline-line" aria-hidden="true" />,
                            <span key={step.label} className="axl-hub__pipeline-step">
                                <span className="axl-hub__pipeline-text">{step.label}</span>
                            </span>,
                        ])}
                    </span>
                ) : (
                    <span className="axl-hub__pipeline-idle">Where would you like to start?</span>
                )}
            </div>

            <div
                className={`axl-hub__body${hasThread ? ' axl-hub__body--active' : ''}`}
                ref={messagesRef}
                onScroll={handleScroll}
            >
                {!hasThread && (
                    /* ── greeting ── */
                    <div className="axl-hub__intro">
                        <svg className="axl-hub__mark" viewBox="0 0 44 44" aria-hidden="true">
                            <defs>
                                <radialGradient id="axlHubAura" cx="50%" cy="44%" r="62%">
                                    <stop offset="0"   style={{ stopColor: 'var(--accent-light)', stopOpacity: 0.20 }} />
                                    <stop offset="0.6" style={{ stopColor: 'var(--accent)',       stopOpacity: 0.10 }} />
                                    <stop offset="1"   style={{ stopColor: 'var(--accent-light)', stopOpacity: 0.13 }} />
                                </radialGradient>
                                <linearGradient id="axlHubRing" gradientUnits="userSpaceOnUse" x1="6" y1="6" x2="38" y2="38">
                                    <stop offset="0"   style={{ stopColor: 'var(--accent-bright)' }} />
                                    <stop offset="0.5" style={{ stopColor: 'var(--accent-light)' }} />
                                    <stop offset="1"   style={{ stopColor: 'var(--accent)' }} />
                                </linearGradient>
                            </defs>
                            <circle className="axl-hub__aura" cx="22" cy="22" r="20" />
                            <circle className="axl-hub__ring" cx="22" cy="22" r="20" />
                            <line className="axl-hub__bot" x1="22" y1="9.3" x2="22" y2="7.3" />
                            <circle className="axl-hub__bot" cx="22" cy="6.1" r="1.1" />
                            <rect className="axl-hub__bot" x="15.5" y="9.5" width="13" height="10" rx="3.6" />
                            <path className="axl-hub__bot" d="M18,14 q1.7,1.4 3.4,0" />
                            <path className="axl-hub__bot" d="M22.6,14 q1.7,1.4 3.4,0" />
                            <path className="axl-hub__bot" d="M16.6,20 C13.9,22.3 13.1,25.8 16,28" />
                            <path className="axl-hub__bot" d="M27.4,20 C30.1,22.3 30.9,25.8 28,28" />
                            <path className="axl-hub__bot" d="M13,30 Q22,26.2 31,30" />
                            <path className="axl-hub__bot" d="M14,30.5 Q22,34.6 30,30.5" />
                            <path className="axl-hub__bot" d="M19.4,31 L24.6,33.4" />
                            <path className="axl-hub__bot" d="M24.6,31 L19.4,33.4" />
                        </svg>
                        <h2 className="axl-hub__greeting">
                            Hi{name ? ` ${name}` : ''}, I&apos;m <span className="axl-hub__wordmark"><b>A</b>xl</span>.
                        </h2>
                    </div>
                )}

                {hasThread ? (
                    /* ── inline desk chips (replace the cards once the conversation starts) ── */
                    <div className="axl-hub__desk-strip">
                        {visibleDesks.map(desk => (
                            <button
                                key={desk.key}
                                type="button"
                                className={`axl-hub__desk-chip axl-hub__desk-chip--${desk.hue}${blocked.has(desk.key) ? ' is-locked' : ''}`}
                                onClick={() => handleDeskPick(desk)}
                                disabled={isLoading}
                                // aria-disabled, not the `disabled` attribute: a natively disabled
                                // button shows no title tooltip in any browser, and the tooltip is the
                                // only thing that tells a rule from a bug. handleDeskPick refuses the
                                // click, so it is unclickable either way.
                                aria-disabled={blocked.has(desk.key) || undefined}
                                title={deskLockTitle(desk) ?? desk.label}
                            >
                                <AgentGlyph agentKey={desk.agentKey} icon={AGENTS[desk.agentKey]?.icon} size={13} />
                                <span>{desk.lead}</span>
                                {deskBadge(desk)}
                            </button>
                        ))}
                        <button
                            type="button"
                            className={`axl-hub__desk-chip axl-hub__desk-chip--${TICKET_DESK.hue}`}
                            onClick={handleTicketPick}
                            disabled={isLoading}
                            title={TICKET_DESK.label}
                        >
                            <TicketGlyph size={13} />
                            <span>{TICKET_DESK.lead}</span>
                        </button>
                    </div>
                ) : (
                    /* ── desk cards (2-col grid: 5 desks + the order ticket) ── */
                    <div className="axl-hub__options">
                        {visibleDesks.map((desk, i) => (
                            <button
                                key={desk.key}
                                type="button"
                                className={`axl-hub__option axl-hub__option--${desk.hue}${blocked.has(desk.key) ? ' is-locked' : ''}`}
                                title={deskLockTitle(desk) ?? undefined}
                                style={{ animationDelay: `${0.08 + i * 0.06}s` }}
                                onClick={() => handleDeskPick(desk)}
                                onMouseEnter={() => setHoveredDesk(desk)}
                                onMouseLeave={() => setHoveredDesk(null)}
                                disabled={isLoading}
                                aria-disabled={blocked.has(desk.key) || undefined}
                            >
                                <span className="axl-hub__option-icon">
                                    <AgentGlyph agentKey={desk.agentKey} icon={AGENTS[desk.agentKey]?.icon} size={32} />
                                </span>
                                <span className="axl-hub__option-lead">{desk.lead}</span>
                                {deskBadge(desk)}
                            </button>
                        ))}
                        {/* Trade by hand — last card, so the desks (where the work usually starts)
                            keep the top of the grid. */}
                        <button
                            type="button"
                            className={`axl-hub__option axl-hub__option--${TICKET_DESK.hue}`}
                            style={{ animationDelay: `${0.08 + DESKS.length * 0.06}s` }}
                            onClick={handleTicketPick}
                            onMouseEnter={() => setHoveredDesk(TICKET_DESK)}
                            onMouseLeave={() => setHoveredDesk(null)}
                            disabled={isLoading}
                        >
                            <span className="axl-hub__option-icon"><TicketGlyph size={32} /></span>
                            <span className="axl-hub__option-lead">{TICKET_DESK.lead}</span>
                        </button>
                    </div>
                )}

                {hasThread && (
                    <div className="axl-hub__thread">
                        {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
                        {isLoading && <ToolStatusChip label={waitingLabel({ messages, streamStatus: chat.streamStatus })} pulse={chat.reasoningPulse} />}
                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            {/* Same dock as every agent chat: above the input, below the thread. */}
            <ChatChartDock />

            {/* Axl's follow-ups, once there is a conversation: directly above the input, where the
                eye already is when deciding what to say next, and below the reply they answer.
                A chip sends its text as the user's own message — the same path as typing it. */}
            {hasThread && (
                <SuggestionChips suggestions={suggestions} onPick={_send} disabled={isLoading} />
            )}


            <ChatInputRow
                prefix="axl"
                empty={!hasThread}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                textareaRef={inputRef}
                placeholder="Ask Axl anything, or say what you'd like to do…"
                onSend={handleSend}
                sendDisabled={!draft.trim() || isLoading}
                isStreaming={isLoading}
                onStop={chat.handleStop}
                onClear={handleClear}
                clearDisabled={isLoading || (!draft && !hasThread)}
                onToggleMic={toggleMic}
                onCancelMic={cancelMic}
                isRecording={isRecording}
                isTranscribing={isTranscribing}
                micDisabled={isLoading || isTranscribing}
                textareaDisabled={isLoading || isRecording}
            />

            {/* The landing asks go BELOW the box, not above it — the one place on this screen where
                the chips are not answering anything. A follow-up belongs under the reply it follows;
                these follow nothing, so above the composer they would read as a fourth thing to
                choose between the seven cards and the box. Under it they are what the box is FOR:
                the empty field, then three sentences you could put in it. */}
            {!hasThread && (
                <SuggestionChips
                    suggestions={LANDING_ASKS}
                    variant="landing"
                    onPick={_send}
                    disabled={isLoading}
                />
            )}
        </div>
    )
}

AxlHub.propTypes = {
    user:         PropTypes.object,
    onPick:       PropTypes.func.isRequired,
    onOpenTicket: PropTypes.func,
    // Turns running right now, as { agent, pipeline } — the same shape a saved draft is read in.
    live:         PropTypes.array,
}

TicketGlyph.propTypes = {
    size: PropTypes.number,
}

MessageBubble.propTypes = {
    msg: PropTypes.object.isRequired,
}
