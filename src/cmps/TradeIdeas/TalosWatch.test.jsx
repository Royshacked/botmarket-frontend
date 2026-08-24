import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { TalosWatch } from './TalosWatch.jsx'

afterEach(cleanup)

// The panel's job is to say what the monitor found. These guard the ways it could say something the
// monitor never actually said — which on this surface is worse than saying nothing.

const SETUP = {
    status: 'looking',
    timeframe: '1hr',
    conditions: [{ id: 'c1', text: 'SMH leading, not diverging', weight: 'confirming' }],
    scenarios: [{ id: 's1', conditions: [{ id: 's1c1', text: 'CHoCH up on the 15m', weight: 'primary' }] }],
    monitor_state: {
        timeline: [{ at: '2026-08-15T12:00:00Z', reason: 'scheduled', price: 241.2 }],
        pulse_anchor_px: 238.2,
        last_assessment: null,
    },
}

const withRead = (over = {}) => ({
    ...SETUP,
    monitor_state: {
        ...SETUP.monitor_state,
        last_assessment: {
            at: '2026-08-15T12:00:00Z', verdict: 'wait', scenario_id: 's1', timeframe_used: '15min',
            read: 'Semis are diverging while price taps the zone.',
            warning: 'SMH is red.',
            conditions: [{ id: 's1c1', met: 'yes', note: 'CHoCH at 10:42' }, { id: 'c1', met: 'no', note: 'QQQ red' }],
            ...over,
        },
    },
})

describe('TalosWatch', () => {
    it('shows all three tiers and marks which are live', () => {
        render(<TalosWatch setup={SETUP} />)
        expect(screen.getByText(/1\. Zone gate/)).toBeTruthy()
        expect(screen.getByText(/2\. Move watch/)).toBeTruthy()
        expect(screen.getByText(/3\. Full read/)).toBeTruthy()
        expect(screen.getByText(/outside every zone at 241\.2/)).toBeTruthy()
        expect(screen.getByText(/anchored at 238\.2/)).toBeTruthy()
    })

    it('says plainly that no read has been paid for yet', () => {
        // A setup can sit for days without needing one. That is the system working, and an empty box
        // would read as something being broken.
        render(<TalosWatch setup={SETUP} />)
        expect(screen.getByText(/No full read yet/)).toBeTruthy()
    })

    it('renders each graded condition with what Talos actually saw', () => {
        render(<TalosWatch setup={withRead()} />)
        expect(screen.getByText('CHoCH at 10:42')).toBeTruthy()
        expect(screen.getByText('QQQ red')).toBeTruthy()
        expect(screen.getByText(/SMH is red\./)).toBeTruthy()      // the warning — "what's missing"
        expect(screen.getByText(/on the 15min/)).toBeTruthy()
    })

    it("distinguishes 'could not look' from 'looked and it is not happening'", () => {
        // Same glyph family, different meaning and different action: one is a reason to wait, the
        // other a reason to go and fix the data. The tooltip carries the distinction.
        render(<TalosWatch setup={withRead({ conditions: [{ id: 's1c1', met: 'unchecked' }, { id: 'c1', met: 'no' }] })} />)
        expect(screen.getByTitle(/could NOT check/)).toBeTruthy()
        expect(screen.getByTitle(/is not happening/)).toBeTruthy()
    })

    it('flags "almost" only when every trigger is present and the answer is still no', () => {
        render(<TalosWatch setup={withRead()} />)
        expect(screen.getByText('almost')).toBeTruthy()

        cleanup()
        render(<TalosWatch setup={withRead({ conditions: [{ id: 's1c1', met: 'no' }] })} />)
        expect(screen.queryByText('almost')).toBeNull()
    })

    it('never invents a verdict — "almost" annotates one, it does not replace it', () => {
        // The server's menu has no "almost"; anything off-menu is coerced to `wait` there. So the
        // real verdict must stay on screen next to it.
        render(<TalosWatch setup={withRead()} />)
        expect(screen.getByText('wait')).toBeTruthy()
    })
})
