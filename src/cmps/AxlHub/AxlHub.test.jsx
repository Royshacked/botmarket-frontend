import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

// jsdom has no layout — useChatScroll calls scrollIntoView after every turn.
window.HTMLElement.prototype.scrollIntoView = vi.fn()

const streamAxl = vi.fn()
vi.mock('../../services/axl/axl.service.remote', () => ({
    axlService: { streamAxl: (...a) => streamAxl(...a) },
}))
// Unfinished work per desk, which drives the route dot AND the resume-on-arrival. It now carries
// Axl's OWN conversation too — a draft thread like any desk's, which is what lets the hub restore the
// chat after the tab switch that unmounts it.
const listUnfinished = vi.fn().mockResolvedValue([])
const saveDraft      = vi.fn().mockResolvedValue({ ok: true })
const getThread      = vi.fn().mockResolvedValue(null)
const discardThread  = vi.fn().mockResolvedValue({ ok: true })
let threadSeq = 0
vi.mock('../../services/threads/threads.service.remote', () => ({
    threadsService: {
        listUnfinished: (...a) => listUnfinished(...a),
        saveDraft:      (...a) => saveDraft(...a),
        getThread:      (...a) => getThread(...a),
        discardThread:  (...a) => discardThread(...a),
    },
    // Deterministic, so a test can assert WHICH thread a save wrote to. The real one is time+random.
    newThreadId: () => `thr_test_${++threadSeq}`,
    // The real helper's contract, minus the module it lives in: discard the spent thread, mint the
    // next id into the ref.
    clearThread: (ref) => {
        if (ref?.current) discardThread(ref.current)
        const next = `thr_test_${++threadSeq}`
        if (ref) ref.current = next
        return next
    },
}))
// The mic hands its transcript back through this callback. Captured rather than stubbed away,
// because the callback IS the bug this suite pins: it used to be frozen on the first render.
let micTranscript = null
vi.mock('../../customHooks/useMicInput.js', () => ({
    useMicInput: ({ onTranscript }) => {
        micTranscript = onTranscript
        return { isRecording: false, isTranscribing: false, toggle: vi.fn(), cancel: vi.fn() }
    },
}))
const { AxlHub, MessageBubble } = await import('./AxlHub.jsx')
const { DESKS } = await import('./agentMeta.jsx')

// Reply with a desk hand-off, the way the server sends one: the tag is already parsed off, so the
// client sees `route` (which desk) + `routeSymbol` (the name it should open on).
// Mirrors the `done` payload the server sends. Kept as an explicit field list rather than a spread so
// a field the component reads but the server never sends cannot pass here — but that cuts both ways:
// a NEW server field has to be added here too, or the test silently proves the component ignores it.
function replyWith({ reply = 'Taking you to Prometheus.', route = null, routeSymbol = null, opening = null, edit = null, adopt = false } = {}) {
    streamAxl.mockImplementation(async (_messages, opts) => { opts.onDone?.({ reply, route, routeSymbol, opening, edit, adopt }) })
}

async function ask(text) {
    const box = screen.getByPlaceholderText(/Ask Axl anything/i)
    fireEvent.change(box, { target: { value: text } })
    await act(async () => { fireEvent.keyDown(box, { key: 'Enter' }) })
    // The reply lands, then a read-beat, then the summon animation. The second timer is only
    // SCHEDULED once the first has fired and the stream has settled, so advance in waves —
    // one long jump would run out before the nested timer exists.
    for (let i = 0; i < 4; i++) await act(async () => { vi.advanceTimersByTime(1500) })
}

beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    streamAxl.mockReset()
    listUnfinished.mockReset().mockResolvedValue([])
    saveDraft.mockReset().mockResolvedValue({ ok: true })
    getThread.mockReset().mockResolvedValue(null)
    discardThread.mockReset().mockResolvedValue({ ok: true })
    micTranscript = null
    threadSeq = 0
})
afterEach(() => { vi.useRealTimers(); cleanup() })

describe('AxlHub — the desk hand-off', () => {
    it('carries the routed TICKER to the desk, so the agent opens on that name', async () => {
        const onPick = vi.fn()
        render(<AxlHub user={{ fullname: 'Roy Shacked' }} onPick={onPick} />)
        replyWith({ route: 'research', routeSymbol: 'NVDA' })

        await ask("let's research nvda")

        expect(onPick).toHaveBeenCalledWith('analyst', { pipeline: 'research', symbol: 'NVDA' })
    })

    it('routes with no ticker (a scan, a portfolio) → the desk opens empty, not broken', async () => {
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)
        replyWith({ route: 'scan' })

        await ask('build me a watchlist')

        expect(onPick).toHaveBeenCalledWith('scanner', { pipeline: 'scan', symbol: null })
    })

    it('routes the user’s OWN trade to Mentor, ticker and all', async () => {
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)
        replyWith({ route: 'assist', routeSymbol: 'TSLA' })

        await ask("here's my TSLA plan, tear it apart")

        expect(onPick).toHaveBeenCalledWith('mentor', { pipeline: 'assist', symbol: 'TSLA' })
    })

    it('a CLARIFYING question (no route) keeps the user with Axl', async () => {
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)
        replyWith({ reply: 'A tradeable setup on it, or a research thesis?' })

        await ask("let's analyze nvda")

        expect(onPick).not.toHaveBeenCalled()
        expect(screen.getByText(/A tradeable setup on it, or a research thesis\?/)).toBeTruthy()
    })

    // The portfolio pipeline opens on ATLAS, not Argus. Atlas locks the mandate and only then sources
    // names (through Argus, via <screen_request>) — and it has no screener of its own, so landing on
    // Argus first asks the user to pick names with nothing to pick them against. Both entry paths —
    // a route and a button click — read the same `entryTab`, so both are pinned here.
    it('the portfolio route opens ATLAS — the mandate comes before any name', async () => {
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)
        replyWith({ route: 'portfolio' })

        await ask('I want to make 5% with 5% drawdown, across a few names')

        expect(onPick).toHaveBeenCalledWith('portfolio', { pipeline: 'portfolio', symbol: null })
    })

    it('the portfolio BUTTON opens Atlas too — same entry, same mandate-first order', async () => {
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)

        await act(async () => { fireEvent.click(screen.getByText('Build a portfolio')) })
        await act(async () => { vi.advanceTimersByTime(5000) })

        expect(onPick).toHaveBeenCalledWith('portfolio', { pipeline: 'portfolio', symbol: null })
    })

    it('a desk picked by BUTTON carries no ticker — the click says the desk, not the name', async () => {
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)

        await act(async () => { fireEvent.click(screen.getByText('Research a company')) })
        await act(async () => { vi.advanceTimersByTime(5000) })

        expect(onPick).toHaveBeenCalledWith('analyst', { pipeline: 'research', symbol: null })
    })
})

// Reopening something the user ALREADY has, as opposed to opening a desk on a blank page. The bug:
// "show me my coverage" then "edit that one" routed to `research`, and Prometheus began a second
// thesis on a name it already covered — because a desk key was the only thing a hand-off could say.
describe('AxlHub — the edit hand-off', () => {
    it('carries the ITEM to the desk that owns it, not just the desk', async () => {
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)
        replyWith({ reply: 'Reopening it in Prometheus.', edit: { kind: 'coverage', ref: 'cov_9', desk: 'research' } })

        await ask('edit that ZTS coverage')

        expect(onPick).toHaveBeenCalledWith('analyst', {
            pipeline: 'research', symbol: null, edit: { kind: 'coverage', ref: 'cov_9', desk: 'research' },
        })
    })

    // A call is EDITED in Kairos, but the trading desk ENTERS at Argus. The hand-off still names the
    // desk (the pipeline crumb needs it) — the host is what picks the tab from the item.
    it('a call edit travels under the trading desk, item and all', async () => {
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)
        replyWith({ reply: 'Opening it in Kairos.', edit: { kind: 'call', ref: 'c1', desk: 'trade' } })

        await ask('change the entry on my TSLA call')

        expect(onPick).toHaveBeenCalledWith('scanner', {
            pipeline: 'trade', symbol: null, edit: { kind: 'call', ref: 'c1', desk: 'trade' },
        })
    })

    // Atlas is both the portfolio desk's entry AND where a book is edited, so the two hand-offs look
    // identical from the tab alone. `edit` is the only thing that separates "take the mandate again"
    // from "re-work the plan you already have" — it has to survive the trip.
    it('a book edit is distinguishable from entering the portfolio desk', async () => {
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)
        replyWith({ reply: 'Opening Core in Atlas.', edit: { kind: 'portfolio', ref: 'p1', desk: 'portfolio' } })

        await ask('re-work my Core book')

        expect(onPick).toHaveBeenCalledWith('portfolio', {
            pipeline: 'portfolio', symbol: null, edit: { kind: 'portfolio', ref: 'p1', desk: 'portfolio' },
        })
    })

    it('a plain route still carries NO edit — new work must not reopen anything', async () => {
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)
        replyWith({ route: 'research', routeSymbol: 'NVDA' })

        await ask("let's research nvda")

        expect(onPick).toHaveBeenCalledWith('analyst', { pipeline: 'research', symbol: 'NVDA' })
        expect(onPick.mock.calls[0][1].edit).toBeUndefined()
    })
})

describe('AxlHub — the opening turn that travels with them', () => {
    // THE hand-off. Axl works out which desk, and the sentence the user said goes with them so the
    // desk opens on the job. It replaced an `objectives` record (2026-08-05) that carried the goal as
    // structured fields, showed it back in a chip, and outlived the job it described.
    it('carries the opening to the desk alongside the route', async () => {
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)
        replyWith({ reply: 'Taking you to Atlas.', route: 'portfolio', opening: 'I want 5% profit.' })

        await ask('several positions')

        expect(onPick).toHaveBeenCalledWith('portfolio', {
            pipeline: 'portfolio', symbol: null, opening: 'I want 5% profit.',
        })
    })

    // A book that already exists somewhere else is still the portfolio desk, but Atlas must not open
    // on a blank construction — it opens on the holdings and works backwards to the mandate. So the
    // mode has to survive the hand-off; dropped here, the user would be walked into building a second
    // portfolio while already owning one.
    it('carries the adopt mode to the portfolio desk', async () => {
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)
        replyWith({
            reply: 'Taking you to Atlas.', route: 'portfolio', adopt: true,
            opening: 'I have a portfolio at my bank I want you to manage.',
        })

        await ask('i have a book at my bank')

        expect(onPick).toHaveBeenCalledWith('portfolio', {
            pipeline: 'portfolio', symbol: null, adopt: true,
            opening: 'I have a portfolio at my bank I want you to manage.',
        })
    })

    it('an ordinary portfolio route carries NO adopt flag', async () => {
        // The absence has to be real: a truthy default would put every new book into adopt mode.
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)
        replyWith({ reply: 'Taking you to Atlas.', route: 'portfolio', opening: 'I want to build a portfolio.' })

        await ask('build me a portfolio')

        expect(onPick).toHaveBeenCalledWith('portfolio', {
            pipeline: 'portfolio', symbol: null, opening: 'I want to build a portfolio.',
        })
    })

    // Walking back into something left unfinished should PICK IT UP. Opening a blank desk and making the
    // user find the conversation in a drawer is a step too many when the route already knows which one.
    it('a desk with an unfinished conversation resumes it instead of opening blank', async () => {
        listUnfinished.mockResolvedValue([
            { threadId: 'thr_left_mid', agent: 'portfolio', pipeline: 'portfolio', yourTurn: true },
        ])
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)
        await act(async () => {})   // let the unfinished list land

        await act(async () => { fireEvent.click(screen.getByText('Build a portfolio')) })
        await act(async () => { vi.advanceTimersByTime(5000) })

        expect(onPick).toHaveBeenCalledWith('portfolio', expect.objectContaining({
            resumeThreadId: 'thr_left_mid',
        }))
    })

    it('a route with no opening hands over nothing extra — the desk asks as it always did', async () => {
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)
        replyWith({ reply: 'Off to Kairos.', route: 'trade', routeSymbol: 'TSLA' })

        await ask('find me a trade on tsla')

        // The trade desk ENTERS at Argus, hence 'scanner' rather than 'kairos'.
        expect(onPick).toHaveBeenCalledWith('scanner', { pipeline: 'trade', symbol: 'TSLA' })
        expect(onPick.mock.calls[0][1].opening).toBeUndefined()
    })

    it('an opening on a turn that does not route goes nowhere', async () => {
        // The server already refuses this pairing; the client must not invent a desk for it either.
        const onPick = vi.fn()
        render(<AxlHub user={{}} onPick={onPick} />)
        replyWith({ reply: 'One position or several?', opening: 'I want 5% profit.' })

        await ask('i want 5% profit')

        expect(onPick).not.toHaveBeenCalled()
    })
})

// ─── Walking back out of a desk, and back into it ────────────────────────────────
// The reported case, end to end: enter the trade desk, pass Argus, get as far as Mentor, then click
// back to Axl. What the hub owes the user at that moment is one mark on the desk they left, closed
// doors to the agents that desk is holding, and — when they go back — the conversation they were
// actually in.
describe('AxlHub — the desk they left', () => {
    // Newest first, exactly as /unfinished returns them: Mentor is where they stopped.
    const MID_TRADE_DESK = [
        { threadId: 'thr_mentor',  agent: 'mentor',  pipeline: 'trade', yourTurn: true,  updatedAt: 200 },
        { threadId: 'thr_scanner', agent: 'scanner', pipeline: 'trade', yourTurn: false, updatedAt: 100 },
    ]
    const card = (lead) => screen.getByText(lead).closest('button')

    async function landed(onPick = vi.fn()) {
        listUnfinished.mockResolvedValue(MID_TRADE_DESK)
        render(<AxlHub user={{}} onPick={onPick} />)
        await act(async () => {})   // let the unfinished list arrive
        return onPick
    }

    it('marks the ONE desk they left, not every desk sharing its agents', async () => {
        await landed()
        // Two threads, both the trade desk's: one mark, on the trade desk.
        expect(document.querySelectorAll('.axl-hub__desk-flag')).toHaveLength(1)
        // And it says so in words — the newest thread is waiting on the user, so it says which.
        expect(card('Trade an asset').querySelector('.axl-hub__desk-flag')?.textContent).toBe('Your turn')
        for (const lead of ['Build a portfolio', 'Produce a watchlist', 'Work on your own trade']) {
            expect(card(lead).querySelector('.axl-hub__desk-flag')).toBeNull()
        }
    })

    it('says "Working.." when nothing is waiting on the user — a word, not a symbol to decode', async () => {
        // Same desk, but neither thread has asked anything: it is still running, not asking.
        listUnfinished.mockResolvedValue(
            MID_TRADE_DESK.map(t => ({ ...t, yourTurn: false })),
        )
        render(<AxlHub user={{}} onPick={vi.fn()} />)
        await act(async () => {})

        const flag = card('Trade an asset').querySelector('.axl-hub__desk-flag')
        expect(flag.textContent).toBe('Working..')
        expect(flag.className).not.toMatch(/is-turn/)
    })

    it('closes every OTHER door to an agent the desk is holding — including Mentor’s', async () => {
        // Mentor was the missing one: its drafts never persisted, so nothing held the assist desk and
        // the door stood open onto a panel a live build was sitting in.
        await landed()
        for (const lead of ['Build a portfolio', 'Produce a watchlist', 'Work on your own trade']) {
            expect(card(lead).className).toMatch(/is-locked/)
            expect(card(lead).getAttribute('aria-disabled')).toBe('true')
        }
        expect(card('Trade an asset').className).not.toMatch(/is-locked/)
        expect(card('Research a company').className).not.toMatch(/is-locked/)
    })

    it('a closed door does not open — the click does nothing at all', async () => {
        const onPick = await landed()

        await act(async () => { fireEvent.click(card('Work on your own trade')) })
        await act(async () => { vi.advanceTimersByTime(5000) })

        expect(onPick).not.toHaveBeenCalled()
        // …and it says WHY, which is the only thing separating a rule from a bug.
        // The agent by its brand, not its key: "is using mentor" names an internal id at the user.
        expect(card('Work on your own trade').getAttribute('title')).toMatch(/Trading Desk is using Mentor/)
    })

    it('going back to the desk lands on MENTOR, where they left — not at the end of the scan', async () => {
        const onPick = await landed()

        await act(async () => { fireEvent.click(card('Trade an asset')) })
        await act(async () => { vi.advanceTimersByTime(5000) })

        // The trade desk's entryTab is 'scanner'. A walk-back must override it with the thread's own
        // agent, or the user is dropped at the end of an Argus conversation they had finished with —
        // and Argus's panel is handed a Mentor threadId it cannot resume.
        expect(onPick).toHaveBeenCalledWith('mentor', {
            pipeline: 'trade', symbol: null, resumeThreadId: 'thr_mentor',
        })
    })

    it('a desk with nothing left at it still opens at its front door', async () => {
        const onPick = await landed()

        await act(async () => { fireEvent.click(card('Research a company')) })
        await act(async () => { vi.advanceTimersByTime(5000) })

        expect(onPick).toHaveBeenCalledWith('analyst', { pipeline: 'research', symbol: null })
    })
})

// Thinking / working / fetching are ONE state. Axl's bubble no longer draws it at all — the mark
// renders once below the thread (see ToolStatusChip.test.jsx). What's left here is the bubble's own
// job: don't leave an empty bordered box where the wait used to be.
describe('AxlHub — the working indicator', () => {
    it('a wordless streaming turn draws nothing — the mark lives below the thread', () => {
        const { container } = render(<MessageBubble msg={{ role: 'assistant', streaming: true, content: '' }} />)

        expect(container.innerHTML).toBe('')
    })

    it('a wordless turn that DID reason shows it, without the bubble chrome', () => {
        const { container } = render(<MessageBubble msg={{ role: 'assistant', streaming: true, content: '', reasoning: 'which desk owns this' }} />)

        expect(container.querySelector('.axl-hub__bubble--pending')).toBeTruthy()
        expect(container.querySelector('.chat-reasoning')).toBeTruthy()
    })

    it('once words land the bubble comes back', () => {
        const { container } = render(<MessageBubble msg={{ role: 'assistant', streaming: true, content: 'Taking you to Prometheus.' }} />)

        expect(container.querySelector('.axl-hub__bubble--pending')).toBe(null)
        expect(container.querySelector('.axl-hub__bubble--assistant')).toBeTruthy()
    })
})

// WALKING AWAY IS NOT STOPPING. The server keeps a turn running when the socket closes, so a desk
// left mid-answer is still working — but it has no DRAFT yet (that is written when the reply lands),
// so every route here used to go quiet about the one desk that was actually busy.
describe('AxlHub — a turn still running at a desk', () => {
    const live = (agent, pipeline = null) => [{ agent, pipeline, live: true }]

    it('marks the desk a live turn belongs to', async () => {
        render(<AxlHub user={{ fullname: 'Roy' }} onPick={vi.fn()} live={live('mentor', 'assist')} />)
        await act(async () => {})

        const assist = screen.getByText('Work on your own trade').closest('button')
        expect(assist.textContent).toMatch(/Working/)
    })

    it('files it on the SAME desk the draft it becomes would land on', async () => {
        // No pipeline (a desk opened straight at a tab — the calendar route into Mentor is one), so
        // it falls back exactly as deskOfThread does: the desk that IS that agent. One rule, not two.
        render(<AxlHub user={{ fullname: 'Roy' }} onPick={vi.fn()} live={live('mentor')} />)
        await act(async () => {})

        expect(screen.getByText('Work on your own trade').closest('button').textContent).toMatch(/Working/)
        expect(screen.getByText('Trade an asset').closest('button').textContent).not.toMatch(/Working/)
    })

    it('a live turn is not resumable — clicking the desk opens it, it does not reopen a thread', async () => {
        // There is no thread yet. Handing the summon a pseudo-thread would send a `threadId` of
        // undefined to the panel, which is worse than opening blank.
        const onPick = vi.fn()
        render(<AxlHub user={{ fullname: 'Roy' }} onPick={onPick} live={live('mentor', 'assist')} />)
        await act(async () => {})

        fireEvent.click(screen.getByText('Work on your own trade').closest('button'))
        for (let i = 0; i < 4; i++) await act(async () => { vi.advanceTimersByTime(1500) })
        expect(onPick).toHaveBeenCalled()
        expect(onPick.mock.calls[0][1].resumeThreadId).toBeUndefined()
    })

    it('re-reads the unfinished list when the turn ENDS, so the draft it wrote shows up', async () => {
        // The mount fetch has been and gone by the time a background reply lands; without this the
        // route stays silent at the moment it finally has something to say.
        const { rerender } = render(<AxlHub user={{ fullname: 'Roy' }} onPick={vi.fn()} live={live('mentor', 'assist')} />)
        await act(async () => {})
        expect(listUnfinished).toHaveBeenCalledTimes(1)

        listUnfinished.mockResolvedValue([{ threadId: 't1', agent: 'mentor', pipeline: 'assist', yourTurn: true }])
        rerender(<AxlHub user={{ fullname: 'Roy' }} onPick={vi.fn()} live={[]} />)
        await act(async () => {})

        expect(listUnfinished).toHaveBeenCalledTimes(2)
        expect(screen.getByText('Work on your own trade').closest('button').textContent).toMatch(/Your turn/)
    })
})

// The two halves of "walk back in" pull opposite ways once a turn can outlive the walk: resume
// RESTORES the saved conversation, and a turn still streaming is not in it yet.
describe('AxlHub — walking back into a desk that is still answering', () => {
    it('opens it without resuming, so the running answer is not overwritten', async () => {
        listUnfinished.mockResolvedValue([{ threadId: 't1', agent: 'mentor', pipeline: 'assist', yourTurn: true }])
        const onPick = vi.fn()
        render(
            <AxlHub user={{ fullname: 'Roy' }} onPick={onPick}
                live={[{ agent: 'mentor', pipeline: 'assist', live: true }]} />,
        )
        await act(async () => {})

        fireEvent.click(screen.getByText('Work on your own trade').closest('button'))
        for (let i = 0; i < 4; i++) await act(async () => { vi.advanceTimersByTime(1500) })

        expect(onPick).toHaveBeenCalled()
        expect(onPick.mock.calls[0][1].resumeThreadId).toBeUndefined()
    })

    it('still resumes when nothing is running there', async () => {
        listUnfinished.mockResolvedValue([{ threadId: 't1', agent: 'mentor', pipeline: 'assist', yourTurn: true }])
        const onPick = vi.fn()
        render(<AxlHub user={{ fullname: 'Roy' }} onPick={onPick} live={[]} />)
        await act(async () => {})

        fireEvent.click(screen.getByText('Work on your own trade').closest('button'))
        for (let i = 0; i < 4; i++) await act(async () => { vi.advanceTimersByTime(1500) })

        expect(onPick.mock.calls[0][1].resumeThreadId).toBe('t1')
    })
})

// Explaining the app is one of Axl's jobs that nothing ever triggered: the app-guide half of the
// prompt only fires if the user knows there is something to ask about. The landing chips ARE the ask.
describe('AxlHub — the landing asks', () => {
    it('offers the three app questions before the first turn', async () => {
        render(<AxlHub user={{ fullname: 'Roy' }} onPick={vi.fn()} />)
        await act(async () => {})

        expect(screen.getByRole('button', { name: 'What can this app do?' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'How does it work?' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'What can you do for me?' })).toBeTruthy()
    })

    // The seven cards are what this screen is FOR. A chip that named a desk's job would take the
    // click off the card that does it properly — so none of them may collide with a card's label.
    it('none of them answers what a desk card already answers', async () => {
        render(<AxlHub user={{ fullname: 'Roy' }} onPick={vi.fn()} />)
        await act(async () => {})

        const chips = [...screen.getByRole('group', { name: /Suggested follow-ups/i }).children]
            .map(el => el.textContent)
        expect(chips).toHaveLength(3)

        for (const { lead } of DESKS) {
            expect(screen.getByText(lead)).toBeTruthy()                  // the card is still there
            expect(chips.some(c => c.includes(lead))).toBe(false)        // and no chip is competing for it
        }
    })

    // Position is the whole distinction: a follow-up sits ABOVE the box, under the reply it answers.
    // These answer nothing, so they sit UNDER it — three sentences you could put in the empty field.
    it('sit below the composer on the landing, and above it once there is a thread', async () => {
        replyWith({ reply: 'Here is what it does.' })
        render(<AxlHub user={{ fullname: 'Roy' }} onPick={vi.fn()} />)
        await act(async () => {})

        const composer = screen.getByPlaceholderText(/Ask Axl anything/i).closest('.chat-input-row')
        const chips = screen.getByRole('group', { name: /Suggested follow-ups/i })
        // DOCUMENT_POSITION_FOLLOWING (4) — the chips come after the box.
        expect(composer.compareDocumentPosition(chips) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

        streamAxl.mockImplementation(async (_m, opts) => {
            opts.onDone?.({ reply: 'Plenty.', suggestions: ['Show me the market'] })
        })
        await ask('hi')

        const after = screen.getByRole('group', { name: /Suggested follow-ups/i })
        expect(after.textContent).toContain('Show me the market')
        // DOCUMENT_POSITION_PRECEDING (2) — back above the box, where a follow-up belongs.
        expect(composer.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    })

    // Sending anything spends the offer — and Axl's own follow-ups take the row from there.
    it('are spent by the first message and do not come back', async () => {
        replyWith({ reply: 'Here is what it does.' })
        render(<AxlHub user={{ fullname: 'Roy' }} onPick={vi.fn()} />)
        await act(async () => {})

        fireEvent.click(screen.getByRole('button', { name: 'What can this app do?' }))
        for (let i = 0; i < 4; i++) await act(async () => { vi.advanceTimersByTime(1500) })

        expect(screen.queryByRole('button', { name: 'What can this app do?' })).toBeNull()
        // …and the chip's text went out as the user's own message.
        expect(streamAxl).toHaveBeenCalled()
        const sent = streamAxl.mock.calls[0][0]
        expect(sent.at(-1)).toEqual({ role: 'user', content: 'What can this app do?' })
    })
})

// AXL REMEMBERS. Three separate leaks fed one complaint — "Axl forgets what we were talking about":
// dictation sent no history at all, and the thread itself was React state in a panel that is
// unmounted the moment the user walks to a desk.
describe('AxlHub — dictating into an existing conversation', () => {
    async function dictate(text) {
        await act(async () => { micTranscript(text) })
        for (let i = 0; i < 4; i++) await act(async () => { vi.advanceTimersByTime(1500) })
    }

    // THE BUG: the transcript handler was a useCallback with an empty dep array, so it kept the
    // FIRST render's `_send` — which had closed over `messages` while it was still []. Every spoken
    // turn therefore opened a brand-new conversation in the middle of an existing one, while typed
    // turns carried the thread perfectly. That difference is the whole of the "sometimes".
    it('carries the thread, exactly as typing it would', async () => {
        replyWith({ reply: 'Rates are the driver today.' })
        render(<AxlHub user={{ fullname: 'Roy' }} onPick={vi.fn()} />)
        await act(async () => {})

        await ask('how are markets?')
        await dictate('and what about the second one?')

        const sent = streamAxl.mock.calls.at(-1)[0]
        expect(sent).toEqual([
            { role: 'user',      content: 'how are markets?' },
            { role: 'assistant', content: 'Rates are the driver today.' },
            { role: 'user',      content: 'and what about the second one?' },
        ])
    })
})

describe('AxlHub — the conversation survives leaving', () => {
    it('persists the turn as an axl draft, on no desk', async () => {
        replyWith({ reply: 'Rates are the driver today.' })
        render(<AxlHub user={{ fullname: 'Roy' }} onPick={vi.fn()} />)
        await act(async () => {})

        await ask('how are markets?')

        // ONCE per turn: the effect writes on the mounted path and the walk-out cover stands down.
        // Two writes would double reception's traffic, and reception is the busiest desk in the app.
        expect(saveDraft).toHaveBeenCalledTimes(1)
        const saved = saveDraft.mock.calls.at(-1)[0]
        expect(saved.agent).toBe('axl')
        // `pipeline: null` is what keeps reception out of the desk UI — deskOfThread badges no route
        // for it and blockedDesks locks no door. A desk key here would light up a route the user
        // never visited and close the doors to an agent nobody is holding.
        expect(saved.pipeline).toBe(null)
        expect(saved.messages).toEqual([
            { role: 'user',      content: 'how are markets?' },
            { role: 'assistant', content: 'Rates are the driver today.' },
        ])
    })

    it('says nothing to the store before Axl has answered', async () => {
        render(<AxlHub user={{ fullname: 'Roy' }} onPick={vi.fn()} />)
        await act(async () => {})

        expect(saveDraft).not.toHaveBeenCalled()
    })

    it('restores it on arrival and keeps writing to the SAME thread', async () => {
        listUnfinished.mockResolvedValue([{ threadId: 'thr_axl_9', agent: 'axl', pipeline: null, yourTurn: true }])
        getThread.mockResolvedValue({
            threadId: 'thr_axl_9',
            messages: [
                { role: 'user',      content: 'how are markets?' },
                { role: 'assistant', content: 'Rates are the driver today.' },
            ],
        })
        replyWith({ reply: 'Because the long end sold off.' })
        render(<AxlHub user={{ fullname: 'Roy' }} onPick={vi.fn()} />)
        await act(async () => {})

        expect(getThread).toHaveBeenCalledWith('thr_axl_9')
        expect(screen.getByText(/Rates are the driver today\./)).toBeTruthy()

        await ask('why?')

        // The follow-up answers against what was said before the user walked out…
        expect(streamAxl.mock.calls.at(-1)[0]).toEqual([
            { role: 'user',      content: 'how are markets?' },
            { role: 'assistant', content: 'Rates are the driver today.' },
            { role: 'user',      content: 'why?' },
        ])
        // …and the turn goes back to the thread it came from, rather than forking a second one.
        expect(saveDraft.mock.calls.at(-1)[0].threadId).toBe('thr_axl_9')
    })

    // A chart request answers in the dock, not in words, so the turn leaves a HIDDEN assistant note
    // saying what it showed. That note is what lets "now the 4h" resolve — so it has to be in what is
    // persisted, and must not come back as a visible bubble.
    it('persists the hidden chart note without rendering it', async () => {
        streamAxl.mockImplementation(async (_m, opts) => {
            // onLiveChart, not onChart: a chart the USER asked for docks below the thread and never
            // becomes a bubble — which is exactly why the turn needs the hidden note to exist at all.
            opts.onLiveChart?.({ symbol: 'SPY', timeframe: 'day' })
            opts.onDone?.({ reply: '', route: null, routeSymbol: null, opening: null, edit: null, adopt: false })
        })
        render(<AxlHub user={{ fullname: 'Roy' }} onPick={vi.fn()} />)
        await act(async () => {})

        await ask('give spy')

        const saved = saveDraft.mock.calls.at(-1)[0].messages
        expect(saved.at(-1)).toMatchObject({ role: 'assistant', hidden: true })
        expect(saved.at(-1).content).toMatch(/SPY/)
        expect(screen.queryByText(/Showed the SPY/)).toBeNull()
    })

    // Clearing is not walking away. Left behind, the thread the user threw away would sit in the
    // store for its full TTL and be restored on the next arrival — the one outcome Clear rules out.
    it('discards the draft on Clear', async () => {
        replyWith({ reply: 'Rates are the driver today.' })
        render(<AxlHub user={{ fullname: 'Roy' }} onPick={vi.fn()} />)
        await act(async () => {})
        await ask('how are markets?')

        const written = saveDraft.mock.calls.at(-1)[0].threadId
        await act(async () => { fireEvent.click(document.querySelector('.chat-input-row__clear')) })

        expect(discardThread).toHaveBeenCalledWith(written)
        expect(screen.queryByText(/Rates are the driver today\./)).toBeNull()
    })

    // THE WALK-OUT, and the ending this whole feature exists for: ask something, lose patience, click
    // a desk. That unmounts the hub, so the save EFFECT can never run — but the turn goes on
    // streaming, and the conversation the user left is still theirs to come back to.
    it('saves the turn even when the user leaves while Axl is still answering', async () => {
        let finish
        streamAxl.mockImplementation((_m, opts) => new Promise(res => {
            finish = () => { opts.onDone?.({ reply: 'Rates are the driver today.' }); res() }
        }))
        const { unmount } = render(<AxlHub user={{ fullname: 'Roy' }} onPick={vi.fn()} />)
        await act(async () => {})

        const box = screen.getByPlaceholderText(/Ask Axl anything/i)
        fireEvent.change(box, { target: { value: 'how are markets?' } })
        await act(async () => { fireEvent.keyDown(box, { key: 'Enter' }) })
        expect(saveDraft).not.toHaveBeenCalled()        // mid-turn, nothing settled yet

        unmount()                                        // …and off to a desk
        await act(async () => { finish() })

        expect(saveDraft).toHaveBeenCalledTimes(1)
        const saved = saveDraft.mock.calls.at(-1)[0]
        expect(saved.agent).toBe('axl')
        expect(saved.messages).toEqual([
            { role: 'user',      content: 'how are markets?' },
            { role: 'assistant', content: 'Rates are the driver today.' },
        ])
    })

    // A restore that lands late must not overwrite what the user has already started saying.
    it('never overwrites a conversation already underway', async () => {
        let release
        getThread.mockImplementation(() => new Promise(res => { release = res }))
        listUnfinished.mockResolvedValue([{ threadId: 'thr_axl_9', agent: 'axl', pipeline: null }])
        replyWith({ reply: 'Fresh answer.' })
        render(<AxlHub user={{ fullname: 'Roy' }} onPick={vi.fn()} />)
        await act(async () => {})

        await ask('a brand new question')
        await act(async () => {
            release({ threadId: 'thr_axl_9', messages: [{ role: 'user', content: 'the old conversation' }] })
        })

        expect(screen.getByText('a brand new question')).toBeTruthy()
        expect(screen.queryByText('the old conversation')).toBeNull()
    })
})
