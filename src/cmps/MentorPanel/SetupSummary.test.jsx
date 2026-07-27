import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { CoverageChips } from './CoverageChips.jsx'
import { ZoneEditor } from './ZoneEditor.jsx'
import { SetupSummary } from './SetupSummary.jsx'

afterEach(cleanup)

const SETUP = {
    asset: 'NVDA', direction: 'long', type: 'swing', trade_mode: 'smc', timeframe: '4hr',
    thesis: 'Sweep of the 199 shelf that fails and reclaims.',
    watch: [
        { kind: 'structure', look_for: 'CHoCH up on the 1hr after the sweep', timeframe: '1hr', weight: 'primary' },
        { kind: 'correlation', look_for: 'SMH leading, not diverging', symbols: ['SMH'], weight: 'confirming' },
    ],
    entry_zones: [{ id: 'ez1', lower: 199, upper: 201, quantity: 110 }],
    stop_zones:  [{ id: 'sz1', lower: 196.5, upper: 197.9, quantity: 110 }],
    tp_zones:    [{ id: 'tp1', lower: 210.5, upper: 211, quantity: 55 },
                  { id: 'tp2', lower: 213.4, upper: 214, quantity: 55 }],
    conviction: { level: 'medium', rationale: 'fresh OB, but earnings in 4 weeks' },
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
        render(<ZoneEditor setup={SETUP} onChange={() => {}} />)
        expect(screen.getByLabelText('Entry ez1 lower edge').value).toBe('199')
        expect(screen.getByLabelText('Stop sz1 upper edge').value).toBe('197.9')
        expect(screen.getByLabelText('Target tp2 quantity').value).toBe('55')
    })

    it('totals each group separately so a mis-split across legs is visible', () => {
        // Deliberately mis-split: 110 in, but only 80 planned out.
        const misSplit = { ...SETUP, tp_zones: [{ id: 'tp1', lower: 210, upper: 211, quantity: 40 },
                                                { id: 'tp2', lower: 213, upper: 214, quantity: 40 }] }
        render(<ZoneEditor setup={misSplit} onChange={() => {}} />)

        const total = (label) => within(screen.getByText(label).closest('section')).getByText(/^\d+$/).textContent
        expect(total('Entry')).toBe('110')
        expect(total('Target')).toBe('80')   // visibly short of the entry size
    })

    it('edits an edge through onChange without mutating the original', () => {
        const onChange = vi.fn()
        render(<ZoneEditor setup={SETUP} onChange={onChange} />)
        fireEvent.change(screen.getByLabelText('Entry ez1 lower edge'), { target: { value: '198' } })

        expect(onChange).toHaveBeenCalledTimes(1)
        expect(onChange.mock.calls[0][0].entry_zones[0].lower).toBe(198)
        expect(SETUP.entry_zones[0].lower).toBe(199)   // the prop object is untouched
    })

    it('SORTS inverted edges on blur rather than rejecting them', () => {
        // The user is typing two numbers; which lands first is not worth an error state.
        const inverted = { ...SETUP, entry_zones: [{ id: 'ez1', lower: 205, upper: 201, quantity: 10 }] }
        const onChange = vi.fn()
        render(<ZoneEditor setup={inverted} onChange={onChange} />)
        fireEvent.blur(screen.getByLabelText('Entry ez1 lower edge'))

        const zone = onChange.mock.calls[0][0].entry_zones[0]
        expect([zone.lower, zone.upper]).toEqual([201, 205])
    })

    it('leaves a correctly ordered zone alone on blur', () => {
        const onChange = vi.fn()
        render(<ZoneEditor setup={SETUP} onChange={onChange} />)
        fireEvent.blur(screen.getByLabelText('Entry ez1 lower edge'))
        expect(onChange.mock.calls[0][0].entry_zones[0]).toEqual(SETUP.entry_zones[0])
    })

    it('flags a zero-width band as an exact level, not an error', () => {
        const exact = { ...SETUP, stop_zones: [{ id: 'sz1', lower: 197, upper: 197, quantity: 110 }] }
        render(<ZoneEditor setup={exact} onChange={() => {}} />)
        expect(screen.getByText('exact')).toBeTruthy()
    })

    it('adds and removes zones', () => {
        const onChange = vi.fn()
        render(<ZoneEditor setup={SETUP} onChange={onChange} />)

        fireEvent.click(screen.getByTitle('Add a entry zone'))
        expect(onChange.mock.calls[0][0].entry_zones).toHaveLength(2)
        expect(onChange.mock.calls[0][0].entry_zones[1].id).toBe('ez2')

        fireEvent.click(screen.getByLabelText('Remove tp1'))
        expect(onChange.mock.calls[1][0].tp_zones.map(z => z.id)).toEqual(['tp2'])
    })

    it('hides the editing affordances when read-only', () => {
        render(<ZoneEditor setup={SETUP} readOnly />)
        expect(screen.queryByTitle('Add a entry zone')).toBeNull()
        expect(screen.getByLabelText('Entry ez1 lower edge').disabled).toBe(true)
    })

    it('renders nothing for a missing setup', () => {
        const { container } = render(<ZoneEditor setup={null} />)
        expect(container.firstChild).toBeNull()
    })
})

describe('SetupSummary', () => {
    it('renders zones read-only without an editor when told to', () => {
        render(<SetupSummary setup={SETUP} readOnly />)
        // Read-only is how the preview renders once the setup is generated.
        expect(screen.getByLabelText('Entry ez1 lower edge').disabled).toBe(true)
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

    it('lists what Talos will actually check, so the monitoring cost is visible', () => {
        render(<SetupSummary setup={SETUP} />)
        const watch = screen.getByText('Talos watches').closest('section')
        expect(within(watch).getByText(/CHoCH up on the 1hr/)).toBeTruthy()
        expect(within(watch).getByText(/SMH leading/)).toBeTruthy()
        // A correlation factor must show WHICH symbols get fetched.
        expect(within(watch).getByText(/SMH$/)).toBeTruthy()
    })

    it('flags a thin R:R rather than showing it as a neutral number', () => {
        render(<SetupSummary setup={{ ...SETUP, rr: 1.1 }} />)
        expect(screen.getByText('1.1').className).toMatch(/is-thin/)
    })

    it('does not flag a healthy R:R', () => {
        render(<SetupSummary setup={SETUP} />)
        expect(screen.getByText('2.11').className).not.toMatch(/is-thin/)
    })



    it('surfaces stamped event risk, which is checked whether or not news was declared', () => {
        const withEvents = { ...SETUP, event_risk: [{ date: '2026-07-29', label: 'FOMC Rate Decision' }] }
        render(<SetupSummary setup={withEvents} />)
        expect(screen.getByText(/FOMC Rate Decision/)).toBeTruthy()
    })

})
