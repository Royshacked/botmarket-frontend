import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, act, fireEvent } from '@testing-library/react'

window.HTMLElement.prototype.scrollIntoView = vi.fn()

const sendStream = vi.fn().mockResolvedValue(undefined)
vi.mock('../../services/scanner/scanner.service.remote.js', () => ({
    scannerService: { sendStream: (...a) => sendStream(...a) },
}))
const discardThread = vi.fn()
const getThread     = vi.fn().mockResolvedValue(null)
const saveDraft     = vi.fn()
vi.mock('../../services/threads/threads.service.remote.js', () => ({
    threadsService: { saveDraft: (...a) => saveDraft(...a), getThread: (...a) => getThread(...a), discardThread: (...a) => discardThread(...a) },
    newThreadId:    () => 'thr_test',
    // Mirrors the real helper (discard what was saved, mint a fresh id) so the panel's Clear is
    // tested for what it DOES, not merely that it runs. The helper itself is unit-tested at source.
    clearThread:    (ref) => { if (ref?.current) discardThread(ref.current); if (ref) ref.current = 'thr_test2' },
}))
vi.mock('../../customHooks/useMicInput.js', () => ({
    useMicInput: () => ({ isRecording: false, isTranscribing: false, toggle: vi.fn(), cancel: vi.fn() }),
}))
const batchRead = vi.fn()
vi.mock('../../services/aether/aether.service.remote.js', () => ({
    aetherService: { batchRead: (...a) => batchRead(...a) },
}))

const { ScannerPanel, PrometheusStep } = await import('./ScannerPanel.jsx')

const lastCall = () => sendStream.mock.calls.at(-1)

beforeEach(() => { sendStream.mockClear(); saveDraft.mockClear() })
afterEach(cleanup)

// The setup chips (Momentum, Breakouts, Squeeze plays…) are TRADING angles. A portfolio scan asks a
// different question — a sector mandate or a horizon, usually already supplied by Atlas — so putting
// them under an investing thesis offers the wrong shortcut on the one turn that has no use for it.
describe('ScannerPanel — the thesis-phase angle strip', () => {
    // Play a Phase-1 turn to completion: that is the state the strip is gated on. The reply has to
    // finish TYPING, not just arrive — the strip needs a SETTLED assistant turn (`!streaming`), and
    // the typewriter only drops that flag on the tick AFTER its queue empties.
    //
    // This used to wait for the Stop button to vanish, on the stated theory that it marks the end of
    // the drain. It does not, and never did here: the mocked sendStream resolves BEFORE this test
    // drives onDone, so the panel's `finally { chat.endStream() }` had already cleared isLoading
    // (`deferRef` is set by finishStreaming, which had not run yet). The wait passed at t=0, and the
    // assertion behind it raced a real 16ms-interval drain on findBy's 1s default — fine alone, lost
    // whenever the full suite put the event loop under load.
    //
    // The honest signal is the text itself: the bubble fills a chunk at a time, so its FULL content
    // matching is the drain reaching the end. One more tick settles the flag.
    const TICK_MS = 16
    async function finishThesisTurn() {
        await waitFor(() => expect(sendStream).toHaveBeenCalled())
        const [, opts] = lastCall()
        await act(async () => {
            opts.onPhase(1)
            opts.onToken('Angle?')
            opts.onDone({ reply: 'Angle?' })
        })
        await screen.findByText('Angle?', {}, { timeout: 4000 })
        await act(async () => { await new Promise(r => setTimeout(r, TICK_MS * 4)) })
    }

    it('shows under a TRADING thesis — the angles are that lens', async () => {
        render(<ScannerPanel seed={{ key: 1, message: 'Find me something to trade.', profile: 'trading' }} />)
        await finishThesisTurn()
        expect(await screen.findByRole('button', { name: 'Momentum' }, { timeout: 4000 })).toBeTruthy()
    })

    it('stays away from a PORTFOLIO scan, seeded by Atlas as investing', async () => {
        render(<ScannerPanel seed={{ key: 2, message: 'Screen the Technology sleeve.', profile: 'investing' }} />)
        await finishThesisTurn()
        expect(screen.queryByRole('button', { name: 'Momentum' })).toBe(null)
    })

    it('stays away when the panel itself is the portfolio pipeline', async () => {
        render(<ScannerPanel pipeline="portfolio" seed={{ key: 3, message: 'Long-term quality names.' }} />)
        await finishThesisTurn()
        expect(screen.queryByRole('button', { name: 'Momentum' })).toBe(null)
    })
})

// The four phase numbers are shared, the work behind two of them is not. In hand-off mode Argus
// converges on ONE name — so a phase-4 heading reading "Ranked List" over a single ticker described
// the list-building dead end this mode replaced, and phase 3 says "Validation" because the
// validate-a-name branch starts there with no pool to filter.
describe('ScannerPanel — the phase headings follow the mode', () => {
    async function playPhase(phase, props = {}) {
        render(<ScannerPanel seed={{ key: 1, message: 'TSLA', profile: 'trading' }} {...props} />)
        await waitFor(() => expect(sendStream).toHaveBeenCalled())
        const [, opts] = lastCall()
        await act(async () => {
            opts.onPhase(phase)
            opts.onToken('…')
            opts.onDone({ reply: '…' })
        })
    }

    it('a list scan still ends on a ranked list', async () => {
        await playPhase(4)
        expect(await screen.findByText(/Phase 4 — Ranked List/)).toBeTruthy()
    })

    it('a hand-off ends on THE PICK, not a list it never built', async () => {
        await playPhase(4, { handoff: true })
        expect(await screen.findByText(/Phase 4 — The Pick/)).toBeTruthy()
        expect(screen.queryByText(/Ranked List/)).toBe(null)
    })

    it('a hand-off validating a named ticker reads Validation, not Filtering', async () => {
        await playPhase(3, { handoff: true })
        expect(await screen.findByText(/Phase 3 — Validation/)).toBeTruthy()
    })

    it('…and its phase 1 is the ANGLE, not the five-field scan thesis', async () => {
        await playPhase(1, { handoff: true })
        expect(await screen.findByText(/Phase 1 — Angle/)).toBeTruthy()
    })
})

// Updating an investing list leaves the edit session OPEN (the list stays pending so it can be
// refined again) while also raising the research hand-off. Both footers rendered at once: four
// buttons asking two different questions, and two of them navigated away — one of those out of an
// edit the user had not finished.
describe('ScannerPanel — the research offer does not stack on the edit bar', () => {
    const savedList = {
        thesis:     'Quality compounders',
        candidates: [
            { ticker: 'MSFT', direction: 'long' },
            { ticker: 'ASML', direction: 'long' },
        ],
    }

    // Reopen a saved investing list, refine it (a turn is what makes the edit dirty, which is what
    // puts "Update list" on screen), then press Update.
    async function reopenAndUpdate(handlers = {}) {
        render(
            <ScannerPanel
                pipeline="portfolio"
                chatRestore={{ key: 1, scanId: 'scn_1', scan: savedList, messages: [] }}
                seed={{ key: 1, message: 'Drop the richest name.', profile: 'investing' }}
                {...handlers}
            />,
        )
        await waitFor(() => expect(sendStream).toHaveBeenCalled())
        const [, opts] = lastCall()
        await act(async () => {
            opts.onToken('Done.')
            opts.onDone({ reply: 'Done.' })
        })
        const update = await screen.findByRole('button', { name: 'Update list' }, { timeout: 4000 })
        await act(async () => { fireEvent.click(update) })
    }

    it('the offer owns the footer — the edit bar stands down while it is up', async () => {
        await reopenAndUpdate({ onUpdateList: vi.fn() })

        expect(await screen.findByRole('button', { name: /Send top 2 to research/ })).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'Update list' })).toBe(null)
        expect(screen.queryByRole('button', { name: "I'll do it later" })).toBe(null)
    })

    it('declining mid-edit puts the edit bar back instead of walking out of the edit', async () => {
        const onResearchLater = vi.fn()
        await reopenAndUpdate({ onUpdateList: vi.fn(), onResearchLater })

        const notNow = await screen.findByRole('button', { name: 'Not now' })
        await act(async () => { fireEvent.click(notNow) })

        // The session is still open and still refinable — and nobody was navigated anywhere.
        expect(await screen.findByRole('button', { name: 'Update list' })).toBeTruthy()
        expect(screen.queryByRole('button', { name: /Send top 2 to research/ })).toBe(null)
        expect(onResearchLater).not.toHaveBeenCalled()
    })

    it('accepting hands over the list that was just saved', async () => {
        const onResearchList = vi.fn()
        await reopenAndUpdate({ onUpdateList: vi.fn(), onResearchList })

        const send = await screen.findByRole('button', { name: /Send top 2 to research/ })
        await act(async () => { fireEvent.click(send) })

        expect(onResearchList).toHaveBeenCalledTimes(1)
        expect(onResearchList.mock.calls[0][0].candidates.map(c => c.ticker)).toEqual(['MSFT', 'ASML'])
    })
})

// ─── Clear throws the draft away, it does not just look away from it ─────────────
// Reported: resumed an Argus conversation from the hub, cleared it, went back to Axl — and the trade
// desk was still marked, with the portfolio and watchlist doors still shut behind it. Clear emptied
// the panel and left the draft on the server, so every surface that reads /unfinished went on
// describing a conversation the user had just thrown away.
describe('ScannerPanel — clearing a construction thread', () => {
    beforeEach(() => { discardThread.mockClear(); getThread.mockReset().mockResolvedValue(null) })

    it('discards the RESUMED draft, so the desk stops claiming it is unfinished', async () => {
        getThread.mockResolvedValue({ threadId: 'thr_left_at_argus', messages: [{ role: 'user', content: 'scan tech' }] })
        const resumeRef = { current: null }
        render(<ScannerPanel resumeRef={resumeRef} />)
        await act(async () => { await resumeRef.current('thr_left_at_argus') })

        await act(async () => { fireEvent.click(screen.getByTitle('Clear chat')) })

        // The thread the user was actually in — not the fresh id the panel started life with.
        expect(discardThread).toHaveBeenCalledWith('thr_left_at_argus')
    })

    it('a conversation with nothing saved behind it clears without a delete', async () => {
        // Below the substantive floor nothing was ever written; the panel still has to clear cleanly.
        render(<ScannerPanel />)
        await waitFor(() => expect(screen.getByTitle('Clear chat')).toBeTruthy())
        await act(async () => { fireEvent.click(screen.getByTitle('Clear chat')) })

        // Its own unused id is all there is to discard, and deleting it matches nothing server-side.
        expect(discardThread.mock.calls.every(([id]) => id === 'thr_test')).toBe(true)
    })
})

// Persistence used to hang off onDone alone, so the ending that leaves a desk unfinished — the user
// stopping mid-answer — was the one that saved nothing (useChatStream's onStopped is the shared rule
// every desk now answers). The three savers here also went through one helper at the same time: they
// write the SAME thread, and the copies had begun to drift.
describe('ScannerPanel — a turn the user walked out of', () => {
    // The real stop: sse.util swallows the AbortError and returns, so `send` RESOLVES without ever
    // dispatching `done`. Nothing throws — which is exactly why this ending went unnoticed.
    async function stoppedTurn(props = {}) {
        render(<ScannerPanel seed={{ key: 7, message: 'Screen semis for a breakout', profile: 'trading' }} {...props} />)
        await waitFor(() => expect(sendStream).toHaveBeenCalled())
        await act(async () => { await Promise.resolve() })
    }

    it('saves the user’s message, so the desk can say something was left here', async () => {
        await stoppedTurn({ pipeline: 'scan' })

        expect(saveDraft).toHaveBeenCalledTimes(1)
        const arg = saveDraft.mock.calls[0][0]
        expect(arg.agent).toBe('scanner')
        expect(arg.pipeline).toBe('scan')
        expect(arg.threadId).toBe('thr_test')
        expect(arg.messages).toEqual([{ role: 'user', content: 'Screen semis for a breakout' }])
    })

    it('…including the turn that arrives in the SAME COMMIT as the reopen', async () => {
        // The restore and a seeded refine land together (Atlas reopens a sleeve's list with an
        // instruction). Effects run in order, but the state the restore sets is not readable until
        // the render after — so the send used to close over `editingScanId: null` and save the edit
        // conversation as a rival draft, marking the desk unfinished over a list being edited.
        render(
            <ScannerPanel
                chatRestore={{ key: 3, scanId: 'scn_1', scan: { thesis: 'AI infra', profile: 'investing', candidates: [{ ticker: 'MSFT' }] }, messages: [] }}
                seed={{ key: 3, message: 'Drop the richest name.', profile: 'investing' }}
            />,
        )
        await waitFor(() => expect(sendStream).toHaveBeenCalled())
        await act(async () => { await Promise.resolve() })

        expect(saveDraft).not.toHaveBeenCalled()
    })

    it('an EDIT run still saves nothing — that conversation belongs to the list it is editing', async () => {
        // Reopening a saved list is what puts the panel in edit mode, so the gate is exercised
        // through that door rather than by handing the panel a state it cannot be given.
        render(
            <ScannerPanel
                chatRestore={{ key: 2, scanId: 'scn_1', scan: { thesis: 'AI infra', profile: 'investing', candidates: [{ ticker: 'MSFT' }] }, messages: [] }}
            />,
        )
        await screen.findByText(/AI infra/)

        const box = screen.getByRole('textbox')
        fireEvent.change(box, { target: { value: 'Drop the richest name.' } })
        fireEvent.keyDown(box, { key: 'Enter' })
        await waitFor(() => expect(sendStream).toHaveBeenCalled())
        await act(async () => { await Promise.resolve() })

        expect(saveDraft).not.toHaveBeenCalled()
    })
})

// ─── "Send NVDA to Prometheus", asked in the chat ─────────────────────────────────
// A scan's names reach Prometheus by the button under the list; a name the user asks Argus to send
// reaches it by the shared route grammar (`route` + `opening` on the done payload) → the RouteOffer
// button → MainPage's one doorway (onRoute). What the panel owns: offering it, and standing the
// generate bar down while the offer is up.
describe('ScannerPanel — sending the user to another desk by asking', () => {
    const ROUTED = { reply: 'Sending NVDA over.', route: 'research', routeSymbol: 'NVDA', opening: 'Look at NVDA — basing under 250.', edit: null }

    async function askToSend(handlers = {}, done = ROUTED) {
        render(
            <ScannerPanel
                chatRestore={{ key: 1, scanId: 'scn_1', scan: { thesis: 'AI infra', candidates: [{ ticker: 'NVDA' }] }, messages: [] }}
                seed={{ key: 1, message: 'send nvda to prometheus' }}
                {...handlers}
            />,
        )
        await waitFor(() => expect(sendStream).toHaveBeenCalled())
        const [, opts] = lastCall()
        await act(async () => {
            opts.onToken(done.reply)
            opts.onDone(done)
        })
    }

    it('a routed reply offers the desk by BRAND and hands the whole route to the doorway', async () => {
        const onRoute = vi.fn()
        await askToSend({ onRoute })
        const go = await screen.findByRole('button', { name: 'Go to Prometheus · NVDA' }, { timeout: 4000 })
        // The offer owns the footer: no edit bar beside it asking a second question.
        expect(screen.queryByRole('button', { name: 'Update list' })).toBe(null)
        await act(async () => { fireEvent.click(go) })

        expect(onRoute).toHaveBeenCalledTimes(1)
        expect(onRoute.mock.calls[0][0]).toEqual({ route: 'research', routeSymbol: 'NVDA', opening: 'Look at NVDA — basing under 250.', edit: null })
        expect(screen.queryByRole('button', { name: /Go to Prometheus/ })).toBe(null)
    })

    it('"Not now" puts it away, nobody is navigated, and the edit bar comes back', async () => {
        const onRoute = vi.fn()
        await askToSend({ onRoute })
        await screen.findByRole('button', { name: 'Go to Prometheus · NVDA' }, { timeout: 4000 })
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Not now' })) })

        expect(screen.queryByRole('button', { name: /Go to Prometheus/ })).toBe(null)
        expect(onRoute).not.toHaveBeenCalled()
        expect(await screen.findByRole('button', { name: 'Update list' })).toBeTruthy()
    })

    it('a reply that routes nowhere offers nothing', async () => {
        await askToSend({}, { reply: 'Here is the read.' })
        expect(screen.queryByRole('button', { name: /Go to/ })).toBe(null)
    })
})

// ── the Prometheus leg of a radar cut ─────────────────────────────────────────
// Argus cut the board on tradeability; this asks the other question. It is a STEP the user takes,
// not a gate — so what is tested is that it only appears where it means something, that it cuts the
// list rather than decorating it, and that it never leaves the user with nothing to stand on.
describe('ScannerPanel — Prometheus over a radar cut', () => {
    const BOARD = { candidates: [{ ticker: 'NUE' }], runs: 3, runIds: ['Canada:2026-09-08'] }
    const LIST  = {
        thesis: 'Radar cut',
        candidates: [
            { ticker: 'NUE', direction: 'long' },
            { ticker: 'MOS', direction: 'long' },
            { ticker: 'APD', direction: 'long' },
        ],
    }
    const restore = (key = 1) => ({ key, scanId: null, scan: LIST, messages: [] })
    const readBtn = () => screen.queryByText(/Read these .* with Prometheus/)

    beforeEach(() => batchRead.mockReset())

    it('is offered on a radar cut', async () => {
        render(<ScannerPanel radarBoard={BOARD} chatRestore={restore()} />)
        expect(await screen.findByText(/Read these 3 with Prometheus/)).toBeTruthy()
    })

    it('is NOT offered on an ordinary scan — there is nothing for it to read against', async () => {
        render(<ScannerPanel chatRestore={restore(2)} />)
        await screen.findByText('NUE')
        expect(readBtn()).toBe(null)
    })

    it('CUTS the list: refused names leave it, and the reason is reported', async () => {
        batchRead.mockResolvedValue({ rows: [
            { ticker: 'NUE', keep: true,  flag: null, direction: 'long', read: { verdict: 'credible' } },
            { ticker: 'MOS', keep: false, flag: null, direction: 'long', read: { verdict: 'contradicted' } },
            { ticker: 'APD', keep: false, flag: null, direction: 'short', read: { verdict: 'credible', net: 'hurt' } },
        ] })
        render(<ScannerPanel radarBoard={BOARD} chatRestore={restore(3)} />)
        fireEvent.click(await screen.findByText(/Read these 3 with Prometheus/))
        await waitFor(() => expect(screen.getByText(/Prometheus dropped 2/)).toBeTruthy())
        // Gone from the list, not greyed in it — a contradicted name left on screen invites the trade.
        expect(screen.queryByText('MOS')).toBe(null)
        expect(screen.queryByText('APD')).toBe(null)
        expect(screen.getByText('NUE')).toBeTruthy()
        expect(screen.getByText(/contradicted/)).toBeTruthy()
    })

    it('UNCLEAR SHIPS FLAGGED — it stays on the list wearing its caveat', async () => {
        batchRead.mockResolvedValue({ rows: [
            { ticker: 'NUE', keep: true, flag: 'unclear',   direction: 'long', why: 'could not settle', read: { verdict: 'unclear' } },
            { ticker: 'MOS', keep: true, flag: 'direction', direction: 'unclear', why: 'events offset', read: { verdict: 'credible', net: 'unclear' } },
            { ticker: 'APD', keep: true, flag: null,        direction: 'long', read: { verdict: 'credible' } },
        ] })
        render(<ScannerPanel radarBoard={BOARD} chatRestore={restore(4)} />)
        fireEvent.click(await screen.findByText(/Read these 3 with Prometheus/))
        await waitFor(() => expect(screen.getByText(/kept every name/)).toBeTruthy())
        expect(screen.getByText('unsettled')).toBeTruthy()
        expect(screen.getByText('direction?')).toBeTruthy()
        expect(screen.getByText(/2 kept with a caveat/)).toBeTruthy()
    })

    it('NOTHING SURVIVING leaves the list alone rather than stranding the user', async () => {
        // An empty candidate list turns listReady false, which takes the summary AND the Generate
        // button off screen — no list, no verdict, no way back.
        batchRead.mockResolvedValue({ rows: LIST.candidates.map(c => (
            { ticker: c.ticker, keep: false, flag: null, direction: 'long', read: { verdict: 'priced_in' } }
        )) })
        render(<ScannerPanel radarBoard={BOARD} chatRestore={restore(5)} />)
        fireEvent.click(await screen.findByText(/Read these 3 with Prometheus/))
        await waitFor(() => expect(screen.getByText(/refused all 3/)).toBeTruthy())
        expect(screen.getByText('NUE')).toBeTruthy()
        expect(screen.getByText(/Generate list/)).toBeTruthy()
    })

    it('a name missing from the answer keeps its place — a gap in the read is not a refusal', async () => {
        batchRead.mockResolvedValue({ rows: [
            { ticker: 'NUE', keep: true, flag: null, direction: 'long', read: { verdict: 'credible' } },
        ] })
        render(<ScannerPanel radarBoard={BOARD} chatRestore={restore(7)} />)
        fireEvent.click(await screen.findByText(/Read these 3 with Prometheus/))
        await waitFor(() => expect(screen.getByText(/kept every name/)).toBeTruthy())
        for (const t of ['NUE', 'MOS', 'APD']) expect(screen.getByText(t)).toBeTruthy()
    })
})

// The step's own states, rendered directly.
//
// WHY NOT THROUGH THE PANEL. Driving the failure path end to end means a rejected service call, and
// this runner attributes that rejection to the test however it is shaped — a bare "{ response: … }"
// failure beside a panel that had in fact recovered and rendered the right message. (Verified by
// hand: the recovery renders "The read failed — mongo down. The list is untouched.", keeps every
// name, and offers Try again.) What the panel's catch does is two lines — log, and set this state —
// so the coverage worth having is that each state READS correctly, which is here.
describe('PrometheusStep — what each state says', () => {
    it('offers the read, named with the count, before it has run', () => {
        render(<PrometheusStep names={7} cut={null} busy={false} onRead={vi.fn()} />)
        expect(screen.getByText('Read these 7 with Prometheus')).toBeTruthy()
    })

    it('says who is working while it runs, and refuses a second press', () => {
        const onRead = vi.fn()
        render(<PrometheusStep names={7} cut={null} busy onRead={onRead} />)
        const btn = screen.getByText(/Prometheus is reading 7/).closest('button')
        expect(btn.disabled).toBe(true)
        fireEvent.click(btn)
        expect(onRead).not.toHaveBeenCalled()
    })

    it('a failed read says the list is untouched, and offers a retry', () => {
        const onRead = vi.fn()
        render(<PrometheusStep names={7} cut={{ error: 'mongo down', dropped: [], flagged: 0, survived: true }} onRead={onRead} />)
        expect(screen.getByText(/The read failed — mongo down\. The list is untouched\./)).toBeTruthy()
        fireEvent.click(screen.getByText('Try again'))
        expect(onRead).toHaveBeenCalledTimes(1)
    })

    it('names the dropped names and their reason, not just a count', () => {
        render(<PrometheusStep names={3} cut={{ survived: true, flagged: 1, dropped: [
            { ticker: 'MOS', read: { verdict: 'contradicted' } },
            { ticker: 'APD', read: { verdict: 'priced_in' } },
        ] }} />)
        expect(screen.getByText(/Prometheus dropped 2/)).toBeTruthy()
        expect(screen.getByText(/MOS contradicted/)).toBeTruthy()
        expect(screen.getByText(/APD priced in/)).toBeTruthy()
        expect(screen.getByText(/1 kept with a caveat/)).toBeTruthy()
    })

    it('a long drop list is summarised rather than printed whole', () => {
        const dropped = ['A', 'B', 'C', 'D', 'E'].map(t => ({ ticker: t, read: { verdict: 'contradicted' } }))
        render(<PrometheusStep names={9} cut={{ survived: true, flagged: 0, dropped }} />)
        expect(screen.getByText(/A, B, C \+2 contradicted/)).toBeTruthy()
    })

    it('nothing surviving says so AND says the list is unchanged', () => {
        render(<PrometheusStep names={3} cut={{ survived: false, flagged: 0, dropped: [
            { ticker: 'MOS', read: { verdict: 'priced_in' } },
        ] }} />)
        expect(screen.getByText(/refused all 1/)).toBeTruthy()
        expect(screen.getByText(/list above is\s+unchanged/)).toBeTruthy()
    })
})
