import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { CoverageChips } from './CoverageChips.jsx'
import { ZoneEditor } from './ZoneEditor.jsx'
import { ScenarioBlock } from './ScenarioBlock.jsx'
import { ConditionList } from './ConditionList.jsx'
import { SetupSummary, setupDigest } from './SetupSummary.jsx'

afterEach(cleanup)

// A price zone is a SCENARIO: a premise owning its own entry, stop, targets, conditions and death
// line. The flat entry_legs/stop_legs/target_legs on the setup are the server's execution projection
// of whichever premise armed — output, not input.
const FADE = {
    id: 's1', name: 'false break',
    entry_legs: [{ id: 's1e1', price: 201, quantity: 110 }],
    stop_legs:  [{ id: 's1s1', price: 196.5 }],
    target_legs:    [{ id: 's1t1', price: 210.5, quantity: 55 },
                  { id: 's1t2', price: 213.4, quantity: 55 }],
    conditions:  [{ id: 's1c1', text: 'CHoCH up on the 1hr after the sweep', weight: 'primary', mode: 'measured', persistence: 'live' }],
    validity:    { lower: 195, upper: 208, approach: 209, on_break: 'revise' },
    quantity: 110, rr: 2.11,
}

const BREAK = {
    id: 's2', name: 'break and go',
    entry_legs: [{ id: 's2e1', price: 208, quantity: 60 }],
    stop_legs:  [{ id: 's2s1', price: 204 }],
    target_legs:    [{ id: 's2t1', price: 220, quantity: 60 }],
    conditions:  [{ id: 's2c1', text: '1hr close above 208 on expanding volume', weight: 'primary', mode: 'measured', persistence: 'live' }],
    quantity: 60, rr: 1.4,
}

const SETUP = {
    asset: 'NVDA', direction: 'long', type: 'swing', trade_mode: 'smc', timeframe: '4hr',
    thesis: 'Sweep of the 199 shelf that fails and reclaims.',
    conditions: [{ id: 'c1', text: 'SMH leading, not diverging', weight: 'confirming', mode: 'discretionary', persistence: 'live' }],
    scenarios: [FADE, BREAK],
    conviction: { level: 'medium', rationale: 'fresh OB, but earnings in 4 weeks' },
    // The projection — what the server derives, never what the panel writes.
    entry_legs: FADE.entry_legs, stop_legs: FADE.stop_legs, target_legs: FADE.target_legs,
    rr: 2.11, quantity: 110,
}

describe('CoverageChips', () => {
    it('marks only what has actually been read', () => {
        render(<CoverageChips coverage={['markets', 'technicals']} />)
        const chips = screen.getAllByTitle(/Markets|Company|Technicals/)
        expect(chips).toHaveLength(3)
        expect(screen.getByTitle(/^Markets — read/)).toBeTruthy()
        expect(screen.getByTitle(/^Company — not read yet/)).toBeTruthy()
    })

    it('renders all three dimensions even with no coverage yet', () => {
        render(<CoverageChips coverage={[]} />)
        // Progress must be visible from the first turn, not appear out of nowhere.
        expect(screen.getByText('Markets')).toBeTruthy()
        expect(screen.getByText('Company')).toBeTruthy()
        expect(screen.getByText('Technicals')).toBeTruthy()
    })

    it('survives a missing or malformed coverage prop', () => {
        expect(() => render(<CoverageChips />)).not.toThrow()
        cleanup()
        expect(() => render(<CoverageChips coverage={null} />)).not.toThrow()
    })
})

describe('ZoneEditor', () => {
    // ONE PRICE PER LEVEL, all the way down. The editor used to hold two edges and sort them on
    // commit; bands stopped being drawn in August 2026 and the STORAGE followed on 2026-09-24, so a
    // row is simply the leg's `price`.

    it('renders a row per level across all three groups', () => {
        render(<ZoneEditor scenario={FADE} onChange={() => {}} />)
        expect(screen.getByLabelText('Entry price s1e1').value).toBe('201')
        expect(screen.getByLabelText('Stop s1s1').value).toBe('196.5')
        expect(screen.getByLabelText('Target s1t2 quantity').value).toBe('55')
    })

    it('a leg with no price yet shows an EMPTY box, never a zero', () => {
        // This asserted that a LEGACY band showed the edge it acted at, because showing `lower` put
        // "210" in the box for a 210–211 target when 211 was where the limit rested. No document
        // carries edges any more, so what is left to get wrong is the blank row: a null rendered as
        // 0 reads as a price somebody chose.
        const blank = { ...FADE, target_legs: [{ id: 's1t1', price: null, quantity: 110 }] }
        render(<ZoneEditor scenario={blank} onChange={() => {}} />)
        expect(screen.getByLabelText('Target s1t1').value).toBe('')
    })

    it('totals each group separately so a mis-split across legs is visible', () => {
        // Deliberately mis-split: 110 in, but only 80 planned out.
        const misSplit = { ...FADE, target_legs: [{ id: 's1t1', price: 210, quantity: 40 },
                                                  { id: 's1t2', price: 213, quantity: 40 }] }
        render(<ZoneEditor scenario={misSplit} onChange={() => {}} />)

        const total = (label) => within(screen.getByText(label).closest('section')).getByText(/^\d+$/).textContent
        expect(total('Entry')).toBe('110')
        expect(total('Target')).toBe('80')   // visibly short of the entry size
    })

    it('edits a level through onChange without mutating the original', () => {
        const onChange = vi.fn()
        render(<ZoneEditor scenario={FADE} onChange={onChange} />)
        fireEvent.change(screen.getByLabelText('Entry price s1e1'), { target: { value: '198' } })

        const next = onChange.mock.calls[0][0]
        expect(next.entry_legs[0].price).toBe(198)
        expect(next.entry_legs[0].lower).toBe(undefined, 'no edge is written anywhere any more')
        expect(FADE.entry_legs[0].price).toBe(201, 'the original is untouched')
    })

    it('a condition on an EXIT rides on the leg, in the shape an entry condition has', () => {
        // It used to be free text in the zone's `note`, which reached the entry read and was dropped
        // from the in-position one — so a condition on a stop was read while waiting to get in and
        // never once after. Same normaliser as an entry condition now, same read.
        const onChange = vi.fn()
        render(<ZoneEditor scenario={FADE} onChange={onChange} />)
        fireEvent.change(screen.getByLabelText('Stop s1s1 condition'),
            { target: { value: 'only on a 15min close below' } })

        const [cond] = onChange.mock.calls[0][0].stop_legs[0].conditions
        expect(cond.text).toBe('only on a 15min close below')
        expect(cond.id).toBe('s1s1c1', 'scoped to the leg, so ids stay unique document-wide')
    })

    it('clearing the condition removes it rather than storing an empty sentence', () => {
        const withCond = { ...FADE, stop_legs: [{ ...FADE.stop_legs[0], conditions: [{ id: 'x', text: 'if it closes below' }] }] }
        const onChange = vi.fn()
        render(<ZoneEditor scenario={withCond} onChange={onChange} />)
        fireEvent.change(screen.getByLabelText('Stop s1s1 condition'), { target: { value: '   ' } })
        expect(onChange.mock.calls[0][0].stop_legs[0].conditions).toEqual([])
    })

    it('the ENTRY takes no condition here — that is what the premise conditions are', () => {
        render(<ZoneEditor scenario={FADE} onChange={() => {}} />)
        expect(screen.queryByLabelText('Entry price s1e1 condition')).toBeNull()
    })

    it('will not add a SECOND entry level — that is a second scenario, not a second leg', () => {
        render(<ZoneEditor scenario={FADE} onChange={() => {}} />)
        expect(screen.queryByLabelText('Add another entry')).toBeNull()
    })

    it('offers another TARGET once the first has a price, for staged exits', () => {
        render(<ZoneEditor scenario={FADE} onChange={() => {}} />)
        expect(screen.getByLabelText('Add another target')).toBeTruthy()
    })

    // The two affordances above were tested for BEING THERE and never for doing anything, and both
    // handlers were simply missing — every click threw a ReferenceError. Staged exits could not be
    // built at all, and a document that already held two targets could not be reduced to one.

    it('adding a target appends an empty level scoped to the scenario', () => {
        const onChange = vi.fn()
        render(<ZoneEditor scenario={FADE} onChange={onChange} />)
        fireEvent.click(screen.getByLabelText('Add another target'))

        const tps = onChange.mock.calls[0][0].target_legs
        expect(tps).toHaveLength(3)
        expect(tps[2].id).toBe('s1t3', 'scoped to the premise, so ids stay unique document-wide')
        expect(FADE.target_legs).toHaveLength(2, 'the original is untouched')
    })

    it('the added level carries no price and no size of its own', () => {
        // Copying the row above would put a second target at the same price and double the size
        // the plan says it exits — neither is a thing anyone asked for.
        const onChange = vi.fn()
        render(<ZoneEditor scenario={FADE} onChange={onChange} />)
        fireEvent.click(screen.getByLabelText('Add another target'))

        const added = onChange.mock.calls[0][0].target_legs[2]
        expect(added.lower).toBeNull()
        expect(added.upper).toBeNull()
        expect(added.quantity).toBeNull()
    })

    it('a new level never reuses a removed one’s id', () => {
        // A leg condition is minted off the zone id (`<zone>c1`) and monitor_state latches on that
        // key. Recycling s1t1 here would let the dead leg's latch answer for the new one.
        const afterRemoval = { ...FADE, target_legs: [{ id: 's1t2', price: 213, quantity: 55 }] }
        const onChange = vi.fn()
        render(<ZoneEditor scenario={afterRemoval} onChange={onChange} />)
        fireEvent.click(screen.getByLabelText('Add another target'))
        expect(onChange.mock.calls[0][0].target_legs[1].id).toBe('s1t3')
    })

    it('removing a target drops that one and leaves the rest', () => {
        const onChange = vi.fn()
        render(<ZoneEditor scenario={FADE} onChange={onChange} />)
        fireEvent.click(screen.getByLabelText('Remove s1t1'))

        const tps = onChange.mock.calls[0][0].target_legs
        expect(tps.map(z => z.id)).toEqual(['s1t2'])
        expect(FADE.target_legs).toHaveLength(2, 'the original is untouched')
    })

    it('will not remove the only level in a group', () => {
        // A scenario with no stop is not a smaller plan, it is a broken one.
        render(<ZoneEditor scenario={FADE} onChange={() => {}} />)
        expect(screen.queryByLabelText('Remove s1s1')).toBeNull()
        expect(screen.queryByLabelText('Remove s1e1')).toBeNull()
    })

    it('scopes new level ids to the scenario, so ids stay unique across premises', () => {
        // An empty group renders one ready-to-type row that becomes real on the first keystroke —
        // asking someone to press + before they can type their stop is a click charged for nothing.
        const bare = { ...FADE, stop_legs: [] }
        const onChange = vi.fn()
        render(<ZoneEditor scenario={bare} onChange={onChange} />)
        fireEvent.change(screen.getByLabelText('Stop s1s1'), { target: { value: '196' } })
        expect(onChange.mock.calls[0][0].stop_legs[0].id).toBe('s1s1')
    })

    it('hides the editing affordances when read-only', () => {
        render(<ZoneEditor scenario={FADE} onChange={() => {}} readOnly />)
        expect(screen.getByLabelText('Entry price s1e1').disabled).toBe(true)
        expect(screen.queryByLabelText('Add another target')).toBeNull()
        expect(screen.queryByLabelText('Stop s1s1 condition')).toBeNull()
    })
})

describe('ConditionList', () => {
    it('leads with the sentence and keeps the structure as small tags', () => {
        render(<ConditionList conditions={FADE.conditions} title="Takes this way in when" />)
        expect(screen.getByText(/CHoCH up on the 1hr/)).toBeTruthy()
        expect(screen.getByText('primary')).toBeTruthy()
        expect(screen.getByText('measured')).toBeTruthy()
    })

    it('marks a latching condition, because it stops being re-checked once it lands', () => {
        render(<ConditionList conditions={[{ id: 'c3', text: 'FDA approval landed', weight: 'confirming', mode: 'measured', persistence: 'latching' }]} title="x" />)
        expect(screen.getByText('latching')).toBeTruthy()
    })

    it('renders nothing rather than an empty heading', () => {
        const { container } = render(<ConditionList conditions={[]} title="x" />)
        expect(container.firstChild).toBeNull()
    })
})

describe('ScenarioBlock', () => {
    it('names the premise, its entry and its own r:r and size', () => {
        render(<ScenarioBlock scenario={FADE} direction="long" index={0} />)
        expect(screen.getByText('false break')).toBeTruthy()
        expect(screen.getByText('201')).toBeTruthy()
        expect(screen.getByText('2.11R')).toBeTruthy()
        // By title, not by text: the entry group's running total reads 110 as well.
        expect(screen.getByTitle(/The whole position/).textContent).toBe('110')
    })

    it('flags a thin r:r on the premise that is thin, not on the setup', () => {
        render(<ScenarioBlock scenario={BREAK} direction="long" index={1} />)
        expect(screen.getByText('1.4R').className).toMatch(/is-thin/)
    })

    it('says which premise is armed, and which one is dead', () => {
        render(<ScenarioBlock scenario={FADE} direction="long" index={0} armed />)
        expect(screen.getByText('armed')).toBeTruthy()
        cleanup()
        render(<ScenarioBlock scenario={FADE} direction="long" index={0} dead />)
        expect(screen.getByText('dead')).toBeTruthy()
    })

    it('reads the validity range in the direction it applies — BOTH edges, with what happens at each', () => {
        render(<ScenarioBlock scenario={FADE} direction="long" index={0} />)
        expect(screen.getByText(/dead on a close below 195/)).toBeTruthy()
        expect(screen.getByText(/gone above 209/)).toBeTruthy()
        // The away edge had no authored answer until 2026-09-26, and an unanswered one is what
        // Generate refuses on — so the line the user reads while the button is dark says it.
        expect(screen.getByText(/no answer yet if it runs/)).toBeTruthy()

        cleanup()
        render(<ScenarioBlock scenario={{ ...FADE, validity: { ...FADE.validity, on_away: 'pass' } }} direction="long" index={0} />)
        expect(screen.getByText(/let it go/)).toBeTruthy()
        expect(screen.queryByText(/no answer yet/)).toBeNull()
    })

    it('names the way in, so "why that stop" has an answer from a closed set', () => {
        render(<ScenarioBlock scenario={{ ...FADE, archetype: 'sweep_reclaim' }} direction="long" index={0} />)
        const badge = screen.getByText('sweep reclaim')
        expect(badge.getAttribute('title')).toMatch(/closes back inside/)
    })

    it('an archetype this build has not heard of still reads, without a tooltip it cannot give', () => {
        render(<ScenarioBlock scenario={{ ...FADE, archetype: 'liquidity_grab' }} direction="long" index={0} />)
        expect(screen.getByText('liquidity grab').getAttribute('title')).toMatch(/as Mentor filed it/)
    })

    it('falls back to a positional name so an unnamed premise is still addressable', () => {
        render(<ScenarioBlock scenario={{ ...FADE, name: '' }} direction="long" index={1} />)
        expect(screen.getByText('Entry scenario 2')).toBeTruthy()
    })
})

describe('SetupSummary', () => {
    it('renders levels read-only without an editor when told to', () => {
        render(<SetupSummary setup={SETUP} readOnly />)
        // Read-only is how the preview renders once the setup is generated.
        expect(screen.getByLabelText('Entry price s1e1').disabled).toBe(true)
    })

    it('prompts before there is anything to show', () => {
        render(<SetupSummary setup={{}} />)
        expect(screen.getByText(/will build here as you talk it through/)).toBeTruthy()
    })

    it('shows the nucleus, the lens and the thesis', () => {
        render(<SetupSummary setup={SETUP} />)
        expect(screen.getByText('NVDA')).toBeTruthy()
        expect(screen.getByText('LONG')).toBeTruthy()
        expect(screen.getByText('smc')).toBeTruthy()
        expect(screen.getByText(/Sweep of the 199 shelf/)).toBeTruthy()
    })

    it('RENDERS EVERY WAY IN — one set of levels would hide the second premise', () => {
        render(<SetupSummary setup={SETUP} />)
        expect(screen.getByLabelText('Scenario false break')).toBeTruthy()
        expect(screen.getByLabelText('Scenario break and go')).toBeTruthy()
        // Each keeps its OWN size: rivals, so 110 and 60 are never added into 170.
        expect(screen.getAllByTitle(/The whole position/).map(n => n.textContent)).toEqual(['110', '60'])
    })

    it('shows a dead premise as dead while the other stays live', () => {
        const half = { ...SETUP, armed_scenario_id: 's2', monitor_state: { scenarios: { s1: { invalidation_status: 'fired' } } } }
        render(<SetupSummary setup={half} />)
        expect(within(screen.getByLabelText('Scenario false break')).getByText('dead')).toBeTruthy()
        expect(within(screen.getByLabelText('Scenario break and go')).getByText('armed')).toBeTruthy()
    })

    it('writes an edit into SCENARIOS, never into the flat projection', () => {
        // The flat legs are the server's output. An edit written there looks accepted here and is
        // silently discarded on Generate, because normalizeSetup reads `scenarios`.
        const onChange = vi.fn()
        render(<SetupSummary setup={SETUP} onChange={onChange} />)
        fireEvent.change(screen.getByLabelText('Entry price s2e1'), { target: { value: '207' } })

        const next = onChange.mock.calls[0][0]
        expect(next.scenarios[1].entry_legs[0].price).toBe(207)
        expect(next.scenarios[0]).toEqual(FADE, 'the rival premise is untouched')
        expect(next.entry_legs).toEqual(SETUP.entry_legs, 'the projection is the server’s to re-derive')
    })

    it('adds a second entry scenario, not another entry zone, not as another entry zone', () => {
        const onChange = vi.fn()
        render(<SetupSummary setup={{ ...SETUP, scenarios: [FADE] }} onChange={onChange} />)
        fireEvent.click(screen.getByRole('button', { name: /another scenario/ }))

        const next = onChange.mock.calls[0][0]
        expect(next.scenarios).toHaveLength(2)
        expect(next.scenarios[1].id).toBe('s2')
        expect(next.scenarios[1].entry_legs).toEqual([])
    })

    it('offers removal only once there is a rival to remove', () => {
        const { rerender } = render(<SetupSummary setup={{ ...SETUP, scenarios: [FADE] }} onChange={() => {}} />)
        expect(screen.queryByLabelText('Remove false break')).toBeNull()
        rerender(<SetupSummary setup={SETUP} onChange={() => {}} />)
        expect(screen.getByLabelText('Remove false break')).toBeTruthy()
    })

    it('lists the setup-wide conditions once, above the entry scenarios', () => {
        render(<SetupSummary setup={SETUP} />)
        const always = screen.getByText('Always — whichever entry').closest('section')
        expect(within(always).getByText(/SMH leading/)).toBeTruthy()
        // And each premise's own trigger stays inside that premise.
        expect(within(screen.getByLabelText('Scenario false break')).getByText(/CHoCH up on the 1hr/)).toBeTruthy()
    })

    it('says so plainly when no entry scenario has been drawn yet', () => {
        render(<SetupSummary setup={{ ...SETUP, scenarios: [] }} />)
        expect(screen.getByText(/No entry scenario drawn yet/)).toBeTruthy()
    })

    it('surfaces stamped event risk, which is checked whether or not news was declared', () => {
        const withEvents = { ...SETUP, event_risk: [{ date: '2026-07-29', label: 'FOMC Rate Decision' }] }
        render(<SetupSummary setup={withEvents} />)
        expect(screen.getByText(/FOMC Rate Decision/)).toBeTruthy()
    })
})

// The folded preview. The worksheet is a reference you glance up at, so Mentor opens it as one
// line — which means that line has to carry what you would otherwise open it to check.
describe('setupDigest', () => {
    it('names the asset, the direction and how many entry scenarios', () => {
        expect(setupDigest(SETUP)).toBe('NVDA · LONG · 2 entry scenarios')
    })

    // With a single premise the count says nothing you didn't know, so the space goes to the entry
    // band instead — the number you actually look up mid-conversation. Same formatter as the block
    // below it, so folded and open can't disagree about where the entry is.
    it('shows the entry LEVEL instead of a count when there is one way in', () => {
        expect(setupDigest({ ...SETUP, scenarios: [FADE] })).toBe('NVDA · LONG · entry 201')
    })

    // Early in the build there is a ticker and little else. The digest must degrade to whatever is
    // known rather than inventing structure — a setup with no premise drawn yet says so by omission.
    it('degrades to what is known, and is empty before there is an asset', () => {
        expect(setupDigest({ asset: 'AVGO' })).toBe('AVGO')
        expect(setupDigest({ asset: 'AVGO', direction: 'short', scenarios: [] })).toBe('AVGO · SHORT')
        expect(setupDigest(null)).toBe('')
        expect(setupDigest({})).toBe('')
    })
})
