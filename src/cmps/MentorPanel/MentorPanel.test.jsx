import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'

// jsdom implements no layout, so scrollIntoView is missing entirely. useChatScroll calls it after
// every turn — without this stub the panel throws before any assertion runs.
window.HTMLElement.prototype.scrollIntoView = vi.fn()

// Service modules reach for axios/localStorage at import time — stub the whole surface so the
// tree mounts and every call is observable.
const armSetup      = vi.fn().mockResolvedValue({ id: 's1', status: 'looking' })
const generateSetup = vi.fn().mockResolvedValue({ id: 's1', asset: 'NVDA', status: 'waiting' })
const updateSetup   = vi.fn().mockResolvedValue({ id: 's1', asset: 'NVDA', status: 'waiting' })
const saveChatState = vi.fn().mockResolvedValue({})
const sendStream    = vi.fn().mockResolvedValue(undefined)

vi.mock('../../services/mentor/mentor.service.remote.js', () => ({
    mentorService: {
        sendStream:    (...a) => sendStream(...a),
        generateSetup: (...a) => generateSetup(...a),
        updateSetup:   (...a) => updateSetup(...a),
        saveChatState: (...a) => saveChatState(...a),
        armSetup:      (...a) => armSetup(...a),
        listSetups:    vi.fn().mockResolvedValue([]),
    },
    SETUPS_CHANGED: 'mentor-setups-changed',
}))
const discardThread = vi.fn()
const saveDraft     = vi.fn()
vi.mock('../../services/threads/threads.service.remote.js', () => ({
    threadsService: { saveDraft: (...a) => saveDraft(...a), linkThread: vi.fn(), getThread: vi.fn(), discardThread: (...a) => discardThread(...a) },
    newThreadId: () => 't1',
    // Mirrors the real helper (discard what was saved, mint a fresh id) so the panel's Clear is
    // tested for what it DOES, not merely that it runs. The helper itself is unit-tested at source.
    clearThread: (ref) => { if (ref?.current) discardThread(ref.current); if (ref) ref.current = 't2' },
}))
vi.mock('../../customHooks/useMicInput.js', () => ({
    useMicInput: () => ({ isRecording: false, isTranscribing: false, toggle: vi.fn(), cancel: vi.fn() }),
}))

const { MentorPanel } = await import('./MentorPanel.jsx')

const SETUP = {
    asset: 'NVDA', direction: 'long', type: 'swing', trade_mode: 'smc', timeframe: '4hr',
    thesis: 'Sweep and reclaim of the 199 shelf.',
    watch: [{ kind: 'structure', look_for: 'CHoCH up on the 1hr', timeframe: '1hr', weight: 'primary' }],
    entry_zones: [{ id: 'ez1', lower: 199, upper: 201, quantity: 110 }],
    stop_zones:  [{ id: 'sz1', lower: 196.5, upper: 197.9, quantity: 110 }],
    tp_zones:    [{ id: 'tp1', lower: 210, upper: 211, quantity: 110 }],
    rr: 2.1, quantity: 110,
}

const ACCOUNTS = [{ id: 'a1', broker: 'paper', name: 'Paper' }]
const props = (over = {}) => ({
    availableAccounts: ACCOUNTS, selectedAccounts: ['a1'], mainAccountId: 'a1', ...over,
})

// Drive one agent turn by invoking the onDone the panel handed to the stream, then wait for the
// stream to actually close — _send bails while isLoading, so without this a following turn is
// silently dropped and the assertions read a stale call list.
async function runTurn(done) {
    const before = sendStream.mock.calls.length
    sendStream.mockImplementationOnce(async (_history, opts) => { opts.onDone?.(done) })
    const box = screen.getByRole('textbox')
    fireEvent.change(box, { target: { value: 'long NVDA swing' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    await waitFor(() => expect(sendStream.mock.calls.length).toBe(before + 1))
    await waitFor(() => expect(screen.getByRole('textbox').disabled).toBe(false))
}

beforeEach(() => { vi.clearAllMocks() })
afterEach(cleanup)

describe('MentorPanel', () => {
    it('shows the intro with suggestions and no worksheet until there is a setup', () => {
        render(<MentorPanel {...props()} />)
        expect(screen.getByText(/I want to buy NVDA on a pullback/)).toBeTruthy()
        expect(screen.queryByRole('button', { name: /Generate setup/ })).toBeNull()
    })

    it('carries the draft and coverage back to the server as chatState', async () => {
        render(<MentorPanel {...props()} />)
        await runTurn({ reply: 'ok', setup: SETUP, coverage: ['markets'], readiness: { ready: true, missing: [] } })

        // The next turn must echo the settled draft — Mentor's <setup> block is stripped from the
        // visible history, so without this a thin re-emit would wipe the zones.
        await runTurn({ reply: 'ok2', coverage: ['markets', 'technicals'] })
        const opts = sendStream.mock.calls[1][1]
        expect(opts.chatState.draft.asset).toBe('NVDA')
        expect(opts.chatState.coverage).toEqual(['markets'])
        expect(opts.chatState.active_asset).toBe('NVDA')
    })

    it('never sends currentPhase — Mentor has no phases', async () => {
        render(<MentorPanel {...props()} />)
        await runTurn({ reply: 'ok', setup: SETUP, coverage: ['markets'] })
        expect(sendStream.mock.calls[0][1]).not.toHaveProperty('currentPhase')
    })

    it('renders coverage chips as the setup fills in', async () => {
        render(<MentorPanel {...props()} />)
        await runTurn({ reply: 'ok', setup: SETUP, coverage: ['markets', 'technicals'] })
        await waitFor(() => expect(screen.getByTitle(/^Markets — read/)).toBeTruthy())
        expect(screen.getByTitle(/^Company — not read yet/)).toBeTruthy()
    })

    it('blocks Generate when no account is marked, and says so', async () => {
        render(<MentorPanel {...props({ selectedAccounts: [] })} />)
        await runTurn({ reply: 'ok', setup: SETUP, readiness: { ready: true, missing: [] } })
        await waitFor(() => expect(screen.getByRole('button', { name: /Generate setup/ }).disabled).toBe(true))
        expect(screen.getByText(/trading account/)).toBeTruthy()
    })

    it('names a CONTRADICTION, not just a gap — a complete-but-incoherent setup still refuses', async () => {
        // Readiness has two refusals: something absent, and something that doesn't add up. Only the
        // first used to reach the panel, so a setup whose validity floor sat below its own stop gave
        // a dark button with NO stated reason. Seen on a live run.
        render(<MentorPanel {...props()} />)
        await runTurn({ reply: 'ok', setup: SETUP, readiness: { ready: false, missing: [], problems: ['validity floor sits below the stop'] } })

        await waitFor(() => expect(screen.getByRole('button', { name: /Generate setup/ }).disabled).toBe(true))
        expect(screen.getByText(/validity floor sits below the stop/)).toBeTruthy()
        expect(screen.queryByText(/Still needs/)).toBeNull()
    })

    it('keeps the contradiction visible when the account is missing too', async () => {
        // The account gap used to REBUILD the readiness object, dropping `problems` on the floor.
        render(<MentorPanel {...props({ selectedAccounts: [] })} />)
        await runTurn({ reply: 'ok', setup: SETUP, readiness: { ready: false, missing: [], problems: ['away pivot sits inside the validity range'] } })

        await waitFor(() => expect(screen.getByText(/trading account/)).toBeTruthy())
        expect(screen.getByText(/away pivot sits inside/)).toBeTruthy()
    })

    it('never shows a dark button with nothing to say', async () => {
        render(<MentorPanel {...props()} />)
        await runTurn({ reply: 'ok', setup: SETUP, readiness: { ready: false, missing: [], problems: [] } })
        await waitFor(() => expect(screen.getByText(/ask Mentor what’s outstanding/)).toBeTruthy())
    })

    it('STOPS after Generate to offer Arm — a saved setup is not yet monitored', async () => {
        const onGenerated = vi.fn()
        render(<MentorPanel {...props({ onGenerated })} />)
        await runTurn({ reply: 'ok', setup: SETUP, readiness: { ready: true, missing: [] } })

        fireEvent.click(screen.getByRole('button', { name: /Generate setup/ }))
        await waitFor(() => expect(generateSetup).toHaveBeenCalled())

        // The critical distinction: generating does NOT start monitoring, and must not silently
        // bounce the user back to the hub as though it had.
        expect(await screen.findByText(/nothing is watching it yet/)).toBeTruthy()
        expect(armSetup).not.toHaveBeenCalled()
        expect(onGenerated).not.toHaveBeenCalled()
    })

    // THE ARGUMENT, not merely the call. `onClick={handleGenerate}` hands React's synthetic event to
    // the first parameter, and while that parameter was a `draft` override the event sailed past the
    // truthiness guard and went to the server AS THE PLAN — axios threw on the circular DOM refs,
    // the catch logged, and the button did nothing. Every test around this one asserted only that
    // generateSetup RAN, so the whole file stayed green while Generate was dead in the app.
    it('sends the WORKSHEET as the plan, never the click event', async () => {
        render(<MentorPanel {...props()} />)
        await runTurn({ reply: 'ok', setup: SETUP, readiness: { ready: true, missing: [] } })

        fireEvent.click(screen.getByRole('button', { name: /Generate setup/ }))
        await waitFor(() => expect(generateSetup).toHaveBeenCalled())

        const [plan, sentAccounts, mainId] = generateSetup.mock.calls[0]
        expect(plan.asset).toBe('NVDA')
        expect(plan.nativeEvent).toBeUndefined()   // a SyntheticEvent's tell
        expect(sentAccounts).toEqual(ACCOUNTS)
        expect(mainId).toBe('a1')
    })

    it('says why Generate was refused, rather than leaving a button that looks pressed', async () => {
        const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
        const err   = vi.spyOn(console, 'error').mockImplementation(() => {})
        generateSetup.mockRejectedValueOnce(new Error('broker gate refused'))

        render(<MentorPanel {...props()} />)
        await runTurn({ reply: 'ok', setup: SETUP, readiness: { ready: true, missing: [] } })
        fireEvent.click(screen.getByRole('button', { name: /Generate setup/ }))

        await waitFor(() => expect(alert).toHaveBeenCalledWith(expect.stringMatching(/broker gate refused/)))
        // …and the desk is usable again, not stuck on 'Generating…'.
        await waitFor(() => expect(screen.getByRole('button', { name: /Generate setup/ }).disabled).toBe(false))
        alert.mockRestore()
        err.mockRestore()
    })

    it('arms on request, then returns to the hub', async () => {
        const onGenerated = vi.fn()
        render(<MentorPanel {...props({ onGenerated })} />)
        await runTurn({ reply: 'ok', setup: SETUP, readiness: { ready: true, missing: [] } })
        fireEvent.click(screen.getByRole('button', { name: /Generate setup/ }))

        fireEvent.click(await screen.findByRole('button', { name: /Arm it/ }))
        await waitFor(() => expect(armSetup).toHaveBeenCalledWith('s1'))
        await waitFor(() => expect(onGenerated).toHaveBeenCalled())
    })

    it('can leave a setup waiting without arming it', async () => {
        const onGenerated = vi.fn()
        render(<MentorPanel {...props({ onGenerated })} />)
        await runTurn({ reply: 'ok', setup: SETUP, readiness: { ready: true, missing: [] } })
        fireEvent.click(screen.getByRole('button', { name: /Generate setup/ }))

        fireEvent.click(await screen.findByRole('button', { name: /Leave it waiting/ }))
        await waitFor(() => expect(onGenerated).toHaveBeenCalled())
        expect(armSetup).not.toHaveBeenCalled()
    })

    it('offers candidates when Mentor returns an offer instead of a worksheet', async () => {
        render(<MentorPanel {...props()} />)
        await runTurn({
            reply: 'Here is what I would consider.',
            setups: { candidates: [
                { label: 'Sweep and reclaim', pitch: 'Best risk.', setup: SETUP },
                { label: 'Break of the shelf', pitch: 'Momentum.', setup: { ...SETUP, trade_mode: 'classical' } },
            ] },
        })
        // JSX splits `{n} ways to play it` into separate text nodes, so match the static part.
        const picker = (await screen.findByText(/ways to play it/)).closest('.candidate-picker')
        expect(within(picker).getByText('Sweep and reclaim')).toBeTruthy()
        expect(within(picker).getByText('Break of the shelf')).toBeTruthy()
    })

    it('picking a candidate makes it the worksheet AND tells Mentor in words', async () => {
        render(<MentorPanel {...props()} />)
        await runTurn({
            reply: 'options',
            setups: { candidates: [{ label: 'Sweep and reclaim', pitch: 'Best risk.', setup: SETUP }] },
        })

        fireEvent.click(await screen.findByText('Sweep and reclaim'))

        // The draft and the conversation must not diverge on which one was picked.
        await waitFor(() => expect(sendStream).toHaveBeenCalledTimes(2))
        expect(sendStream.mock.calls[1][0].at(-1).content).toMatch(/Sweep and reclaim/)
        expect(sendStream.mock.calls[1][1].chatState.draft.asset).toBe('NVDA')
    })

    // Clicking an earnings/IPO row in the calendar routes here, not to the idea desk. The catalyst
    // arrives as the USER's turn — the click is them naming the ticker — so it must actually be
    // sent, and sent once per click however often the panel re-renders.
    it('a calendar seed opens the build as the user’s own turn, exactly once', async () => {
        const seed = { key: 1, message: 'I want to build a setup around NVDA earnings — it reports on Thu, Jul 31 after the close.' }
        const { rerender } = render(<MentorPanel {...props({ seed })} />)

        await waitFor(() => expect(sendStream).toHaveBeenCalledTimes(1))
        expect(sendStream.mock.calls[0][0].at(-1)).toEqual({ role: 'user', content: seed.message })

        rerender(<MentorPanel {...props({ seed })} />)
        expect(sendStream).toHaveBeenCalledTimes(1)
    })

    it('no seed sends nothing — the panel still opens on its intro', () => {
        render(<MentorPanel {...props()} />)
        expect(sendStream).not.toHaveBeenCalled()
        expect(screen.getByText(/I want to buy NVDA on a pullback/)).toBeTruthy()
    })

    it('a new user turn clears a stale candidate offer', async () => {
        render(<MentorPanel {...props()} />)
        await runTurn({ reply: 'options', setups: { candidates: [{ label: 'Sweep and reclaim', setup: SETUP }] } })
        expect(await screen.findByText('Sweep and reclaim')).toBeTruthy()

        await runTurn({ reply: 'more thoughts' })
        await waitFor(() => expect(screen.queryByText('Sweep and reclaim')).toBeNull())
    })

    // ── Edit mode ─────────────────────────────────────────────────────────────
    // The setup pencil reopens THIS conversation. Which is only possible because Generate saves
    // chat_state with the setup — see the generate test above.

    it('reopens the saved conversation and worksheet from a chat restore', () => {
        const restore = {
            key: 'r1',
            setup: SETUP,
            messages: [{ role: 'user', content: 'long NVDA swing' }, { role: 'assistant', content: 'Here is the plan.' }],
            coverage: ['markets'],
        }
        render(<MentorPanel {...props({ editingSetupId: 's1', chatRestore: restore })} />)

        expect(screen.getByText('long NVDA swing')).toBeTruthy()
        expect(screen.getByText('Here is the plan.')).toBeTruthy()
        expect(screen.getByTitle(/^Markets — read/)).toBeTruthy()
    })

    // The regression this guards: routing a mid-edit turn through updateSetup would re-run the
    // venue gate and send a WATCHED setup back to 'waiting' — Talos would stop watching it because
    // the user asked a question about it. Only "Update setup" writes the plan.
    it('a turn while editing saves the conversation only — never the plan', async () => {
        render(<MentorPanel {...props({ editingSetupId: 's1', chatRestore: { key: 'r1', setup: SETUP, messages: [], coverage: [] } })} />)
        await runTurn({ reply: 'how about a tighter stop', setup: SETUP })

        await waitFor(() => expect(saveChatState).toHaveBeenCalled())
        expect(saveChatState.mock.calls[0][0]).toBe('s1')
        expect(saveChatState.mock.calls[0][1].draft.asset).toBe('NVDA')
        expect(updateSetup).not.toHaveBeenCalled()
    })

    // The regression this guards is a desk that looks BROKEN rather than one that is in a mode.
    // Editing hides "Generate setup" and shows nothing in its place until the plan moves, so with a
    // header that read "your setup" either way, re-opening AVGO was visually identical to a fresh
    // chat whose Generate button had gone missing.
    it('says which setup is being edited, and what makes Update appear', () => {
        render(<MentorPanel {...props({ editingSetupId: 's1', chatRestore: { key: 'r1', setup: SETUP, messages: [], coverage: [] } })} />)

        expect(screen.getByText('editing NVDA')).toBeTruthy()
        expect(screen.getByText(/Update setup.*appears once the plan moves/)).toBeTruthy()
        // Editing is not building: the fresh-build button must stay gone.
        expect(screen.queryByRole('button', { name: /Generate setup/ })).toBeNull()
    })

    // THE FOLD. The worksheet is a reference you glance up at, not the work — and it grows past a
    // screen once there are two ways in, which is how a preview pinned above the chat ends up
    // squeezing the conversation it is supposed to serve. So it arrives as one line and opens on
    // request; the line itself carries the digest, so folded is informative rather than merely small.
    it('opens the preview folded to one line, and expands it on a click', async () => {
        render(<MentorPanel {...props()} />)
        await runTurn({ reply: 'ok', setup: SETUP, readiness: { ready: true, missing: [] } })

        expect(screen.getByText('NVDA · LONG')).toBeTruthy()
        expect(screen.queryByText(SETUP.thesis)).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: /your setup/ }))

        expect(screen.getByText(SETUP.thesis)).toBeTruthy()
        // Open, the digest is redundant with the worksheet under it — and repeating the asset twice
        // in ten vertical pixels reads as two setups.
        expect(screen.queryByText('NVDA · LONG')).toBeNull()
    })

    // A preview that re-folded on every turn would be shut exactly when the setup is moving, which
    // is the one time it is worth looking at. The choice is the user's until they clear the desk.
    it('keeps the preview open across the turns that follow', async () => {
        render(<MentorPanel {...props()} />)
        await runTurn({ reply: 'ok', setup: SETUP })

        fireEvent.click(screen.getByRole('button', { name: /your setup/ }))
        await runTurn({ reply: 'tightened the stop', setup: { ...SETUP, thesis: 'Reclaim, tighter stop.' } })

        expect(screen.getByText('Reclaim, tighter stop.')).toBeTruthy()
    })

    // Coverage can land before any draft does — Mentor reads the tape before it draws a level. With
    // nothing to unfold the header must not offer a control that does nothing.
    it('leaves the header inert while there is coverage but no draft', async () => {
        render(<MentorPanel {...props()} />)
        await runTurn({ reply: 'reading the tape', coverage: ['markets'] })

        expect(screen.getByText('your setup')).toBeTruthy()
        expect(screen.queryByRole('button', { name: /your setup/ })).toBeNull()
    })

    it('a fresh build keeps the generic worksheet header', async () => {
        render(<MentorPanel {...props()} />)
        await runTurn({ reply: 'ok', setup: SETUP, readiness: { ready: true, missing: [] } })

        expect(screen.getByText('your setup')).toBeTruthy()
        expect(screen.queryByText(/editing/)).toBeNull()
    })

    // THE CARD DOORWAY. A restore carrying an `ask` opens the turn; the pencil's restore (no ask)
    // still lands silent. The regression guarded is "Re-draw it" leading to a desk with nothing on it.
    it('a restore carrying an ask opens the turn on arrival', async () => {
        render(<MentorPanel {...props({
            editingSetupId: 's1',
            chatRestore: { key: 'r1', setup: SETUP, messages: [], coverage: [], ask: 'Talos says the map has drifted. Re-draw it.' },
        })} />)

        await waitFor(() => expect(sendStream).toHaveBeenCalled())
        const [history] = sendStream.mock.calls[0]
        expect(history.at(-1)).toEqual({ role: 'user', content: 'Talos says the map has drifted. Re-draw it.' })
    })

    // The turn must arrive with the setup it is about. `_send` runs inside the restore EFFECT, so
    // the state set beside it has not re-rendered — read from the closure, both of these were empty,
    // and the re-draw turn would reach Mentor with no plan and no conversation behind it.
    it('the opened turn carries the restored conversation and draft, not the stale closure', async () => {
        const prior = [
            { role: 'user',      content: 'long AVGO on the 199 reclaim' },
            { role: 'assistant', content: 'Here is the plan.' },
        ]
        render(<MentorPanel {...props({
            editingSetupId: 's1',
            chatRestore: { key: 'r1', setup: SETUP, messages: prior, coverage: ['markets'], ask: 'Re-draw it.' },
        })} />)

        await waitFor(() => expect(sendStream).toHaveBeenCalled())
        const [history, opts] = sendStream.mock.calls[0]
        expect(history.map(m => m.content)).toEqual([...prior.map(m => m.content), 'Re-draw it.'])
        expect(opts.chatState.draft.asset).toBe('NVDA')
        expect(opts.chatState.active_asset).toBe('NVDA')
        // The dimensions read so far belong to THIS setup — the previous one's chips would tell
        // Mentor it had already looked at things it hasn't.
        expect(opts.chatState.coverage).toEqual(['markets'])
    })

    it('the pencil restore (no ask) still lands silent', async () => {
        render(<MentorPanel {...props({ editingSetupId: 's1', chatRestore: { key: 'r1', setup: SETUP, messages: [], coverage: [] } })} />)
        // Nothing sent, and the hint that tells the user how to start is the one thing on offer.
        await waitFor(() => expect(screen.getByText(/appears once the plan moves/)).toBeTruthy())
        expect(sendStream).not.toHaveBeenCalled()
    })

    it('Update setup writes the plan once, then hands the edit back', async () => {
        const onEditDone = vi.fn()
        render(<MentorPanel {...props({ editingSetupId: 's1', onEditDone, chatRestore: { key: 'r1', setup: SETUP, messages: [], coverage: [] } })} />)
        // The Update button appears only once the edit is dirty — there is nothing to write until
        // the conversation has actually changed something.
        expect(screen.queryByRole('button', { name: /Update setup/ })).toBeNull()
        await runTurn({ reply: 'tightened', setup: SETUP, readiness: { ready: true, missing: [] } })

        fireEvent.click(await screen.findByRole('button', { name: /Update setup/ }))
        await waitFor(() => expect(updateSetup).toHaveBeenCalled())
        expect(updateSetup.mock.calls[0][0]).toBe('s1')
        await waitFor(() => expect(onEditDone).toHaveBeenCalled())
        expect(generateSetup).not.toHaveBeenCalled()   // an edit must never create a second setup
    })
})

// ── The Argus hand-off ─────────────────────────────────────────────────────────
// The trade desk now enters at a scan and builds at Mentor, so a name can arrive from Argus rather
// than from the user. It arrives as an ARTIFACT, not as an opening sentence: Argus recommends a
// lens, Mentor authors `trade_mode`, and a recommendation that survived only as prose would be
// indistinguishable from the user having asked for it.

const HANDOFF = (over = {}) => ({
    key: 'h1', kind: 'candidate_list',
    items: [{ ticker: 'nvda', direction: 'long', thesis: 'Reclaimed the 199 shelf on volume.',
              recommended_mode: 'smc', ...over }],
})

describe('MentorPanel — the Argus hand-off', () => {
    it('opens on the handed name and carries the recommended lens as data', async () => {
        render(<MentorPanel {...props({ inbox: HANDOFF() })} />)
        await waitFor(() => expect(sendStream).toHaveBeenCalled())

        const [history, opts] = sendStream.mock.calls[0]
        expect(history.at(-1).content).toContain('NVDA')
        expect(history.at(-1).content).toContain('Reclaimed the 199 shelf')
        // The lens rides the body, not the sentence — this is the whole reason it hops as an artifact.
        expect(opts.seed).toMatchObject({ ticker: 'NVDA', direction: 'long', recommended_mode: 'smc' })
    })

    it('opens as a name to work on, never as the user\'s own plan', async () => {
        // A name off a screen is not one the user brought. Opening as though it were invites Mentor
        // to pressure-test a plan nobody has made yet.
        render(<MentorPanel {...props({ inbox: HANDOFF({ thesis: null }) })} />)
        await waitFor(() => expect(sendStream).toHaveBeenCalled())
        expect(sendStream.mock.calls[0][0].at(-1).content).not.toContain('my own')
    })

    it('announces the hand-off once — the next turn is an ordinary turn', async () => {
        render(<MentorPanel {...props({ inbox: HANDOFF() })} />)
        await waitFor(() => expect(sendStream).toHaveBeenCalled())
        await waitFor(() => expect(screen.getByRole('textbox').disabled).toBe(false))

        await runTurn({ reply: 'ok' })
        // Re-sending the seed would re-announce a name as newly handed over on every later turn,
        // and the model would keep re-opening a build that is already under way.
        expect(sendStream.mock.calls.at(-1)[1].seed).toBeFalsy()
    })

    it('REPLAYS a hand-off it is remounted with — which is why the sender must shut the door', async () => {
        // Not a wish, a warning. The hand-off is consumed by an effect keyed on the artifact, and an
        // effect runs on MOUNT, so a panel that comes back holding the same artifact sends it again.
        // On a live run (2026-08-16) that opened a second AVGO conversation half an hour after the
        // setup was already armed, off any pipeline, and badged a desk the user had never been to.
        // The fix is upstream — MainPage's doors.clear() on the way home (services/pipeline/doors.js)
        // — so what this pins is the reason it has to be there.
        const { unmount } = render(<MentorPanel {...props({ inbox: HANDOFF() })} />)
        await waitFor(() => expect(sendStream).toHaveBeenCalledTimes(1))

        unmount()
        render(<MentorPanel {...props({ inbox: HANDOFF() })} />)   // same artifact, same key
        await waitFor(() => expect(sendStream).toHaveBeenCalledTimes(2))
    })

    it('a hand-off the sender has cleared opens nothing on a remount', async () => {
        // The other half: once the door is shut, the panel that remounts starts on its intro.
        const { unmount } = render(<MentorPanel {...props({ inbox: HANDOFF() })} />)
        await waitFor(() => expect(sendStream).toHaveBeenCalledTimes(1))

        unmount()
        render(<MentorPanel {...props({ inbox: null })} />)
        await new Promise(r => setTimeout(r, 20))
        expect(sendStream).toHaveBeenCalledTimes(1)
        expect(screen.getByText(/I want to buy NVDA on a pullback/)).toBeTruthy()
    })

    it('a nameless or absent hand-off opens nothing', async () => {
        // A seed without a ticker names nothing, and is worse than absent: the desk would open on
        // a blank and ask the user what they meant.
        render(<MentorPanel {...props({ inbox: { key: 'h2', kind: 'candidate_list', items: [{}] } })} />)
        render(<MentorPanel {...props({ inbox: null })} />)
        await new Promise(r => setTimeout(r, 20))
        expect(sendStream).not.toHaveBeenCalled()
    })
})

// REPORTED 2026-08-19: a setup seeded from the earnings calendar, Stop pressed six seconds in while
// the data tools retried 429s — and Axl showed no unfinished work at any desk. Nothing had been
// saved: `_persist` hangs off onDone, and the abort path never reaches it (useChatStream's onStopped
// is the shared rule this desk now answers). The conversation the user came back to was React state
// behind a `display:none` tab, and a reload would have taken it.
describe('MentorPanel — a turn the user walked out of', () => {
    async function stoppedTurn(over = {}) {
        render(<MentorPanel {...props(over)} />)
        // The abort a Stop raises, exactly as the service surfaces it.
        sendStream.mockImplementationOnce(async () => { throw new DOMException('aborted', 'AbortError') })
        const box = screen.getByRole('textbox')
        fireEvent.change(box, { target: { value: 'AAPL reports Thursday — build me a setup' } })
        fireEvent.keyDown(box, { key: 'Enter' })
        await waitFor(() => expect(screen.getByRole('textbox').disabled).toBe(false))
    }

    it('saves the conversation anyway, so the desk can say something was left here', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {})
        await stoppedTurn({ pipeline: null })

        expect(saveDraft).toHaveBeenCalledTimes(1)
        const arg = saveDraft.mock.calls[0][0]
        expect(arg.agent).toBe('mentor')     // must match the backend whitelist, or it is a silent 400
        expect(arg.threadId).toBe('t1')
        expect(arg.messages).toEqual([{ role: 'user', content: 'AAPL reports Thursday — build me a setup' }])
        err.mockRestore()
    })

    it('appends no assistant turn — there was no reply, and an empty one would resume as a lie', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {})
        await stoppedTurn()
        expect(saveDraft.mock.calls[0][0].messages.some(m => m.role === 'assistant')).toBe(false)
        err.mockRestore()
    })

    it('carries the desk, so the marker lands on ONE route', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {})
        await stoppedTurn({ pipeline: 'assist' })
        expect(saveDraft.mock.calls[0][0].pipeline).toBe('assist')
        err.mockRestore()
    })

    it('mid-EDIT it writes the chat back onto the setup instead — never a rival draft', async () => {
        // The editing branch is the one place Mentor must NOT save a thread: the conversation
        // belongs to the setup being edited. A stopped turn does not change which of the two it is.
        const err = vi.spyOn(console, 'error').mockImplementation(() => {})
        await stoppedTurn({ editingSetupId: 's1' })
        expect(saveDraft).not.toHaveBeenCalled()
        expect(saveChatState).toHaveBeenCalledTimes(1)
        expect(saveChatState.mock.calls[0][1].messages.at(-1))
            .toEqual({ role: 'user', content: 'AAPL reports Thursday — build me a setup' })
        err.mockRestore()
    })
})

// ── The third opening move ───────────────────────────────────────────────────
// Someone arriving with the plan already made used to get a FORM here: a whole-panel worksheet that
// replaced the conversation, opened by a chip that was an ACTION rather than a sentence. They are
// interviewed for it now, so the chip is a sentence like the other two — and the panel never leaves
// the conversation to take the plan down.
describe('the “I already have the setup” chip', () => {
    const chatBox = () => screen.queryByPlaceholderText(/A ticker, a direction and a horizon/)

    it('opens the interview as a turn, instead of a surface over the chat', async () => {
        render(<MentorPanel {...props()} />)
        expect(chatBox()).toBeTruthy()

        fireEvent.click(screen.getByText(/I already have the exact setup/))
        await waitFor(() => expect(sendStream).toHaveBeenCalledTimes(1))

        // The chip's own words ARE the user's turn. Nothing is composed on their behalf and nothing
        // is hidden from the thread — the whole reason the express hand-off needed a server-built
        // instruction was that it had no turn of its own to be.
        const [history] = sendStream.mock.calls[0]
        expect(history.at(-1)).toEqual({ role: 'user', content: 'I already have the exact setup — take it down' })

        // No mode. The interview happens in the conversation that was already on screen, so the one
        // input at this desk stays exactly where it was.
        expect(chatBox()).toBeTruthy()
    })
})
