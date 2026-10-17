import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

// Atlas's surface in the side pane (phase 8c). It draws ATLAS'S STATE ON THE SESSION; Review and the openings are
// turns, the bar is commits, adopt mode is a hand edit. The session is a stub; its own suite covers the wire, and the
// backend's covers what each commit saves.

const refresh = vi.fn(async (id) => ({ draftId: id, holdings: [], excluded: [], reconciliation: {} }))
vi.mock('../../services/adopt/adopt.service.remote', () => ({ adoptService: { refresh: (...a) => refresh(...a), stage: vi.fn(), commit: vi.fn() } }))
const emit = vi.fn()
vi.mock('../../services/event-bus.service', () => ({ eventBus: { emit: (...a) => emit(...a), on: () => () => {} }, REVIEW_RESOLVED: 'review-resolved' }))

const { PortfolioSurface } = await import('./PortfolioSurface.jsx')
const { REVIEW_REQUEST } = await import('./portfolioSurface.utils.js')

const ACCOUNTS = [{ id: 'a1', broker: 'paper', name: 'Paper' }]
const PLAN = { name: 'Quality', positionSize: 10000, ideas: [{ asset: 'MSFT', quantity: 10 }, { asset: 'KO', quantity: 20 }] }
const BOOK = [
    { id: 'i1', asset: 'MSFT', quantity: 10, portfolioId: 'p1', portfolioName: 'Quality', status: 'long', accounts: ['a1'], mainAccountId: 'a1' },
    { id: 'i2', asset: 'KO', quantity: 20, portfolioId: 'p1', portfolioName: 'Quality', status: 'waiting', accounts: ['a1'], mainAccountId: 'a1' },
]
const TRIM = { action: 'trim_item', itemId: 'i1', reduceFraction: 0.5 }
const EDITING = { kind: 'portfolio', entityId: 'p1' }

let session
let desk
const mount = (portfolio, { marked = ['a1'], ideas = BOOK, ...over } = {}) => {
    session = {
        floor: 'portfolio', live: null, agentState: { portfolio }, agentRev: { portfolio: 3 },
        send:   vi.fn(async () => true),
        commit: vi.fn(async () => ({ ok: true, result: {} })),
        edit:   vi.fn(async () => ({ ok: true, result: {}, rev: 4 })),
        ...over,
    }
    desk = { availableAccounts: ACCOUNTS, selectedAccounts: marked, mainAccountId: 'a1', ideas, onSaved: vi.fn(), onAdopted: vi.fn() }
    return render(<PortfolioSurface session={session} deskProps={desk} />)
}

beforeEach(() => { emit.mockClear(); refresh.mockClear() })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('PortfolioSurface — the table', () => {
    it('with nothing on the table offers the openings, each a turn to Atlas — and adopting, which stages first', async () => {
        mount(null)
        expect(screen.getByText(/Nothing on Atlas/)).toBeTruthy()
        fireEvent.click(screen.getByText('Build me a long-term growth portfolio'))
        expect(session.send).toHaveBeenCalledWith('Build me a long-term growth portfolio', { agent: 'portfolio', accounts: ACCOUNTS, mainAccountId: 'a1' })
        fireEvent.click(screen.getByText('Adopt a book I hold at my bank'))
        await waitFor(() => expect(session.edit).toHaveBeenCalledWith('portfolio', { adopt: 'start' }))
        await waitFor(() => expect(session.send).toHaveBeenLastCalledWith(expect.stringMatching(/already hold a portfolio/), expect.objectContaining({ agent: 'portfolio' })))
    })

    it('a plan shows its summary and the house\'s limits; Generate is a COMMIT with the marked accounts', async () => {
        mount({ pendingPlan: { ...PLAN, limits: { notes: ['KO capped at a third of the book'] } } })
        expect(screen.getByText('Quality')).toBeTruthy()
        expect(screen.getByText('×10')).toBeTruthy()
        expect(screen.getByText(/KO capped at a third/)).toBeTruthy()
        session.commit.mockResolvedValueOnce({ ok: true, result: { portfolio: { portfolioId: 'p_new', ideas: [{}, {}] }, failed: [] } })
        fireEvent.click(screen.getByText('Generate plan'))
        await waitFor(() => expect(session.commit).toHaveBeenCalledWith('portfolio', 'generate', { accounts: ACCOUNTS, mainAccountId: 'a1' }))
        await screen.findByText(/Quality is saved — 2 holdings/)
        expect(desk.onSaved).toHaveBeenCalledWith(expect.objectContaining({ action: 'generate', portfolioId: 'p_new' }))
    })

    it('a plan without a size, or without prices, says which — and Generate waits for an account', () => {
        mount({ pendingPlan: { ideas: [{ asset: 'MSFT' }] } })
        expect(screen.getByText(/needs a position size/)).toBeTruthy()
        cleanup()
        mount({ pendingPlan: { positionSize: 5000, ideas: [{ asset: 'MSFT' }] } })
        expect(screen.getByText(/Couldn’t fetch live prices/)).toBeTruthy()
        cleanup()
        mount({ pendingPlan: PLAN }, { marked: [] })
        expect(screen.getByText('Generate plan').closest('button').disabled).toBe(true)
    })

    it('says what the turn sent off to be researched', () => {
        mount({ notices: { screenRequests: [{ sector: 'Energy', lens: 'value' }], coverageRequest: { symbol: 'PLTR' } } })
        expect(screen.getByText(/Energy \(value\) sleeve sent to Argus and Prometheus/)).toBeTruthy()
        expect(screen.getByText(/queued for research/).textContent).toMatch(/PLTR/)
    })
})

describe('PortfolioSurface — Discard (8e)', () => {
    it('a new plan — sized or not — can be thrown away after asking; a book being edited has Later instead', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        mount({ pendingPlan: { ideas: [{ asset: 'MSFT' }] } })
        fireEvent.click(screen.getByText('Discard'))
        await waitFor(() => expect(session.commit).toHaveBeenCalledWith('portfolio', 'discard', expect.any(Object)))
        expect(desk.onSaved).not.toHaveBeenCalled()
        cleanup()
        mount({ portfolioId: 'p1', editing: EDITING, pendingPlan: PLAN })
        expect(screen.queryByText('Discard')).toBeNull()
    })
})

describe('PortfolioSurface — the AVOID ask', () => {
    it('a yes presses again with the OK on the names asked about', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        mount({ pendingPlan: PLAN }, { commit: vi.fn()
            .mockResolvedValueOnce({ ok: false, reason: 'avoid_needs_ok', message: 'x', extra: { avoid: [{ asset: 'KO', industry: 'Beverages' }] } })
            .mockResolvedValueOnce({ ok: true, result: { portfolio: { portfolioId: 'p9', ideas: [{}] } } }) })
        fireEvent.click(screen.getByText('Generate plan'))
        await waitFor(() => expect(session.commit).toHaveBeenCalledTimes(2))
        expect(window.confirm.mock.calls[0][0]).toMatch(/KO \(Beverages\)/)
        expect(session.commit.mock.calls[1][2]).toEqual({ accounts: ACCOUNTS, mainAccountId: 'a1', avoidOk: ['KO'] })
    })

    it('a no on a book saves nothing; a no on a proposal applies the rest without those changes', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(false)
        const refused = { ok: false, reason: 'avoid_needs_ok', message: 'x', extra: { avoid: [{ asset: 'XOM' }] } }
        mount({ pendingPlan: PLAN }, { commit: vi.fn().mockResolvedValueOnce(refused) })
        fireEvent.click(screen.getByText('Generate plan'))
        await screen.findByText(/Nothing was saved — the AVOID names were declined/)
        expect(session.commit).toHaveBeenCalledTimes(1)
        cleanup()

        mount({ ...EDITING, portfolioId: 'p1', reviewMode: true, reviewed: true, editing: EDITING, reviewUpdate: { changes: [TRIM] } },
            { commit: vi.fn().mockResolvedValueOnce(refused).mockResolvedValueOnce({ ok: true, result: { rebalance: { applied: 1, deferredItems: [] } } }) })
        fireEvent.click(screen.getByText('Accept changes (1)'))
        await waitFor(() => expect(session.commit).toHaveBeenCalledTimes(2))
        expect(session.commit.mock.calls[1][2]).toEqual({ accounts: ACCOUNTS, mainAccountId: 'a1', dropAvoid: true })
    })
})

describe('PortfolioSurface — a review', () => {
    const review = { portfolioId: 'p1', reviewMode: true, editing: EDITING, thesis: { strategy: 'Compounders at fair prices', version: 3, targetExposures: [{ label: 'Staples', target: 0.3 }] } }

    it('opens on the book\'s thesis; before a pass it offers Review (a turn), never Accept', () => {
        mount({ ...review, reviewed: false })
        expect(screen.getByText(/Portfolio thesis · v3/)).toBeTruthy()
        expect(screen.getByText('Staples 30%')).toBeTruthy()
        expect(screen.queryByText(/Accept/)).toBeNull()
        fireEvent.click(screen.getByText('Review'))
        expect(session.send).toHaveBeenCalledWith(REVIEW_REQUEST, expect.objectContaining({ agent: 'portfolio' }))
    })

    it('after a pass: the proposal is listed, Accept commits it and clears the review\'s pencil', async () => {
        mount({ ...review, reviewed: true, reviewUpdate: { changes: [TRIM] } }, { commit: vi.fn(async () => ({ ok: true, result: { portfolio: { portfolioId: 'p1' }, rebalance: { applied: 1, deferredItems: [] } } })) })
        expect(screen.getByText('Trim MSFT by 50%')).toBeTruthy()
        fireEvent.click(screen.getByText('Accept changes (1)'))
        await screen.findByText(/1 change applied/)
        expect(emit).toHaveBeenCalledWith('review-resolved', { portfolioId: 'p1' })
    })

    it('a pass that held: Accept accepts the hold; Dismiss asks first', async () => {
        mount({ ...review, reviewed: true })
        expect(screen.getByText('Accept — hold as is')).toBeTruthy()
        fireEvent.click(screen.getByText('Dismiss'))
        expect(session.commit).not.toHaveBeenCalled()
        fireEvent.click(screen.getByText('Confirm'))
        await waitFor(() => expect(session.commit).toHaveBeenCalledWith('portfolio', 'dismiss', expect.any(Object)))
    })
})

describe('PortfolioSurface — editing a book', () => {
    it('Update appears once there is something to save — a ready plan, or the accounts moved', () => {
        mount({ portfolioId: 'p1', editing: EDITING })
        expect(screen.getByText(/“Update plan” appears once/)).toBeTruthy()
        cleanup()
        // The waiting leg still points at an account the user has since moved off.
        mount({ portfolioId: 'p1', editing: EDITING }, { ideas: BOOK.map(i => (i.id === 'i2' ? { ...i, accounts: ['a0'] } : i)) })
        expect(screen.getByText('Update plan')).toBeTruthy()
        cleanup()
        mount({ portfolioId: 'p1', editing: EDITING, pendingPlan: PLAN })
        fireEvent.click(screen.getByText('Update plan'))
        expect(session.commit).toHaveBeenCalledWith('portfolio', 'update', { accounts: ACCOUNTS, mainAccountId: 'a1' })
    })

    it('an edit\'s proposal waits on Accept; Later leaves without saving', async () => {
        mount({ portfolioId: 'p1', editing: EDITING, reviewUpdate: { changes: [TRIM] } })
        expect(screen.getByText('Accept changes (1)')).toBeTruthy()
        fireEvent.click(screen.getByText(/later/i))
        await waitFor(() => expect(session.commit).toHaveBeenCalledWith('portfolio', 'later', expect.any(Object)))
        expect(emit).not.toHaveBeenCalled()
    })

    it('a stale press says why', async () => {
        mount({ portfolioId: 'p1', editing: EDITING, pendingPlan: PLAN }, { commit: vi.fn(async () => ({ ok: false, reason: 'stale_state', message: 'x', extra: { rev: 9 } })) })
        fireEvent.click(screen.getByText('Update plan'))
        expect((await screen.findByRole('alert')).textContent).toMatch(/Atlas moved on while you were looking/)
    })
})

describe('PortfolioSurface — adopt mode', () => {
    it('asks the server for the draft ONCE, then draws the grid from it', async () => {
        const { rerender } = mount({ adopt: true })
        await waitFor(() => expect(session.edit).toHaveBeenCalledWith('portfolio', { adopt: 'start' }))
        rerender(<PortfolioSurface session={{ ...session, agentState: { portfolio: { adopt: true } } }} deskProps={desk} />)
        expect(session.edit).toHaveBeenCalledTimes(1)
        rerender(<PortfolioSurface session={{ ...session, agentState: { portfolio: { adopt: true, adoptDraftId: 'd1' } } }} deskProps={desk} />)
        await screen.findByText('Your book at the bank')
        expect(refresh).toHaveBeenCalledWith('d1', {})
    })

    it('a turn re-reads the draft (a paste in the chat lands in it); cancelling leaves adopt mode', async () => {
        const { rerender } = mount({ adopt: true, adoptDraftId: 'd1' })
        await screen.findByText('Your book at the bank')
        rerender(<PortfolioSurface session={{ ...session, agentRev: { portfolio: 4 } }} deskProps={desk} />)
        await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2))
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        await waitFor(() => expect(session.edit).toHaveBeenCalledWith('portfolio', { adopt: 'end' }))
    })

    it('8c CR: over unsaved work it ASKS — a yes stages fresh, a no keeps working', async () => {
        mount({ adopt: true, pendingPlan: PLAN })
        expect(screen.getByText(/Put it aside and adopt your bank book\?/)).toBeTruthy()
        expect(session.edit).not.toHaveBeenCalled()
        fireEvent.click(screen.getByText('Put it aside'))
        await waitFor(() => expect(session.edit).toHaveBeenCalledWith('portfolio', { adopt: 'start', fresh: true }))
        cleanup()
        mount({ adopt: true, pendingPlan: PLAN })
        fireEvent.click(screen.getByText('Keep working'))
        await waitFor(() => expect(session.edit).toHaveBeenCalledWith('portfolio', { adopt: 'end' }))
    })

    it('8c CR: never a dead end — a draft that cannot be read says so, with Try again and Cancel', async () => {
        refresh.mockRejectedValueOnce({ response: { data: { error: 'That adoption was already committed' } } })
        mount({ adopt: true, adoptDraftId: 'dead' })
        expect((await screen.findByRole('alert')).textContent).toMatch(/already committed/)
        fireEvent.click(screen.getByText('Try again'))
        await screen.findByText('Your book at the bank')
        expect(refresh).toHaveBeenCalledTimes(2)
    })

    it('8c CR: a stage that loses a race (stale) is quiet; a real failure says so and waits for Try again', async () => {
        mount({ adopt: true }, { edit: vi.fn(async () => ({ ok: false, reason: 'stale_state', message: 'x' })) })
        await waitFor(() => expect(session.edit).toHaveBeenCalled())
        expect(screen.queryByRole('alert')).toBeNull()
        cleanup()
        mount({ adopt: true }, { edit: vi.fn(async () => ({ ok: false, reason: 'adopt_failed', message: 'Could not open the adoption — try again' })) })
        expect((await screen.findByRole('alert')).textContent).toMatch(/Could not open the adoption/)
        expect(session.edit).toHaveBeenCalledTimes(1)
    })

    it('8c CR: adopted → adopt mode ends FIRST, then the page opens the new book', async () => {
        const order = []
        const { adoptService } = await import('../../services/adopt/adopt.service.remote')
        adoptService.commit.mockResolvedValueOnce({ portfolioId: 'p_adopted', legs: 3 })
        refresh.mockResolvedValueOnce({ draftId: 'd1', holdings: [{ symbol: 'AAPL', quantity: 10, avgCost: 150, mark: 200 }], excluded: [], reconciliation: { startingBalance: 2000 } })
        mount({ adopt: true, adoptDraftId: 'd1' }, { edit: vi.fn(async (a, e) => { order.push(`edit:${e.adopt}`); return { ok: true, result: {} } }) })
        desk.onAdopted.mockImplementation((id) => order.push(`open:${id}`))
        const adopt = await screen.findByText('Adopt this book')
        expect(adopt.disabled).toBe(false)
        fireEvent.click(adopt)
        await waitFor(() => expect(order).toEqual(['edit:end', 'open:p_adopted']))
    })
})

describe('PortfolioSurface — phase 8c CR', () => {
    it('Update is never offered for an unsized plan, even when the accounts moved', () => {
        mount({ portfolioId: 'p1', editing: EDITING, pendingPlan: { ideas: [{ asset: 'MSFT' }] } }, { ideas: BOOK.map(i => (i.id === 'i2' ? { ...i, accounts: ['a0'] } : i)) })
        expect(screen.queryByText('Update plan')).toBeNull()
        expect(screen.getByText(/needs a position size/)).toBeTruthy()
    })

    it('an edit with a proposal AND a ready plan offers both', () => {
        mount({ portfolioId: 'p1', editing: EDITING, pendingPlan: PLAN, reviewUpdate: { changes: [TRIM] } })
        expect(screen.getByText('Accept changes (1)')).toBeTruthy()
        expect(screen.getByText('Update plan')).toBeTruthy()
    })

    it('a refusal\'s words stay through the frame that follows it (the server narrowed the proposal)', async () => {
        const { rerender } = mount({ ...EDITING, portfolioId: 'p1', reviewMode: true, reviewed: true, editing: EDITING, reviewUpdate: { changes: [TRIM, TRIM] } },
            { commit: vi.fn(async () => ({ ok: false, reason: 'nothing_applied', message: 'None of the proposed changes could be applied', extra: { failed: [{ reason: 'market_closed' }] } })) })
        fireEvent.click(screen.getByText('Accept changes (2)'))
        await screen.findByRole('alert')
        rerender(<PortfolioSurface session={{ ...session, agentRev: { portfolio: 4 }, agentState: { portfolio: { portfolioId: 'p1', reviewMode: false, editing: EDITING, reviewUpdate: { changes: [TRIM] } } } }} deskProps={desk} />)
        expect(screen.getByRole('alert').textContent).toMatch(/None of the proposed changes could be applied \(market_closed\)/)
    })
})
