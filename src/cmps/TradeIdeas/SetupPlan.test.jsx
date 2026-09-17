import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SetupEntry, SetupExits } from './SetupPlan.jsx'

// The plan, the way a trader reads it: Entry then Exits, every leg saying whether it RESTS at the
// broker or is WATCHED by Talos (docs/design/talos-per-candle.md).

afterEach(cleanup)

const COND = (id, text) => ({ id, text, weight: 'primary' })
const SETUP = {
    status: 'looking', timeframe: '1hr', ladder: ['4hr', '2hr', '1hr', '30min', '15min'],
    conditions: [COND('c1', 'regime is risk-on')],
    armed_scenario_id: null,
    scenarios: [{
        id: 's1', name: 'Break and go', rr: 2.4,
        entry_zones: [{ id: 'e1', lower: 238.6, upper: 238.6, quantity: 100, conditions: [] }],
        stop_zones:  [{ id: 's1z', lower: 234.8, upper: 234.8, conditions: [] }],
        tp_zones:    [
            { id: 't1', lower: 246, upper: 246, quantity: 50, conditions: [] },
            { id: 't2', lower: 252, upper: 252, quantity: 50, conditions: [COND('t2c1', 'bank it if momentum fades')] },
        ],
        conditions: [COND('s1c1', 'CHoCH up on the 15m')],
    }],
}

describe('SetupEntry', () => {
    it('shows the ladder, the always-conditions, then each way in with its trigger', () => {
        render(<SetupEntry setup={SETUP} />)
        expect(screen.getByText('4hr → 2hr → 1hr → 30min → 15min')).toBeTruthy()
        expect(screen.getByText('regime is risk-on')).toBeTruthy()
        expect(screen.getByText(/Break and go/)).toBeTruthy()
        expect(screen.getByText('238.6')).toBeTruthy()
        expect(screen.getByText('CHoCH up on the 15m')).toBeTruthy()
        // No exits here.
        expect(screen.queryByText('234.8')).toBeNull()
    })

    it('marks a filled leg once in position', () => {
        const inPos = { ...SETUP, status: 'long', armed_scenario_id: 's1', position_state: { entry: { legs: [{ zone_id: 'e1' }] } } }
        render(<SetupEntry setup={inPos} />)
        expect(screen.getByText('filled')).toBeTruthy()
    })
})

describe('SetupExits', () => {
    it('tags every exit leg rests | watched, and shows a watched leg\'s condition', () => {
        render(<SetupExits setup={SETUP} />)
        expect(screen.getByText('234.8')).toBeTruthy()
        expect(screen.getAllByText('rests')).toHaveLength(2)      // the stop and t1
        expect(screen.getAllByText('watched')).toHaveLength(1)    // t2
        expect(screen.getByText('bank it if momentum fades')).toBeTruthy()
        expect(screen.queryByText('238.6')).toBeNull()            // no entries here
    })

    it('in position, leads with the live numbers and shows only the armed premise', () => {
        const inPos = {
            ...SETUP, status: 'long', armed_scenario_id: 's1',
            scenarios: [...SETUP.scenarios, { id: 's2', name: 'Rival', entry_zones: [], stop_zones: [{ id: 'x', lower: 1, upper: 1 }], tp_zones: [] }],
            position_state: {
                entry: { fill_price: 238.7, size: 100, legs: [{ zone_id: 'e1' }] },
                stop: { initial: 234.8, current: 237 },
                metrics: { r_multiple_now: 1.2, mfe: 1.5, mae: -0.2 },
            },
        }
        render(<SetupExits setup={inPos} />)
        expect(screen.getByText('238.7')).toBeTruthy()
        expect(screen.getByText('237')).toBeTruthy()
        expect(screen.getByText('(init 234.8)')).toBeTruthy()
        expect(screen.getByText('+1.2R')).toBeTruthy()
        expect(screen.queryByText(/Rival/)).toBeNull()
    })

    it('closed, shows the outcome', () => {
        const closed = {
            ...SETUP, status: 'closed', armed_scenario_id: 's1',
            position_state: { entry: { fill_price: 238.7, size: 100 }, stop: { initial: 234.8, current: 234.8 },
                              outcome: { reason: 'target hit', r_multiple: 1.9, exit_price: 246, pnl: 730 } },
        }
        render(<SetupExits setup={closed} />)
        expect(screen.getByText('target hit')).toBeTruthy()
        expect(screen.getByText('+1.9R')).toBeTruthy()
        expect(screen.getByText('P&L 730')).toBeTruthy()
    })
})
