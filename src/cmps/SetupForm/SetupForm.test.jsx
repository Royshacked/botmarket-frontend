import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

// What these guard is ONE promise: a plan someone else drew opens with their levels intact and
// exactly one thing left for you to do — say how big. Everything else here is in service of that.

const hydrateBlueprint = vi.fn()
const validateDraft    = vi.fn()

vi.mock('../../services/mentor/mentor.service.remote.js', () => ({
    mentorService: {
        hydrateBlueprint: (...a) => hydrateBlueprint(...a),
        validateDraft:    (...a) => validateDraft(...a),
    },
    SETUPS_CHANGED: 'mentor-setups-changed',
}))

const { SetupForm }   = await import('./SetupForm.jsx')
const { relativeAge } = await import('./relativeAge.js')

const VOCAB = {
    directions: ['long', 'short'],
    horizons:   ['intraday', 'day', 'swing', 'long term'],
    modes:      ['discretionary', 'smc', 'institutional'],
    timeframes: ['day', '4hr', '1hr', '15min'],
}

// What the server hands back for a hydrated blueprint: the plan, and no size anywhere.
const theirPlan = () => ({
    asset: 'NVDA', direction: 'long', type: 'swing', trade_mode: 'smc', timeframe: '4hr',
    thesis: 'Reclaim of the 199 shelf.',
    conditions: [],
    ladder: ['day', '4hr', '1hr'],
    scenarios: [{
        id: 's1', name: 'the fade', quantity: null,
        entry_zones: [{ id: 'e1', lower: 199, upper: 201, quantity: null }],
        stop_zones:  [{ id: 's1s', lower: 196.5, upper: 197.9, quantity: null }],
        tp_zones:    [{ id: 't1', lower: 210, upper: 211, quantity: null }],
        conditions:  [{ id: 's1c1', text: 'sweep of the prior low first', weight: 'primary' }],
    }],
})

const ACCOUNTS = [{ id: 'a1', broker: 'paper', name: 'Paper' }]

beforeEach(() => {
    hydrateBlueprint.mockReset()
    validateDraft.mockReset()
    hydrateBlueprint.mockResolvedValue({
        setup: theirPlan(), readiness: { ready: false, missing: ['quantity'], problems: [] },
        problems: [], vocabulary: VOCAB, drawn_at: null, from: null,
    })
    validateDraft.mockResolvedValue({
        setup: theirPlan(), readiness: { ready: false, missing: ['quantity'], problems: [] }, vocabulary: VOCAB,
    })
})
afterEach(cleanup)

// Anchored on the HEADING, which every mode renders. Not the ticker field (a locked plan shows the
// nucleus as chips, not greyed-out boxes) and not the action button (its label depends on whether
// the plan still needs its zones drawn).
const openForm = async (over = {}) => {
    render(<SetupForm accounts={ACCOUNTS} onGenerate={vi.fn()} onHandoff={vi.fn()} {...over} />)
    await screen.findByRole('heading', { name: /setup/i })
}
const action = () => screen.getByRole('button', { name: /Continue|Generate setup/ })

describe('the express form', () => {
    it('opens blank when handed no plan at all', async () => {
        hydrateBlueprint.mockResolvedValue({
            setup: { asset: '', scenarios: [{ id: 's1', entry_zones: [], stop_zones: [], tp_zones: [], conditions: [] }] },
            readiness: { ready: false, missing: ['asset', 'direction'], problems: [] },
            problems: [], vocabulary: VOCAB,
        })
        await openForm()

        expect(hydrateBlueprint).toHaveBeenCalledWith(null, ACCOUNTS)
        expect(screen.getByLabelText('Ticker').value).toBe('')
        // The gaps are stated rather than left as a dark button with no explanation.
        expect(screen.getByText(/Still needs:/).textContent).toContain('asset, direction')
    })

    it('offers the closed-set choices as buttons, from the SERVER vocabulary', async () => {
        await openForm()
        const horizon = screen.getByRole('group', { name: 'Horizon' })
        expect([...horizon.querySelectorAll('button')].map(b => b.textContent)).toEqual(VOCAB.horizons)

        // A value the client has never heard of still renders — the whole point of serving the
        // vocabulary rather than copying it.
        const tf = screen.getByRole('group', { name: 'Timeframe' })
        expect([...tf.querySelectorAll('button')].map(b => b.textContent)).toEqual(VOCAB.timeframes)
    })

    it('picks and un-picks — a closed set with no way back is a one-way door', async () => {
        await openForm()   // the fixture opens on `swing`
        const swing = () => screen.getByRole('button', { name: 'swing' })
        expect(swing().getAttribute('aria-pressed')).toBe('true')

        // Clicking the live value CLEARS it. Without this, choosing the wrong horizon leaves no way
        // back to unanswered — only to a different wrong answer.
        fireEvent.click(swing())
        await waitFor(() => expect(swing().getAttribute('aria-pressed')).toBe('false'))

        fireEvent.click(screen.getByRole('button', { name: 'intraday' }))
        await waitFor(() => expect(screen.getByRole('button', { name: 'intraday' }).getAttribute('aria-pressed')).toBe('true'))
    })

    it('never asks the user to classify their own plan — there is no lens field', async () => {
        await openForm()
        // Mentor names `trade_mode` when it draws the zones, off the conditions they wrote.
        expect(screen.queryByLabelText('Lens')).toBeNull()
        expect(screen.queryByRole('group', { name: 'Lens' })).toBeNull()
    })

    it('asks for a PRICE per level, not two edges to invent', async () => {
        await openForm()
        expect(screen.getByLabelText(/^Entry price \w+$/)).toBeTruthy()
        expect(screen.queryByLabelText(/lower edge/)).toBeNull()

        // One number, written to both edges — a zero-width band, which is a legal zone.
        fireEvent.change(screen.getByLabelText(/^Entry price \w+$/), { target: { value: '199' } })
        await waitFor(() => expect(screen.getByLabelText(/^Entry price \w+$/).value).toBe('199'))
    })

    it('shows a ready row per level, so nobody pays a click before typing a price', async () => {
        await openForm()
        expect(screen.getByLabelText(/^Stop \w+$/)).toBeTruthy()
        expect(screen.getByLabelText(/^Target \w+$/)).toBeTruthy()
    })

    it('says which rungs the monitor may read — the timeframe decides it and nobody would guess', async () => {
        await openForm()
        expect(screen.getByText(/Monitor watches:/).textContent).toContain('day · 4hr · 1hr')
    })
})

describe("someone else's plan", () => {
    const shared = { locked: ['plan'], blueprint: { asset: 'NVDA' } }

    it('freezes their prices and leaves the sizes live — the one thing you must type', async () => {
        await openForm(shared)

        // Their levels: visible, untouchable.
        expect(screen.getByLabelText('Entry e1 lower edge').disabled).toBe(true)
        expect(screen.getByLabelText('Entry e1 lower edge').value).toBe('199')
        expect(screen.getByLabelText('Stop s1s upper edge').disabled).toBe(true)
        // The nucleus is stated, not offered — chips, no fields to be denied.
        expect(screen.queryByLabelText('Ticker')).toBeNull()
        expect(screen.getByText('NVDA')).toBeTruthy()

        // Your size: the exception, on every group.
        expect(screen.getByLabelText('Entry e1 quantity').disabled).toBe(false)
        expect(screen.getByLabelText('Stop s1s quantity').disabled).toBe(false)
        expect(screen.getByLabelText('Target t1 quantity').disabled).toBe(false)
    })

    it('offers no way to add or remove a level while locked', async () => {
        await openForm(shared)
        expect(screen.queryByTitle('Add a stop zone')).toBeNull()
        expect(screen.queryByLabelText('Remove e1')).toBeNull()
        expect(screen.queryByText('+ another way in')).toBeNull()
    })

    it('opens as sent, and unlocks only when asked', async () => {
        await openForm(shared)
        expect(screen.queryByLabelText('Ticker')).toBeNull()

        fireEvent.click(screen.getByText('Edit it anyway'))
        await waitFor(() => expect(screen.getByLabelText('Ticker').disabled).toBe(false))
    })

    it('unlocking gives back PRICES, never band edges — zones are never the user’s to choose', async () => {
        await openForm(shared)
        fireEvent.click(screen.getByText('Edit it anyway'))
        await waitFor(() => expect(screen.getByLabelText('Ticker').disabled).toBe(false))

        // The unlock used to be the one door into editing `lower` and `upper` by hand.
        expect(screen.queryByLabelText(/lower edge/)).toBeNull()
        expect(screen.queryByLabelText(/upper edge/)).toBeNull()
        expect(screen.getByLabelText(/^Entry price \w+$/).disabled).toBe(false)
    })

    it('shows the edge each band is NAMED BY, so the box is not a number nobody wrote', async () => {
        await openForm(shared)
        fireEvent.click(screen.getByText('Edit it anyway'))
        await waitFor(() => expect(screen.getByLabelText('Ticker').disabled).toBe(false))

        // Their bands: entry 199–201, stop 196.5–197.9, target 210–211, on a LONG.
        // The stop that rests at the broker is the far edge (196.5); the take-profit is the far
        // edge too (211). Showing `lower` blindly would have put 210 in the target box — a price
        // that is the WINDOW edge, not what the limit fills at.
        expect(screen.getByLabelText(/^Target \w+$/).value).toBe('211')
        expect(screen.getByLabelText(/^Stop \w+$/).value).toBe('196.5')
        expect(screen.getByLabelText(/^Entry price \w+$/).value).toBe('199')
    })

    it('goes back to Mentor once unlocked — the sender’s bands were drawn round other numbers', async () => {
        await openForm(shared)
        expect(action().textContent).toMatch(/Generate setup/)

        fireEvent.click(screen.getByText('Edit it anyway'))
        await waitFor(() => expect(action().textContent).toMatch(/Continue/))
    })

    it('says out loud what could not be read, rather than quietly dropping it', async () => {
        hydrateBlueprint.mockResolvedValue({
            setup: theirPlan(),
            readiness: { ready: false, missing: ['quantity'], problems: [] },
            problems: ['1 target level could not be read as a price.', 'Unknown lens "wyckoff" — opened as discretionary.'],
            vocabulary: VOCAB,
        })
        await openForm(shared)

        expect(screen.getByText(/1 target level could not be read/)).toBeTruthy()
        expect(screen.getByText(/Unknown lens "wyckoff"/)).toBeTruthy()
    })

    it('warns that a plan drawn a while ago may be nowhere near price', async () => {
        await openForm({ ...shared, drawnAt: Date.now() - 3 * 24 * 3600 * 1000 })
        expect(screen.getByText(/Drawn 3 days ago/)).toBeTruthy()
    })

    it('names the sender, because this is a person’s judgment and not a desk’s', async () => {
        await openForm({ ...shared, from: { name: 'Dana' } })
        expect(screen.getByText('Sent by Dana.')).toBeTruthy()
    })
})

describe('the gate', () => {
    it('re-asks the server as the plan changes — a form has no turns to refresh it', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        try {
            await openForm()
            validateDraft.mockClear()

            fireEvent.change(screen.getByLabelText(/^Entry price .* quantity/), { target: { value: '25' } })
            await vi.advanceTimersByTimeAsync(500)

            expect(validateDraft).toHaveBeenCalled()
            const [sent] = validateDraft.mock.calls.at(-1)
            expect(sent.scenarios[0].entry_zones[0].quantity).toBe(25)
        } finally {
            vi.useRealTimers()
        }
    })

    it('holds the action dark until the server says ready, then hands over the form’s OWN draft', async () => {
        const onHandoff = vi.fn()
        await openForm({ onHandoff })

        expect(action().disabled).toBe(true)

        validateDraft.mockResolvedValue({
            setup: theirPlan(), readiness: { ready: true, missing: [], problems: [] }, vocabulary: VOCAB,
        })
        fireEvent.change(screen.getByLabelText(/^Entry price .* quantity/), { target: { value: '25' } })

        await waitFor(() => expect(action().disabled).toBe(false), { timeout: 3000 })
        fireEvent.click(action())

        // The form owns its draft; the panel's worksheet is a different object and must not be what
        // travels. The size typed here is the proof of which one did.
        expect(onHandoff).toHaveBeenCalledTimes(1)
        expect(onHandoff.mock.calls[0][0].scenarios[0].entry_zones[0].quantity).toBe(25)
    })

    it('names the DESTINATION, not our jargon — "zones" is a word this app has, not one they used', async () => {
        await openForm({ onHandoff: vi.fn(), handoffLabel: 'Continue to Mentor' })
        expect(action().textContent).toMatch(/Continue to Mentor/)
    })

    it('a typed plan goes to MENTOR to be drawn; a shared one is already drawn and generates', async () => {
        const onGenerate = vi.fn(); const onHandoff = vi.fn()

        // Typed: prices, no bands yet.
        await openForm({ onGenerate, onHandoff })
        expect(action().textContent).toMatch(/Continue/)
        cleanup()

        // Shared: the sender's Mentor already drew them, so re-drawing would overwrite their work.
        await openForm({ onGenerate, onHandoff, locked: ['plan'], blueprint: { asset: 'NVDA' } })
        expect(action().textContent).toMatch(/Generate setup/)
    })

    it('counts a missing account as a gap like any other, not a silently dark button', async () => {
        await openForm({ accounts: [] })
        expect(screen.getByText(/Still needs:/).textContent).toContain('trading account')
    })

    it('reports a contradiction differently from a gap — one is unfinished, the other is wrong', async () => {
        hydrateBlueprint.mockResolvedValue({
            setup: theirPlan(),
            readiness: { ready: false, missing: [], problems: ['validity floor 190 sits below the stop at 196.5'] },
            problems: [], vocabulary: VOCAB,
        })
        await openForm()
        expect(screen.getByText(/Doesn’t add up: validity floor 190/)).toBeTruthy()
    })
})

describe('opening on the live worksheet', () => {
    it('takes the validate path, so sizes already on screen are not stripped away', async () => {
        const draft = theirPlan()
        draft.scenarios[0].entry_zones[0].quantity = 80

        render(<SetupForm accounts={ACCOUNTS} draft={draft} onGenerate={vi.fn()} onHandoff={vi.fn()} />)
        await screen.findByRole('heading', { name: /setup/i })

        // Hydration is what strips quantity (it is what makes a blueprint portable); a live draft
        // must never go through it.
        expect(hydrateBlueprint).not.toHaveBeenCalled()
        expect(validateDraft).toHaveBeenCalled()
        expect(screen.getByLabelText(/^Entry price .* quantity/).value).toBe('80')
    })
})

describe('relativeAge', () => {
    const now = 1_700_000_000_000
    it('answers in the coarsest unit that is still honest', () => {
        expect(relativeAge(now - 30_000, now)).toBe('just now')
        expect(relativeAge(now - 12 * 60_000, now)).toBe('12 minutes ago')
        expect(relativeAge(now - 60 * 60_000, now)).toBe('an hour ago')
        expect(relativeAge(now - 5 * 3600_000, now)).toBe('5 hours ago')
        expect(relativeAge(now - 26 * 3600_000, now)).toBe('yesterday')
        expect(relativeAge(now - 9 * 24 * 3600_000, now)).toBe('9 days ago')
    })

    it('does not claim the future', () => {
        expect(relativeAge(now + 60_000, now)).toBe('just now')
        expect(relativeAge(undefined, now)).toBe('just now')
    })
})

// ── The setup-wide condition tier ────────────────────────────────────────────
// It is OPTIONAL: setupReadiness wants one condition somewhere, and the two tiers satisfy that for
// each other. So the form must not imply the user owes it one.
describe('"Always — whichever entry"', () => {
    it('stays out of the way on a single-scenario plan, where it means nothing extra', async () => {
        hydrateBlueprint.mockResolvedValue({
            setup: { ...theirPlan(), conditions: [] },
            readiness: { ready: false, missing: ['quantity'], problems: [] },
            problems: [], vocabulary: VOCAB,
        })
        await openForm()

        expect(screen.queryByText('Always — whichever entry')).toBeNull()
        // The per-entry tier is still there — that is the one that is actually being asked for.
        expect(screen.getByText('Takes this entry when')).toBeTruthy()
    })

    it('stays out of the way even with two entry scenarios — Mentor decides what is general', async () => {
        const two = theirPlan()
        two.conditions = []
        two.scenarios.push({ ...two.scenarios[0], id: 's2', name: 'the breakout' })
        hydrateBlueprint.mockResolvedValue({
            setup: two, readiness: { ready: false, missing: ['quantity'], problems: [] },
            problems: [], vocabulary: VOCAB,
        })
        await openForm()

        // Sorting your own conditions into general and specific is filing, not trading. The user
        // writes them under the entry they belong to; Mentor hoists the general ones when it draws
        // the zones (see the express hand-off in its prompt).
        expect(screen.queryByText('Always — whichever entry')).toBeNull()
    })

    it('never hides what someone has already written there', async () => {
        hydrateBlueprint.mockResolvedValue({
            setup: { ...theirPlan(), conditions: [{ id: 'c1', text: 'SPY not red on the day', weight: 'confirming' }] },
            readiness: { ready: false, missing: ['quantity'], problems: [] },
            problems: [], vocabulary: VOCAB,
        })
        await openForm()

        expect(screen.getByText('Always — whichever entry')).toBeTruthy()
    })

})

// ── Conditions ───────────────────────────────────────────────────────────────
// A condition is a SENTENCE. Whether it is the trigger, whether it is a hard test, whether it
// latches — that is a reading of the sentence, and it is Mentor's the same way the lens is.
describe('what gets you in', () => {
    it('asks for words and nothing else — no weight, mode or persistence to classify', async () => {
        await openForm()

        expect(screen.getByLabelText('Condition 1')).toBeTruthy()
        for (const tag of ['Weight', 'Mode', 'Persistence']) {
            expect(screen.queryByLabelText(tag)).toBeNull()
        }
        // …and none of the vocabulary leaks in as a control either.
        for (const word of ['primary', 'confirming', 'measured', 'judgment', 'latching']) {
            expect(screen.queryByRole('option', { name: word })).toBeNull()
        }
    })

    it('writes the sentence through untagged, leaving the reading to Mentor', async () => {
        // Opened on a scenario with NO conditions, so the row under test is one the user added —
        // the fixture's own condition arrives pre-tagged, as a plan that has been through Mentor
        // would.
        const blank = theirPlan()
        blank.scenarios = [{ ...blank.scenarios[0], conditions: [] }]
        hydrateBlueprint.mockResolvedValue({
            setup: blank, readiness: { ready: false, missing: ['quantity'], problems: [] },
            problems: [], vocabulary: VOCAB,
        })

        vi.useFakeTimers({ shouldAdvanceTime: true })
        try {
            await openForm()
            fireEvent.click(screen.getByRole('button', { name: /Add what has to happen/ }))
            validateDraft.mockClear()

            fireEvent.change(screen.getByLabelText('Condition 1'), { target: { value: 'sweeps the prior low then reclaims' } })
            await vi.advanceTimersByTimeAsync(500)

            const [sent] = validateDraft.mock.calls.at(-1)
            const c = sent.scenarios[0].conditions[0]
            expect(c.text).toBe('sweeps the prior low then reclaims')
            // Absent, not guessed. The normaliser's defaults under-claim, which is the right resting
            // state if the hand-off to Mentor never happens.
            expect(c.weight).toBeUndefined()
            expect(c.mode).toBeUndefined()
            expect(c.persistence).toBeUndefined()
        } finally {
            vi.useRealTimers()
        }
    })

    it('invites the first one instead of offering a bare +', async () => {
        hydrateBlueprint.mockResolvedValue({
            setup: { ...theirPlan(), scenarios: [{ ...theirPlan().scenarios[0], conditions: [] }] },
            readiness: { ready: false, missing: ['quantity'], problems: [] },
            problems: [], vocabulary: VOCAB,
        })
        await openForm()

        const add = screen.getByRole('button', { name: /Add what has to happen/ })
        expect(add).toBeTruthy()
        fireEvent.click(add)
        await waitFor(() => expect(screen.getByLabelText('Condition 1')).toBeTruthy())
        // Once there is one, the invitation becomes an "and".
        expect(screen.getByRole('button', { name: /Add another condition/ })).toBeTruthy()
    })
})

// ── Staged exits ─────────────────────────────────────────────────────────────
describe('adding another exit level', () => {
    const emptyExits = () => {
        const p = theirPlan()
        p.scenarios = [{ ...p.scenarios[0], stop_zones: [], tp_zones: [] }]
        hydrateBlueprint.mockResolvedValue({
            setup: p, readiness: { ready: false, missing: ['quantity'], problems: [] },
            problems: [], vocabulary: VOCAB,
        })
    }

    it('offers nothing until the level has a price — an empty row invites a column of them', async () => {
        emptyExits()
        await openForm()
        expect(screen.queryByRole('button', { name: /Add another target/ })).toBeNull()

        fireEvent.change(screen.getByLabelText(/^Target \w+$/), { target: { value: '210' } })
        await waitFor(() => expect(screen.getByRole('button', { name: /Add another target/ })).toBeTruthy())
    })

    it('adds a second target beside the first, not a second entry', async () => {
        emptyExits()
        await openForm()
        fireEvent.change(screen.getByLabelText(/^Target \w+$/), { target: { value: '210' } })
        fireEvent.click(await screen.findByRole('button', { name: /Add another target/ }))

        await waitFor(() => expect(screen.getAllByLabelText(/^Target \w+$/)).toHaveLength(2))
        // The entry is never offered one: a scenario takes the whole position at one entry, and a
        // second way in is a second SCENARIO.
        expect(screen.queryByRole('button', { name: /Add another entry/ })).toBeNull()
    })

    it('offers it on the LAST level only, so every filled row does not carry one', async () => {
        emptyExits()
        await openForm()
        fireEvent.change(screen.getByLabelText(/^Target \w+$/), { target: { value: '210' } })
        fireEvent.click(await screen.findByRole('button', { name: /Add another target/ }))
        await waitFor(() => expect(screen.getAllByLabelText(/^Target \w+$/)).toHaveLength(2))

        // The new row has no price yet, so nothing offers a third.
        expect(screen.queryAllByRole('button', { name: /Add another target/ })).toHaveLength(0)
    })
})
