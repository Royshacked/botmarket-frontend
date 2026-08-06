import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

import { TiltDraft } from './StrategyPanel.jsx'

afterEach(cleanup)

const row = (over = {}) => ({ sector: 'Healthcare', stance: 'over', active_bp: 150, horizon: '6m', ...over })
const draft = (over = {}) => ({
    benchmark: 'SPX',
    regime: { name: 'late-cycle disinflation', thesis: 'Growth slows.', kill_criteria: ['core CPI above 3.5% twice'] },
    tilts: [row(), row({ sector: 'Energy', stance: 'under', active_bp: -150 })],
    ...over,
})

// The DRAFT is the part specific to this panel — a proposed house view, shown before it supersedes
// the standing one. The chat shell is the shared one every desk uses.
describe('TiltDraft', () => {
    it('shows the regime and the stances it implies', () => {
        render(<TiltDraft tilt={draft()} />)
        expect(screen.getByText('late-cycle disinflation')).toBeTruthy()
        expect(screen.getByText('Growth slows.')).toBeTruthy()
        expect(screen.getByText('Healthcare')).toBeTruthy()
        expect(screen.getByText('+150bp')).toBeTruthy()
        expect(screen.getByText('-150bp')).toBeTruthy()
        expect(screen.getByText('vs SPX')).toBeTruthy()
    })

    it('surfaces the NET so an unbalanced table is caught while it is still a draft', () => {
        // A tilt table redistributes a fully-invested book, so the weights must cancel. Catching it
        // here beats reading a warning on the board after it became the house view.
        const { container } = render(<TiltDraft tilt={draft()} />)
        expect(screen.getByText('net +0bp')).toBeTruthy()
        expect(container.querySelector('.strategy-panel__net--off')).toBeNull()
    })

    it('flags a table that does not net out', () => {
        const { container } = render(<TiltDraft tilt={draft({ tilts: [row({ active_bp: 300 }), row({ sector: 'Energy', active_bp: 200 })] })} />)
        expect(screen.getByText('net +500bp')).toBeTruthy()
        expect(container.querySelector('.strategy-panel__net--off')).toBeTruthy()
    })

    it('rounding slack inside the tolerance is not flagged', () => {
        const { container } = render(<TiltDraft tilt={draft({ tilts: [row({ active_bp: 50 })] })} />)
        expect(container.querySelector('.strategy-panel__net--off')).toBeNull()
    })

    it('shows what would break the read — the falsifiers are what make it monitorable', () => {
        render(<TiltDraft tilt={draft()} />)
        expect(screen.getByText('what breaks it')).toBeTruthy()
        expect(screen.getByText('core CPI above 3.5% twice')).toBeTruthy()
    })

    it('the direction is legible before any number is parsed', () => {
        const { container } = render(<TiltDraft tilt={draft()} />)
        expect(container.querySelector('.strategy-panel__stance--over')).toBeTruthy()
        expect(container.querySelector('.strategy-panel__stance--under')).toBeTruthy()
    })

    it('a missing weight renders a dash, not a zero', () => {
        render(<TiltDraft tilt={draft({ tilts: [row({ active_bp: null })] })} />)
        expect(screen.getByText('—')).toBeTruthy()
    })

    it('a draft with no regime still renders its stances', () => {
        render(<TiltDraft tilt={draft({ regime: null })} />)
        expect(screen.getByText('House view')).toBeTruthy()
        expect(screen.getByText('Healthcare')).toBeTruthy()
    })
})
