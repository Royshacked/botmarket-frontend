import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, act, fireEvent } from '@testing-library/react'

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
vi.mock('../../customHooks/useMicInput.js', () => ({
    useMicInput: () => ({ isRecording: false, isTranscribing: false, toggle: vi.fn(), cancel: vi.fn() }),
}))

const { AnalystPanel } = await import('./AnalystPanel.jsx')

const lastCall = () => sendStream.mock.calls.at(-1)

beforeEach(() => { sendStream.mockClear(); initiateCoverage.mockReset(); updateCoverage.mockReset() })
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
        render(<AnalystPanel scanResult={{ key: 'k1', ticker: 'AMD', sector: 'Semis', thesis: 'AI cycle' }} />)

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
        render(<AnalystPanel scanResult={{
            key: 'k2',
            queue: ['NVDA', 'XOM'],
            bySector: [{ sector: 'Technology', names: ['NVDA'] }, { sector: 'Energy', names: ['XOM'] }],
        }} />)

        await waitFor(() => expect(sendStream).toHaveBeenCalled())
        const [history, opts] = lastCall()
        expect(history.at(-1).content).toContain('Technology sleeve')
        expect(opts.seed).toMatchObject({ ticker: 'NVDA', sector: 'Technology' })
    })
})

// A research turn can finish with a full write-up and NO <coverage> block — Prometheus passed on
// the name, or the block was cut off / didn't parse. All three look the same from the panel, and
// all three used to leave the user reading a summary with nothing to press.
describe('AnalystPanel — the coverage ask', () => {
    // Play a turn to completion: some text, then the done payload.
    async function finishTurn(done = {}) {
        await waitFor(() => expect(sendStream).toHaveBeenCalled())
        const [, opts] = lastCall()
        await act(async () => {
            opts.onToken('No edge.')
            opts.onDone({ reply: 'No edge.', ...done })
        })
        return opts
    }

    it('offers to write the coverage up when the turn drafted nothing', async () => {
        render(<AnalystPanel seed={{ key: 10, message: 'Research NVDA for coverage.' }} />)
        await finishTurn()

        const btn = await screen.findByRole('button', { name: 'Draft coverage' })
        sendStream.mockClear()
        fireEvent.click(btn)

        await waitFor(() => expect(sendStream).toHaveBeenCalled())
        expect(lastCall()[0].at(-1).content).toMatch(/emit the coverage block/i)
    })

    it('stands down once a draft arrives — the draft has its own action', async () => {
        render(<AnalystPanel seed={{ key: 11, message: 'Research NVDA for coverage.' }} />)
        await finishTurn({ coverage: { symbol: 'NVDA', thesis: 'Variant view.' } })

        expect(await screen.findByRole('button', { name: /Initiate coverage on NVDA/ })).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'Draft coverage' })).toBe(null)
    })

    it('says nothing before the first turn has answered', () => {
        render(<AnalystPanel />)
        expect(screen.queryByRole('button', { name: 'Draft coverage' })).toBe(null)
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

    it('a name that is not in the loaded book starts no turn at all', async () => {
        render(<AnalystPanel coverage={[doc]} editCoverage={{ symbol: 'NVDA', key: 'k9' }} />)
        expect(sendStream).not.toHaveBeenCalled()
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
