import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import { MentorSurface } from './MentorSurface.jsx'

// Mentor's surface in the side pane (phase 8b). It draws MENTOR'S STATE ON THE SESSION and presses three ways: a
// gate or a pick is a turn (ops ride the message), a worksheet field is a hand edit, Generate / Arm / Update / Later
// are commits. The session is a stub; its own suite covers the wire. Moved from MentorPanel's suite where the
// behaviour is the surface's.

const SETUP = {
    asset: 'NVDA', direction: 'long', type: 'swing', trade_mode: 'smc', timeframe: '4hr',
    thesis: 'Sweep and reclaim of the 199 shelf.',
    watch: [{ kind: 'structure', look_for: 'CHoCH up on the 1hr', timeframe: '1hr', weight: 'primary' }],
    entry_legs: [{ id: 'ez1', price: 201, quantity: 110 }],
    stop_legs:  [{ id: 'sz1', price: 196.5, quantity: 110 }],
    target_legs: [{ id: 'tp1', price: 210, quantity: 110 }],
    rr: 2.1, quantity: 110,
}
const ACCOUNTS = [{ id: 'a1', broker: 'paper', name: 'Paper' }]
const READY = { ready: true, missing: [] }

let session
const stub = (mentor, over = {}) => ({
    floor: 'mentor', live: null, agentState: { mentor },
    send:   vi.fn(async () => true),
    commit: vi.fn(async () => ({ ok: true, result: {} })),
    edit:   vi.fn(async () => ({ ok: true, result: {} })),
    ...over,
})
const desk = (marked = ['a1']) => ({ availableAccounts: ACCOUNTS, selectedAccounts: marked, mainAccountId: 'a1' })
const mount = (mentor, { marked, ...over } = {}) => {
    session = stub(mentor, over)
    return render(<MentorSurface session={session} deskProps={desk(marked)} />)
}

beforeEach(() => vi.useRealTimers())
afterEach(cleanup)

describe('MentorSurface — the table', () => {
    it('with nothing on the table it offers the openings, each a turn to Mentor', () => {
        mount(null)
        expect(screen.getByText(/Nothing on Mentor/)).toBeTruthy()
        fireEvent.click(screen.getByText('I want to buy NVDA on a pullback'))
        expect(session.send).toHaveBeenCalledWith('I want to buy NVDA on a pullback', { agent: 'mentor', accounts: ACCOUNTS, mainAccountId: 'a1' })
        fireEvent.click(screen.getByText(/I have my own setup/))
        expect(session.send).toHaveBeenLastCalledWith('I have my own setup — take it down as I give it', expect.objectContaining({ agent: 'mentor' }))
    })

    it('renders the coverage chips and the folded worksheet, which opens on a click', () => {
        mount({ draft: SETUP, coverage: ['direction', 'levels'], view: { readiness: READY } })
        expect(screen.getByText('your setup')).toBeTruthy()
        const toggle = screen.getByRole('button', { name: /your setup/ })
        expect(toggle.getAttribute('aria-expanded')).toBe('false')
        fireEvent.click(toggle)
        expect(toggle.getAttribute('aria-expanded')).toBe('true')
    })

    it('says which setup is being edited, and that Update appears once the plan moves', () => {
        mount({ draft: SETUP, view: { readiness: READY }, editing: { kind: 'setup', entityId: 's1' } })
        expect(screen.getByText('editing NVDA')).toBeTruthy()
        expect(screen.getByText(/“Update setup” appears once the plan moves/)).toBeTruthy()
        expect(screen.queryByText('Generate setup')).toBeNull()
    })
})

describe('MentorSurface — the Generate bar', () => {
    it('blocks Generate when no account is marked, and says so', () => {
        mount({ draft: SETUP, view: { readiness: READY } }, { marked: [] })
        expect(screen.getByText('Generate setup').closest('button').disabled).toBe(true)
        expect(screen.getByText(/Still needs: trading account/)).toBeTruthy()
    })

    it('names a CONTRADICTION, not just a gap', () => {
        mount({ draft: SETUP, view: { readiness: { ready: false, missing: [], problems: ['the validity floor sits below the stop'] } } })
        expect(screen.getByText(/Doesn’t add up: the validity floor sits below the stop/)).toBeTruthy()
    })

    it('never shows a dark button with nothing to say', () => {
        mount({ draft: SETUP, view: { readiness: { ready: false, missing: [] } } })
        expect(screen.getByText(/Not ready yet — ask Mentor/)).toBeTruthy()
    })

    it('Generate is a COMMIT with the marked accounts — the plan is the server\'s copy, never one from here', async () => {
        mount({ draft: SETUP, view: { readiness: READY } })
        fireEvent.click(screen.getByText('Generate setup'))
        await waitFor(() => expect(session.commit).toHaveBeenCalledWith('mentor', 'generate', { accounts: ACCOUNTS, mainAccountId: 'a1' }))
    })

    it('says the SERVER\'s reason for a refused Generate, and what a stale press means', async () => {
        mount({ draft: SETUP, view: { readiness: READY } }, { commit: vi.fn(async () => ({ ok: false, reason: 'cannot_arm_venue', message: 'The broker is not connected', extra: {} })) })
        fireEvent.click(screen.getByText('Generate setup'))
        expect((await screen.findByRole('alert')).textContent).toBe('The broker is not connected')
        cleanup()
        mount({ draft: SETUP, view: { readiness: READY } }, { commit: vi.fn(async () => ({ ok: false, reason: 'stale_state', message: 'x', extra: { rev: 3 } })) })
        fireEvent.click(screen.getByText('Generate setup'))
        expect((await screen.findByRole('alert')).textContent).toMatch(/moved on while you were looking/)
    })

    it('offers Generate all only when there IS a batch, says how many, and reports a partial batch', async () => {
        mount({ draft: SETUP, drafts: { AMD: { ...SETUP, asset: 'AMD' } }, view: { readiness: READY } }, {
            commit: vi.fn(async () => ({ ok: true, result: { setups: [{ id: 's1', asset: 'NVDA' }], failed: [{ index: 1, asset: 'AMD', reason: 'missing_target' }] } })),
        })
        fireEvent.click(screen.getByText('Generate all (2)'))
        await waitFor(() => expect(session.commit).toHaveBeenCalledWith('mentor', 'generateAll', expect.any(Object)))
        expect(await screen.findByText('1 saved. 1 not: AMD — missing_target')).toBeTruthy()
        cleanup()
        mount({ draft: SETUP, view: { readiness: READY } })
        expect(screen.queryByText(/Generate all/)).toBeNull()
    })

    it('everything refused in a batch says which and why', async () => {
        mount({ draft: SETUP, drafts: { AMD: { ...SETUP, asset: 'AMD' } }, view: { readiness: READY } }, {
            commit: vi.fn(async () => ({ ok: false, reason: 'nothing_saved', message: 'Nothing could be saved', extra: { failed: [{ index: 0, asset: 'NVDA', reason: 'missing_target' }] } })),
        })
        fireEvent.click(screen.getByText('Generate all (2)'))
        expect((await screen.findByRole('alert')).textContent).toBe('Nothing was saved: NVDA — missing_target')
    })
})

describe('MentorSurface — generated, not armed', () => {
    it('STOPS to offer Arm — a saved setup is not yet monitored', async () => {
        mount({ generated: { id: 's1', asset: 'NVDA', status: 'waiting' } })
        expect(screen.getByText(/nothing is watching it yet/)).toBeTruthy()
        fireEvent.click(screen.getByText('Arm it — start monitoring'))
        await waitFor(() => expect(session.commit).toHaveBeenCalledWith('mentor', 'arm', expect.any(Object)))
    })

    it('can leave it waiting without arming it', async () => {
        mount({ generated: { id: 's1', asset: 'NVDA', status: 'waiting' } })
        fireEvent.click(screen.getByText('Leave it waiting'))
        await waitFor(() => expect(session.commit).toHaveBeenCalledWith('mentor', 'leave', expect.any(Object)))
    })
})

describe('MentorSurface — presses that are turns', () => {
    const GATE = { asset: 'NVDA', stage: 'opening', awaiting: true, fields: ['direction', 'horizon', 'lens'], values: { direction: 'long', horizon: 'swing', lens: 'smc' } }

    it('the stage card sends the settlement as an OP, and says it in words too; the waiver rides on it', () => {
        mount({ draft: SETUP, view: { gate: GATE, readiness: { ready: false, missing: [] } } })
        fireEvent.click(screen.getByText('Yes — carry on'))
        expect(session.send).toHaveBeenCalledWith('Yes, those are right.', expect.objectContaining({ agent: 'mentor', ops: [{ settle: ['direction', 'horizon', 'lens'] }] }))
        fireEvent.click(screen.getByText('Yes — go all the way to sizing'))
        expect(session.send.mock.calls[1][1].ops).toEqual([{ settle: ['direction', 'horizon', 'lens'], waiver: true }])
    })

    it('"Change something" steps the card aside until Mentor proposes again', () => {
        const { rerender } = mount({ draft: SETUP, view: { gate: GATE, readiness: { ready: false, missing: [] } } })
        fireEvent.click(screen.getByText('Change something'))
        expect(screen.queryByText('Yes — carry on')).toBeNull()
        const next = { ...GATE, values: { ...GATE.values, horizon: 'day' } }
        rerender(<MentorSurface session={{ ...session, agentState: { mentor: { draft: SETUP, view: { gate: next } } } }} deskProps={desk()} />)
        expect(screen.getByText('Yes — carry on')).toBeTruthy()
    })

    it('picking a candidate settles what it carries, as an op on a turn', () => {
        const CANDIDATES = [
            { label: 'Sweep and reclaim', pitch: 'tight', setup: { asset: 'NVDA', direction: 'long', type: 'swing', trade_mode: 'smc' } },
            { label: 'Fade the high', pitch: 'other side', setup: { asset: 'NVDA', direction: 'short', type: 'day', trade_mode: 'institutional' } },
        ]
        mount({ draft: null, coverage: ['direction'], view: { setups: { candidates: CANDIDATES } } })
        fireEvent.click(screen.getByText('Fade the high'))
        expect(session.send).toHaveBeenCalledWith('Let\'s go with "Fade the high".', expect.objectContaining({
            ops: [{ claim: { direction: 'short', horizon: 'day', lens: 'institutional' }, settle: ['direction', 'horizon', 'lens'] }],
        }))
    })

    const SPANS   = { candidates: [{ id: 't1', label: 'the shelf', from: 'a', to: 'b' }] }
    const ENTRIES = { trades: [{ id: 't1', semantics: 'alternatives', options: [{ id: 't1e1', label: 'reclaim', trigger: 'closes back above', recommended: true }] }] }
    const at = (stage) => ({ draft: { ...SETUP, spans: SPANS, entries: ENTRIES }, view: { gate: { asset: 'NVDA', stage, awaiting: true, fields: [stage], values: {} }, readiness: { ready: false, missing: [] } } })

    it('shows the gate the server says is open — spans, entries, and neither at sizing', () => {
        mount(at('spans'))
        expect(screen.getByText('the shelf')).toBeTruthy()
        expect(screen.queryByText('reclaim')).toBeNull()
        cleanup(); mount(at('entries'))
        expect(screen.getByText('reclaim')).toBeTruthy()
        cleanup(); mount(at('sizing'))
        expect(screen.queryByText('reclaim')).toBeNull()
        expect(screen.queryByText('the shelf')).toBeNull()
    })

    it('every gate and the bar wait while a turn runs', () => {
        mount(at('spans'), { live: { turnId: 't', agent: 'mentor' } })
        expect(screen.queryByText('the shelf')).toBeNull()
        expect(screen.queryByText('Generate setup')).toBeNull()
    })
})

describe('MentorSurface — hand edits and Update', () => {
    it('a worksheet edit is sent once the typing stops, as a hand edit of the draft', async () => {
        vi.useFakeTimers()
        const scenario = { id: 's1', name: 'false break', entry_legs: [{ id: 's1e1', price: 201, quantity: 110 }], stop_legs: [{ id: 's1s1', price: 196.5 }], target_legs: [{ id: 's1t1', price: 210.5, quantity: 110 }], quantity: 110 }
        mount({ draft: { ...SETUP, scenarios: [scenario] }, view: { readiness: READY } })
        fireEvent.click(screen.getByRole('button', { name: /your setup/ }))
        fireEvent.change(screen.getByLabelText('Entry price s1e1'), { target: { value: '19' } })
        fireEvent.change(screen.getByLabelText('Entry price s1e1'), { target: { value: '198' } })
        expect(session.edit).not.toHaveBeenCalled()
        await act(async () => { vi.advanceTimersByTime(700) })
        expect(session.edit).toHaveBeenCalledTimes(1)   // one PATCH for the whole burst of typing
        const [agent, change] = session.edit.mock.calls[0]
        expect(agent).toBe('mentor')
        expect(change.draft.scenarios[0].entry_legs[0].price).toBe(198)
        expect(change.accounts).toEqual(ACCOUNTS)
    })

    it('Update appears once the plan moves, and is a commit; Later leaves without saving', async () => {
        const editing = { kind: 'setup', entityId: 's1' }
        const { rerender } = mount({ draft: SETUP, view: { readiness: READY }, editing })
        fireEvent.click(screen.getByText(/later/i))
        await waitFor(() => expect(session.commit).toHaveBeenCalledWith('mentor', 'later', expect.any(Object)))
        // A turn moved the plan — the server's draft is now not the one that reopened.
        rerender(<MentorSurface session={{ ...session, agentState: { mentor: { draft: { ...SETUP, rr: 3 }, view: { readiness: READY }, editing } } }} deskProps={desk()} />)
        fireEvent.click(screen.getByText('Update setup'))
        await waitFor(() => expect(session.commit).toHaveBeenCalledWith('mentor', 'update', { accounts: ACCOUNTS, mainAccountId: 'a1' }))
    })
})

describe('MentorSurface — a stale press', () => {
    it('keeps saying why through the redraw that follows it', async () => {
        const { rerender } = mount({ draft: SETUP, view: { readiness: READY } }, { commit: vi.fn(async () => ({ ok: false, reason: 'stale_state', message: 'x', extra: { rev: 3 } })) })
        fireEvent.click(screen.getByText('Generate setup'))
        await screen.findByRole('alert')
        // The replay brings Mentor's current plan — a new object, maybe new levels.
        rerender(<MentorSurface session={{ ...session, agentState: { mentor: { draft: { ...SETUP, rr: 2.4 }, view: { readiness: READY } } } }} deskProps={desk()} />)
        expect(screen.getByRole('alert').textContent).toMatch(/check the plan and press again/)
    })
})
