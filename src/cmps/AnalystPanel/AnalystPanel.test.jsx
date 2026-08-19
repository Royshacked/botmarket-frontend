import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, act, fireEvent } from '@testing-library/react'
import { KIND, makeArtifact } from '../../services/pipeline/artifact.js'

window.HTMLElement.prototype.scrollIntoView = vi.fn()

const sendStream = vi.fn().mockResolvedValue(undefined)
const initiateCoverage = vi.fn()
const updateCoverage   = vi.fn()
vi.mock('../../services/analyst/analyst.service.remote.js', () => ({
    analystService: {
        sendStream:       (...a) => sendStream(...a),
        initiateCoverage: (...a) => initiateCoverage(...a),
        updateCoverage:   (...a) => updateCoverage(...a),
    },
}))
// The draft-thread mechanism, mirroring MentorPanel's mock: `clearThread` reproduces the real helper
// (discard what was saved, mint a fresh id) so Clear is tested for what it DOES.
const saveDraft      = vi.fn()
const linkThread     = vi.fn()
const getThread      = vi.fn()
const discardThread  = vi.fn()
vi.mock('../../services/threads/threads.service.remote.js', () => ({
    threadsService: {
        saveDraft:      (...a) => saveDraft(...a),
        linkThread:     (...a) => linkThread(...a),
        getThread:      (...a) => getThread(...a),
        discardThread:  (...a) => discardThread(...a),
    },
    newThreadId: () => 't1',
    clearThread: (ref) => { if (ref?.current) discardThread(ref.current); if (ref) ref.current = 't2' },
}))
vi.mock('../../customHooks/useMicInput.js', () => ({
    useMicInput: () => ({ isRecording: false, isTranscribing: false, toggle: vi.fn(), cancel: vi.fn() }),
}))

const { AnalystPanel } = await import('./AnalystPanel.jsx')

const lastCall = () => sendStream.mock.calls.at(-1)

beforeEach(() => {
    sendStream.mockClear(); initiateCoverage.mockReset(); updateCoverage.mockReset()
    saveDraft.mockClear(); linkThread.mockClear(); getThread.mockReset(); discardThread.mockClear()
})
afterEach(cleanup)

// Axl routes "let's research NVDA" here with the ticker already resolved. Prometheus must OPEN on
// that name — the whole point of the hand-off is that the user doesn't say NVDA twice.
describe('AnalystPanel — Axl hand-off seed', () => {
    it('a seeded ticker starts the research turn on its own', async () => {
        render(<AnalystPanel seed={{ key: 1, message: 'Research NVDA for coverage.' }} />)

        await waitFor(() => expect(sendStream).toHaveBeenCalled())
        const [history, opts] = lastCall()
        expect(history.at(-1)).toEqual({ role: 'user', content: 'Research NVDA for coverage.' })
        // A bare ticker carries no Argus candidate — that seed belongs to the scan hand-off.
        expect(opts.seed).toBe(null)
    })

    it('no seed → the desk waits for the user (the intro, not a turn)', async () => {
        render(<AnalystPanel />)

        expect(sendStream).not.toHaveBeenCalled()
        expect(screen.getByText('Prometheus')).toBeTruthy()
    })

    it('an Argus candidate still hands over its structured seed, not just the words', async () => {
        // A pipeline artifact: the names are the ITEMS, the frame is the CONTEXT. Argus's read on a
        // name rides on the item it belongs to, so a list carries one per candidate.
        render(<AnalystPanel inbox={makeArtifact({
            kind:    KIND.CANDIDATE_LIST,
            items:   [{ ticker: 'AMD', thesis: 'AI cycle' }],
            context: { sector: 'Semis' },
        })} />)

        await waitFor(() => expect(sendStream).toHaveBeenCalled())
        const [history, opts] = lastCall()
        // The words name the SLEEVE now: a run spans several sectors, and researching a name without
        // knowing which sleeve it is for produces a thesis aimed at the wrong book.
        expect(history.at(-1).content).toMatch(/^Research AMD for coverage/)
        expect(history.at(-1).content).toContain('Semis sleeve')
        expect(opts.seed).toMatchObject({ ticker: 'AMD', sector: 'Semis', thesis: 'AI cycle' })
        expect(opts.chatState.active_symbol).toBe('AMD')
    })

    it('a multi-sector run tells each name which sleeve it is for', async () => {
        // The bug this guards: a three-sector run reached Prometheus carrying only the last sector,
        // because the run was accumulated in a ref that every render overwrote from state.
        render(<AnalystPanel inbox={makeArtifact({
            kind:    KIND.CANDIDATE_LIST,
            items:   [{ ticker: 'NVDA' }, { ticker: 'XOM' }],
            context: {
                queued:   true,
                bySector: [{ sector: 'Technology', names: ['NVDA'] }, { sector: 'Energy', names: ['XOM'] }],
            },
        })} />)

        await waitFor(() => expect(sendStream).toHaveBeenCalled())
        const [history, opts] = lastCall()
        expect(history.at(-1).content).toContain('Technology sleeve')
        expect(opts.seed).toMatchObject({ ticker: 'NVDA', sector: 'Technology' })
    })
})

// Where a "revise this thesis" coverage card lands. The card names a symbol; the panel has to open
// ON that thesis in UPDATE mode — matching the doc, carrying it as `existing_coverage`, and opening
// the turn as a revision. Anything less is the blank desk this replaced.
describe('AnalystPanel — revise mode', () => {
    const doc = { id: 'cov_ZTS_1', symbol: 'ZTS', rating: 'sell', thesis: 'Franchise under attack.', price_target: { value: 85.15 } }

    it('an editCoverage ask opens a revise turn on that doc, not a fresh research run', async () => {
        render(<AnalystPanel coverage={[doc]} editCoverage={{ symbol: 'ZTS', key: 'cov_ZTS_1-1' }} />)

        await waitFor(() => expect(sendStream).toHaveBeenCalled())
        const [history, opts] = lastCall()
        expect(history.at(-1).content).toMatch(/^Revise our coverage on ZTS/)
        expect(opts.chatState.existing_coverage).toMatchObject({ id: 'cov_ZTS_1' })
        expect(opts.chatState.active_symbol).toBe('ZTS')
        // Update mode, so saving is a remodel on the same doc — the draft is the live thesis.
        expect(await screen.findByText('Franchise under attack.')).toBeTruthy()
    })

    // THE REGRESSION. A coverage card carries a doc the caller already resolved from the server, and
    // the panel must open on THAT — never on whether this client's polled book happens to hold the
    // name yet. The empty list is the real-world failing condition: the card arrived before the 60s
    // poll, the old code missed the lookup, bailed silently, and left a clean desk behind a tab that
    // had already switched. An empty book here must change nothing.
    it('opens the revise turn from the passed doc even when the loaded book is EMPTY', async () => {
        render(<AnalystPanel coverage={[]} editCoverage={{ doc, symbol: 'ZTS', key: 'cov_ZTS_1-2' }} />)

        await waitFor(() => expect(sendStream).toHaveBeenCalled())
        const [history, opts] = lastCall()
        expect(history.at(-1).content).toMatch(/^Revise our coverage on ZTS/)
        expect(opts.chatState.existing_coverage).toMatchObject({ id: 'cov_ZTS_1' })
    })

    it('prefers the passed doc over a stale list row of the same name', async () => {
        // Same symbol, older thesis in the list. The resolved doc is the fresher read, so it wins —
        // the point of resolving by id rather than trusting whatever this client last rendered.
        const stale = { ...doc, thesis: 'Stale thesis from a cold list.' }
        render(<AnalystPanel coverage={[stale]} editCoverage={{ doc, symbol: 'ZTS', key: 'cov_ZTS_1-3' }} />)

        await waitFor(() => expect(sendStream).toHaveBeenCalled())
        expect(await screen.findByText('Franchise under attack.')).toBeTruthy()
        expect(screen.queryByText('Stale thesis from a cold list.')).toBeNull()
    })

    it('a bare symbol still resolves off the loaded book, case-insensitively', async () => {
        render(<AnalystPanel coverage={[doc]} editCoverage={{ symbol: 'zts', key: 'k8' }} />)
        await waitFor(() => expect(sendStream).toHaveBeenCalled())
        expect(lastCall()[0].at(-1).content).toMatch(/^Revise our coverage on ZTS/)
    })

    it('a name with no doc and no book row SAYS SO instead of failing silently', async () => {
        // The old silent `return` is what made the card read as a dead button. Reaching this branch
        // now means the thesis genuinely could not be read, and that has to be visible.
        render(<AnalystPanel coverage={[doc]} editCoverage={{ symbol: 'NVDA', key: 'k9' }} />)
        expect(sendStream).not.toHaveBeenCalled()
        expect(await screen.findByText(/Couldn't open the coverage on NVDA/)).toBeTruthy()
    })
})

// The backend can now REFUSE a thesis that contradicts itself (a sell rating with a target above
// spot). A refusal the analyst can act on has to reach the analyst — and the failure branch it lands
// in is the same one that reads the already-covered fallback, which was matching the wrong field.
describe('AnalystPanel — a refused initiation', () => {
    async function draftThenInitiate() {
        render(<AnalystPanel seed={{ key: 20, message: 'Research ZTS for coverage.' }} />)
        await waitFor(() => expect(sendStream).toHaveBeenCalled())
        const [, opts] = lastCall()
        await act(async () => { opts.onDone({ reply: 'done', coverage: { symbol: 'ZTS', rating: 'sell' } }) })
        fireEvent.click(await screen.findByRole('button', { name: /Initiate coverage on ZTS/ }))
    }

    it('shows WHY the coverage was refused, not a flat "could not initiate"', async () => {
        const detail = 'A sell rating needs downside, but the target 85.15 is at or above the price 77.29 (+10.2%).'
        initiateCoverage.mockRejectedValue({ response: { data: {
            error: 'The rating and the price target point in opposite directions',
            reason: 'rating_contradicts_target',
            detail,
        } } })

        await draftThenInitiate()
        expect(await screen.findByText(new RegExp('needs downside'))).toBeTruthy()
    })

    it('an already-covered 409 still falls back to an update (the reason code, not the message)', async () => {
        initiateCoverage.mockRejectedValue({ response: { data: {
            error: 'Already covered — update the thesis instead of initiating it again',
            reason: 'already_covered',
            id: 'covOLD',
        } } })
        updateCoverage.mockResolvedValue({ id: 'covOLD', symbol: 'ZTS' })

        await draftThenInitiate()
        await waitFor(() => expect(updateCoverage).toHaveBeenCalled())
        expect(updateCoverage.mock.calls[0][0]).toBe('covOLD')
    })
})

// The research desk had NO draft persistence at all: it never called saveDraft, and `analyst` was
// missing from the backend's AGENTS whitelist, so the Axl hub's marker read nothing and its lock
// closed nothing. What looked like working resume was React state surviving behind a `display:none`
// tab — gone on the next reload. This is that gap, wired to the same shared mechanism every other
// desk uses.
describe('AnalystPanel — the draft thread', () => {
    // `done` is dispatched INSIDE the stream, not after it resolves — that is the real wire order
    // (sse.util dispatches each event in the read loop and resolves when the stream closes), and the
    // difference is now load-bearing: the turn is "completed" precisely when onDone ran, and a
    // harness that answered after the stream had closed would look to the panel like a walk-out.
    async function researchTurn(props = {}) {
        sendStream.mockImplementationOnce(async (_history, opts) => {
            opts.onDone({ reply: 'done', phase: 4, coverage: { symbol: 'ZTS', rating: 'sell' } })
        })
        render(<AnalystPanel seed={{ key: 30, message: 'Research ZTS for coverage.' }} {...props} />)
        await waitFor(() => expect(sendStream).toHaveBeenCalled())
        await waitFor(() => expect(saveDraft).toHaveBeenCalled())
        // …and wait for the stream to actually close, or the panel's controls are still disabled.
        await waitFor(() => expect(screen.getByRole('textbox').disabled).toBe(false))
        return lastCall()[1]
    }

    it('a completed turn is saved as an analyst draft carrying its desk and phase', async () => {
        await researchTurn({ pipeline: 'research' })

        expect(saveDraft).toHaveBeenCalledTimes(1)
        const arg = saveDraft.mock.calls[0][0]
        expect(arg.agent).toBe('analyst')          // must match the backend whitelist, or it is a silent 400
        expect(arg.pipeline).toBe('research')      // the MARKER keys on this, never on the agent
        expect(arg.threadId).toBe('t1')
        expect(arg.phase).toBe(4)
        expect(arg.subjectType).toBe('coverage')
        expect(arg.messages.at(-1)).toEqual({ role: 'assistant', content: 'done' })
    })

    it('the thesis drafted on THIS turn rides along, not the one from the turn before', async () => {
        // setPendingCoverage lands after onDone runs, so reading it off state here would persist the
        // previous draft — the reason the coverage is threaded through explicitly.
        await researchTurn()
        expect(saveDraft.mock.calls[0][0].state).toEqual({ draft: { symbol: 'ZTS', rating: 'sell' } })
    })

    it('a run with no desk behind it still saves — it just marks no route', async () => {
        await researchTurn()
        expect(saveDraft.mock.calls[0][0].pipeline).toBe(null)
    })

    it('Clear DISCARDS the draft rather than leaving it to expire', async () => {
        await researchTurn()
        fireEvent.click(screen.getByTitle(/clear/i))
        // Walking away keeps the draft; clearing is the user throwing it out, and a draft left to
        // TTL-expire would go on marking this desk for fourteen days.
        expect(discardThread).toHaveBeenCalledWith('t1')
    })

    it('saving the thesis LINKS the conversation to it and starts a fresh thread', async () => {
        initiateCoverage.mockResolvedValue({ id: 'cov_ZTS_9', symbol: 'ZTS' })
        const onInitiated = vi.fn()
        await researchTurn({ onInitiated })
        fireEvent.click(await screen.findByRole('button', { name: /Initiate coverage on ZTS/ }))

        await waitFor(() => expect(linkThread).toHaveBeenCalled())
        expect(linkThread).toHaveBeenCalledWith('t1', { subjectType: 'coverage', subjectId: 'cov_ZTS_9', artifactName: 'ZTS' })
        // AWAITED before the callback that ends the desk run — finishing deletes the run's remaining
        // DRAFTS, and a fire-and-forget link would race that delete.
        expect(linkThread.mock.invocationCallOrder[0]).toBeLessThan(onInitiated.mock.invocationCallOrder[0])
    })

    it('resume restores the conversation and its pending thesis, and keeps the same thread', async () => {
        getThread.mockResolvedValue({
            threadId: 'thr_old',
            messages: [{ role: 'user', content: 'Cover ZTS' }, { role: 'assistant', content: 'Working on it' }],
            state: { draft: { symbol: 'ZTS', rating: 'hold', thesis: 'Half-built.' } },
        })
        const resumeRef = { current: null }
        render(<AnalystPanel resumeRef={resumeRef} />)

        await act(async () => { await resumeRef.current('thr_old') })
        expect(await screen.findByText('Half-built.')).toBeTruthy()
        expect(screen.getByText('Working on it')).toBeTruthy()

        // Keeps writing to the RESUMED thread — a new id would leave the original marking the desk
        // forever, which is the whole failure this mechanism exists to avoid.
        const input = screen.getByPlaceholderText(/ticker to research/i)
        fireEvent.change(input, { target: { value: 'carry on' } })
        fireEvent.keyDown(input, { key: 'Enter' })
        await waitFor(() => expect(sendStream).toHaveBeenCalled())
        await act(async () => { lastCall()[1].onDone({ reply: 'more', phase: 5, coverage: { symbol: 'ZTS' } }) })

        expect(saveDraft.mock.calls.at(-1)[0].threadId).toBe('thr_old')
    })

    it('a resume that finds nothing leaves the panel alone', async () => {
        getThread.mockResolvedValue(null)
        const resumeRef = { current: null }
        render(<AnalystPanel resumeRef={resumeRef} />)
        await act(async () => { await resumeRef.current('gone') })
        expect(screen.queryByText('Half-built.')).toBeNull()
    })
})

// The other half of the same mechanism: persistence used to hang off onDone alone, and the abort
// path never reaches it — so the walk-out this desk's marker exists to catch was the one ending that
// saved nothing (useChatStream's onStopped is the shared rule).
describe('AnalystPanel — a turn the user walked out of', () => {
    async function stoppedTurn(props = {}) {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {})
        sendStream.mockImplementationOnce(async () => { throw new DOMException('aborted', 'AbortError') })
        render(<AnalystPanel seed={{ key: 31, message: 'Research ZTS for coverage.' }} {...props} />)
        await waitFor(() => expect(sendStream).toHaveBeenCalled())
        await waitFor(() => expect(saveDraft).toHaveBeenCalled())
        err.mockRestore()
    }

    it('saves the user’s message and the turns before it — no assistant turn to append', async () => {
        await stoppedTurn({ pipeline: 'research' })

        const arg = saveDraft.mock.calls[0][0]
        expect(arg.agent).toBe('analyst')
        expect(arg.pipeline).toBe('research')
        expect(arg.messages).toEqual([{ role: 'user', content: 'Research ZTS for coverage.' }])
        expect(arg.messages.some(m => m.role === 'assistant')).toBe(false)
    })

    it('reports the phase IN FORCE, since this turn emitted none', async () => {
        // Not a guess at where the stopped turn would have got to: the backend floor reads this, and
        // claiming a phase Prometheus never reached would persist a conversation below it.
        await stoppedTurn()
        expect(saveDraft.mock.calls[0][0].phase).toBe(null)
    })
})
