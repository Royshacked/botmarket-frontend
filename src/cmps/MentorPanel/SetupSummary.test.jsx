import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { CoverageChips } from './CoverageChips.jsx'
import { ZoneEditor } from './ZoneEditor.jsx'
import { ScenarioBlock } from './ScenarioBlock.jsx'
import { ConditionList } from './ConditionList.jsx'
import { SetupSummary, setupDigest } from './SetupSummary.jsx'

afterEach(cleanup)

// A price zone is a SCENARIO: a premise owning its own entry, stop, targets, conditions and death
// line. The flat entry_zones/stop_zones/tp_zones on the setup are the server's execution projection
// of whichever premise armed — output, not input.
const FADE = {
    id: 's1', name: 'false break',
    entry_zones: [{ id: 's1e1', lower: 199, upper: 201, quantity: 110 }],
    stop_zones:  [{ id: 's1s1', lower: 196.5, upper: 197.9 }],
    tp_zones:    [{ id: 's1t1', lower: 210.5, upper: 211, quantity: 55 },
                  { id: 's1t2', lower: 213.4, upper: 214, quantity: 55 }],
    conditions:  [{ id: 's1c1', text: 'CHoCH up on the 1hr after the sweep', weight: 'primary', mode: 'measured', persistence: 'live' }],
    validity:    { lower: 195, upper: 208, approach: 209, on_break: 'revise' },
    quantity: 110, rr: 2.11,
}

const BREAK = {
    id: 's2', name: 'break and go',
    entry_zones: [{ id: 's2e1', lower: 208, upper: 209, quantity: 60 }],
    stop_zones:  [{ id: 's2s1', lower: 204, upper: 205 }],
    tp_zones:    [{ id: 's2t1', lower: 220, upper: 221, quantity: 60 }],
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
    entry_zones: FADE.entry_zones, stop_zones: FADE.stop_zones, tp_zones: FADE.tp_zones,
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
    it('renders a row per zone across all three groups', () => {
        render(<ZoneEditor scenario={FADE} onChange={() => {}} />)
        expect(screen.getByLabelText('Entry s1e1 lower edge').value).toBe('199')
        expect(screen.getByLabelText('Stop s1s1 upper edge').value).toBe('197.9')
        expect(screen.getByLabelText('Target s1t2 quantity').value).toBe('55')
    })

    it('totals each group separately so a mis-split across legs is visible', () => {
        // Deliberately mis-split: 110 in, but only 80 planned out.
        const misSplit = { ...FADE, tp_zones: [{ id: 's1t1', lower: 210, upper: 211, quantity: 40 },
                                               { id: 's1t2', lower: 213, upper: 214, quantity: 40 }] }
        render(<ZoneEditor scenario={misSplit} onChange={() => {}} />)

        const total = (label) => within(screen.getByText(label).closest('section')).getByText(/^\d+$/).textContent
        expect(total('Entry')).toBe('110')
        expect(total('Target')).toBe('80')   // visibly short of the entry size
    })

    it('edits an edge through onChange without mutating the original', () => {
        const onChange = vi.fn()
        render(<ZoneEditor scenario={FADE} onChange={onChange} />)
        fireEvent.change(screen.getByLabelText('Entry s1e1 lower edge'), { target: { value: '198' } })

        expect(onChange).toHaveBeenCalledTimes(1)
        // It hands back a SCENARIO, not a setup — the caller writes it into scenarios[i].
        expect(onChange.mock.calls[0][0].id).toBe('s1')
        expect(onChange.mock.calls[0][0].entry_zones[0].lower).toBe(198)
        expect(FADE.entry_zones[0].lower).toBe(199)   // the prop object is untouched
    })

    it('SORTS inverted edges on blur rather than rejecting them', () => {
        // The user is typing two numbers; which lands first is not worth an error state.
        const inverted = { ...FADE, entry_zones: [{ id: 's1e1', lower: 205, upper: 201, quantity: 10 }] }
        const onChange = vi.fn()
        render(<ZoneEditor scenario={inverted} onChange={onChange} />)
        fireEvent.blur(screen.getByLabelText('Entry s1e1 lower edge'))

        const zone = onChange.mock.calls[0][0].entry_zones[0]
        expect([zone.lower, zone.upper]).toEqual([201, 205])
    })

    it('leaves a correctly ordered zone alone on blur', () => {
        const onChange = vi.fn()
        render(<ZoneEditor scenario={FADE} onChange={onChange} />)
        fireEvent.blur(screen.getByLabelText('Entry s1e1 lower edge'))
        expect(onChange.mock.calls[0][0].entry_zones[0]).toEqual(FADE.entry_zones[0])
    })

    it('flags a zero-width band as an exact level, not an error', () => {
        const exact = { ...FADE, stop_zones: [{ id: 's1s1', lower: 197, upper: 197 }] }
        render(<ZoneEditor scenario={exact} onChange={() => {}} />)
        expect(screen.getByText('exact')).toBeTruthy()
    })

    it('will not add a SECOND entry zone — that is a second scenario, not a second leg', () => {
        // Execution fires once for the scenario's whole size, so two entries in one premise would
        // place both legs on whichever printed. The server refuses it; the button never offers it.
        render(<ZoneEditor scenario={FADE} onChange={() => {}} />)
        expect(screen.queryByTitle('Add a entry zone')).toBeNull()
        expect(screen.getByTitle('Add a target zone')).toBeTruthy()
    })

    it('offers the entry button while the premise has no entry yet', () => {
        const onChange = vi.fn()
        render(<ZoneEditor scenario={{ ...FADE, entry_zones: [] }} onChange={onChange} />)
        fireEvent.click(screen.getByTitle('Add a entry zone'))
        expect(onChange.mock.calls[0][0].entry_zones[0].id).toBe('s1e1')
    })

    it('scopes new zone ids to the scenario, so ids stay unique across premises', () => {
        const onChange = vi.fn()
        render(<ZoneEditor scenario={BREAK} onChange={onChange} />)
        fireEvent.click(screen.getByTitle('Add a target zone'))
        expect(onChange.mock.calls[0][0].tp_zones[1].id).toBe('s2t2')
    })

    it('removes a zone', () => {
        const onChange = vi.fn()
        render(<ZoneEditor scenario={FADE} onChange={onChange} />)
        fireEvent.click(screen.getByLabelText('Remove s1t1'))
        expect(onChange.mock.calls[0][0].tp_zones.map(z => z.id)).toEqual(['s1t2'])
    })

    it('hides the editing affordances when read-only', () => {
        render(<ZoneEditor scenario={FADE} readOnly />)
        expect(screen.queryByTitle('Add a target zone')).toBeNull()
        expect(screen.getByLabelText('Entry s1e1 lower edge').disabled).toBe(true)
    })

    it('renders nothing for a missing scenario', () => {
        const { container } = render(<ZoneEditor scenario={null} />)
        expect(container.firstChild).toBeNull()
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
        expect(screen.getByText('199–201')).toBeTruthy()
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

    it('reads the validity range in the direction it applies', () => {
        render(<ScenarioBlock scenario={FADE} direction="long" index={0} />)
        expect(screen.getByText(/dead on a close below 195/)).toBeTruthy()
        expect(screen.getByText(/gone above 209/)).toBeTruthy()
    })

    it('falls back to a positional name so an unnamed premise is still addressable', () => {
        render(<ScenarioBlock scenario={{ ...FADE, name: '' }} direction="long" index={1} />)
        expect(screen.getByText('Entry scenario 2')).toBeTruthy()
    })
})

describe('SetupSummary', () => {
    it('renders zones read-only without an editor when told to', () => {
        render(<SetupSummary setup={SETUP} readOnly />)
        // Read-only is how the preview renders once the setup is generated.
        expect(screen.getByLabelText('Entry s1e1 lower edge').disabled).toBe(true)
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
        // The flat zones are the server's output. An edit written there looks accepted here and is
        // silently discarded on Generate, because normalizeSetup reads `scenarios`.
        const onChange = vi.fn()
        render(<SetupSummary setup={SETUP} onChange={onChange} />)
        fireEvent.change(screen.getByLabelText('Entry s2e1 lower edge'), { target: { value: '207' } })

        const next = onChange.mock.calls[0][0]
        expect(next.scenarios[1].entry_zones[0].lower).toBe(207)
        expect(next.scenarios[0]).toEqual(FADE, 'the rival premise is untouched')
        expect(next.entry_zones).toEqual(SETUP.entry_zones, 'the projection is the server’s to re-derive')
    })

    it('adds a second entry scenario, not another entry zone, not as another entry zone', () => {
        const onChange = vi.fn()
        render(<SetupSummary setup={{ ...SETUP, scenarios: [FADE] }} onChange={onChange} />)
        fireEvent.click(screen.getByRole('button', { name: /another scenario/ }))

        const next = onChange.mock.calls[0][0]
        expect(next.scenarios).toHaveLength(2)
        expect(next.scenarios[1].id).toBe('s2')
        expect(next.scenarios[1].entry_zones).toEqual([])
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
    it('shows the entry band instead of a count when there is one way in', () => {
        expect(setupDigest({ ...SETUP, scenarios: [FADE] })).toBe('NVDA · LONG · entry 199–201')
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
