import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

vi.mock('../MentorSurface/MentorTradeChart.jsx', () => ({ MentorTradeChart: ({ setup }) => <div data-testid="trade-chart" data-symbol={setup?.asset} /> }))
vi.mock('../MentorSurface/mentorSurface.utils.js', () => ({ tradeChartSetup: (state) => (state?.draft ? { asset: state.draft.asset } : null) }))

const { BuildSummary, BuildBar } = await import('./BuildSummary.jsx')
const { barBuild, ageMinutes, STALE_MIN } = await import('./buildSummary.utils.js')

// A build's summary above the prompt box (modes-and-builders.md step 6): Confirm / Change / Dismiss; Recheck when stale.

const build = (over = {}) => ({ id: 'b1', status: 'ready', title: 'AMD trade', since: 1, readyAt: Date.now() - 5 * 60_000, ...over })
const rows = [{ seq: 4, agent: 'mentor', role: 'assistant', content: 'A pullback entry at $436.87, stop $393.18.', ref: { build: 'b1' } }]
const sessionWith = (b, over = {}) => ({
    rows, agentState: { mentor: { draft: { asset: 'AMD' }, build: b } },
    commit: vi.fn(async () => ({ ok: true, result: {} })), reworkBuild: vi.fn(async () => ({ ok: true })), ...over,
})
const accounts = [{ id: 'p1', broker: 'paper' }]

afterEach(cleanup)

describe('the bar', () => {
    it('is about a ready build first, else a failed one; the age is minutes since ready', () => {
        expect(barBuild({ mentor: { build: build() } }).agent).toBe('mentor')
        expect(barBuild({ mentor: { build: build({ status: 'building' }) } })).toBe(null)
        expect(barBuild({ portfolio: { build: build({ status: 'failed' }) }, mentor: { build: build() } }).agent).toBe('mentor')
        expect(ageMinutes({ readyAt: 1_000_000 }, 1_000_000 + 45 * 60_000)).toBe(45)
    })
    it('a declined build (no trade) says why, with Change and Dismiss (step 10)', () => {
        const onChange = vi.fn(), onDrop = vi.fn()
        render(<BuildBar agent="mentor" build={build({ status: 'declined', reason: 'the chart favors the short side' })} onChange={onChange} onDrop={onDrop} />)
        expect(screen.getByText('No trade on AMD — the chart favors the short side')).toBeTruthy()
        fireEvent.click(screen.getByText('Change'))
        fireEvent.change(screen.getByLabelText('The change'), { target: { value: 'build the long anyway' } })
        fireEvent.click(screen.getByText('Rebuild'))
        expect(onChange).toHaveBeenCalledWith('build the long anyway')
        fireEvent.click(screen.getByText('Dismiss'))
        expect(onDrop).toHaveBeenCalled()
        expect(barBuild({ mentor: { build: build({ status: 'declined' }) } }).agent).toBe('mentor')
    })

    it('a failed build offers Retry', () => {
        const onRetry = vi.fn()
        render(<BuildBar agent="mentor" build={build({ status: 'failed' })} onRetry={onRetry} />)
        fireEvent.click(screen.getByText('Retry'))
        expect(onRetry).toHaveBeenCalled()
    })
})

describe('the summary', () => {
    it("shows the builder's reasoning and the live chart; Confirm saves and arms the trade", async () => {
        const session = sessionWith(build())
        const onClose = vi.fn()
        render(<BuildSummary agent="mentor" build={build()} session={session} accounts={accounts} mainAccountId="p1" onClose={onClose} />)
        expect(screen.getByText(/A pullback entry at \$436\.87/)).toBeTruthy()
        expect(screen.getByTestId('trade-chart').dataset.symbol).toBe('AMD')
        await act(async () => { fireEvent.click(screen.getByText('Confirm — save and arm')) })
        expect(session.commit).toHaveBeenCalledWith('mentor', 'generateArmed', { accounts, mainAccountId: 'p1' })
        expect(onClose).toHaveBeenCalled()
    })

    it('Change sends the build back with the words; Dismiss asks first, then discards', async () => {
        const session = sessionWith(build())
        render(<BuildSummary agent="mentor" build={build()} session={session} accounts={accounts} />)
        fireEvent.click(screen.getByText('Change'))
        fireEvent.change(screen.getByLabelText('The change'), { target: { value: 'only scenario A' } })
        await act(async () => { fireEvent.click(screen.getByText('Rebuild it')) })
        expect(session.reworkBuild).toHaveBeenCalledWith('mentor', 'change', 'only scenario A')
        cleanup()
        render(<BuildSummary agent="mentor" build={build()} session={session} accounts={accounts} />)
        fireEvent.click(screen.getByText('Dismiss'))
        expect(session.commit).not.toHaveBeenCalled()
        await act(async () => { fireEvent.click(screen.getByText('Dismiss it')) })
        expect(session.commit).toHaveBeenCalledWith('mentor', 'discard')
    })

    it(`a summary older than ${STALE_MIN} min is rechecked first — Confirm as is stays possible (M14)`, async () => {
        const old = build({ readyAt: Date.now() - (STALE_MIN + 15) * 60_000 })
        const session = sessionWith(old)
        render(<BuildSummary agent="mentor" build={old} session={session} accounts={accounts} />)
        expect(screen.getByText(/prices move/)).toBeTruthy()
        await act(async () => { fireEvent.click(screen.getByText('Recheck it')) })
        expect(session.reworkBuild).toHaveBeenCalledWith('mentor', 'recheck')
        expect(screen.getByText('Confirm as is')).toBeTruthy()
    })

    it('a refused Confirm says why', async () => {
        const session = sessionWith(build(), { commit: vi.fn(async () => ({ ok: false, message: 'Mark an account first' })) })
        const onError = vi.fn()
        render(<BuildSummary agent="mentor" build={build()} session={session} accounts={[]} onError={onError} />)
        await act(async () => { fireEvent.click(screen.getByText('Confirm — save and arm')) })
        expect(onError).toHaveBeenCalledWith('Mark an account first')
    })

    it("a book's REVIEW is confirmed with Accept (step 9, M11)", async () => {
        const b = build({ title: 'Growth review' })
        const session = { rows: [], agentState: { portfolio: { reviewMode: true, reviewed: true, build: b } }, commit: vi.fn(async () => ({ ok: true })), reworkBuild: vi.fn() }
        render(<BuildSummary agent="portfolio" build={b} session={session} accounts={accounts} />)
        await act(async () => { fireEvent.click(screen.getByText('Accept the review')) })
        expect(session.commit).toHaveBeenCalledWith('portfolio', 'accept', { accounts, mainAccountId: undefined })
    })

    it("a book's Confirm is Generate — no chart", async () => {
        const b = build({ title: 'Growth book' })
        const session = { rows: [], agentState: { portfolio: { build: b } }, commit: vi.fn(async () => ({ ok: true })), reworkBuild: vi.fn() }
        render(<BuildSummary agent="portfolio" build={b} session={session} accounts={accounts} />)
        expect(screen.queryByTestId('trade-chart')).toBe(null)
        await act(async () => { fireEvent.click(screen.getByText('Confirm')) })
        expect(session.commit).toHaveBeenCalledWith('portfolio', 'generate', { accounts, mainAccountId: undefined })
    })
})

// A thesis reopened for revision runs as a build (Roy, 2026-11-21): its Confirm saves over the thesis ('update'), never
// initiates — initiating a covered name is refused ('not_new').
describe('the analyst\'s Confirm', () => {
    it('updates a revised thesis, initiates a new one', async () => {
        const { confirmAction } = await import('./buildSummary.utils.js')
        expect(confirmAction('analyst', { editing: { kind: 'coverage', entityId: 'cov_NVDA_1' } })).toBe('update')
        expect(confirmAction('analyst', { draft: { symbol: 'AMD' } })).toBe('generate')
        expect(confirmAction('mentor', { editing: { kind: 'setup' } })).toBe('generateArmed')
    })
})
