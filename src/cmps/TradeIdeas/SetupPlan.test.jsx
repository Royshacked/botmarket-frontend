import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SetupScenarios } from './SetupPlan.jsx'
import { planTail } from './setupPlan.utils.js'

// The plan: one block per way in — entry, trigger, stop, targets — every leg saying whether it
// RESTS at the broker or is WATCHED by Talos (docs/design/talos-per-candle.md).

afterEach(cleanup)

const COND = (id, text) => ({ id, text, weight: 'primary' })
const SETUP = {
    status: 'looking', timeframe: '1hr', ladder: ['4hr', '2hr', '1hr', '30min', '15min'],
    conditions: [COND('c1', 'regime is risk-on')],
    armed_scenario_id: null,
    scenarios: [{
        id: 's1', name: 'Break and go', rr: 2.4,
        entry_legs: [{ id: 'e1', price: 238.6, quantity: 100, conditions: [] }],
        stop_legs:  [{ id: 's1z', price: 234.8, conditions: [] }],
        target_legs:    [
            { id: 't1', price: 246, quantity: 50, conditions: [] },
            { id: 't2', price: 252, quantity: 50, conditions: [COND('t2c1', 'bank it if momentum fades')] },
        ],
        conditions: [COND('s1c1', 'CHoCH up on the 15m')],
    }],
}

describe('SetupScenarios', () => {
    it('shows the ladder, the always-conditions, then each way in: entry, trigger, stop, targets', () => {
        render(<SetupScenarios setup={SETUP} />)
        expect(screen.getByText('4hr → 2hr → 1hr → 30min → 15min')).toBeTruthy()
        expect(screen.getByText('regime is risk-on')).toBeTruthy()
        expect(screen.getByText(/Break and go/)).toBeTruthy()
        expect(screen.getByText('238.6')).toBeTruthy()
        expect(screen.getByText('CHoCH up on the 15m')).toBeTruthy()
        expect(screen.getByText('234.8')).toBeTruthy()
        // The scenario heading appears ONCE — entry and exits are one block, not two walks.
        expect(screen.getAllByText(/Break and go/)).toHaveLength(1)
    })

    it("tags every leg rests | watched, and shows a watched leg's condition", () => {
        render(<SetupScenarios setup={SETUP} />)
        expect(screen.getAllByText('rests')).toHaveLength(3)      // entry, stop, t1
        expect(screen.getAllByText('watched')).toHaveLength(1)    // t2
        expect(screen.getByText('bank it if momentum fades')).toBeTruthy()
    })

    it('in position, leads with the live numbers, marks the filled leg and shows only the armed premise', () => {
        const inPos = {
            ...SETUP, status: 'long', armed_scenario_id: 's1',
            scenarios: [...SETUP.scenarios, { id: 's2', name: 'Rival', entry_legs: [], stop_legs: [{ id: 'x', price: 1 }], target_legs: [] }],
            position_state: {
                entry: { fill_price: 238.7, size: 100, legs: [{ leg_id: 'e1' }] },
                stop: { initial: 234.8, current: 237 },
                metrics: { r_multiple_now: 1.2, mfe: 1.5, mae: -0.2 },
            },
        }
        render(<SetupScenarios setup={inPos} />)
        expect(screen.getByText('238.7')).toBeTruthy()
        expect(screen.getByText('237')).toBeTruthy()
        expect(screen.getByText('(init 234.8)')).toBeTruthy()
        expect(screen.getByText('+1.2R')).toBeTruthy()
        expect(screen.getByText('filled')).toBeTruthy()
        expect(screen.queryByText(/Rival/)).toBeNull()
    })

    it('closed, shows the outcome', () => {
        const closed = {
            ...SETUP, status: 'closed', armed_scenario_id: 's1',
            position_state: { entry: { fill_price: 238.7, size: 100 }, stop: { initial: 234.8, current: 234.8 },
                              outcome: { reason: 'target hit', r_multiple: 1.9, exit_price: 246, pnl: 730 } },
        }
        render(<SetupScenarios setup={closed} />)
        expect(screen.getByText('target hit')).toBeTruthy()
        expect(screen.getByText('+1.9R')).toBeTruthy()
        expect(screen.getByText('P&L 730')).toBeTruthy()
    })
})

describe('planTail — the plan in one line when the section is folded', () => {
    it('one way in: its levels and R', () => {
        expect(planTail(SETUP)).toBe('entry 238.6 · stop 234.8 · target 246, 252 · 2.4R')
    })

    it('several ways in: the count, and which one armed', () => {
        const two = { ...SETUP, scenarios: [...SETUP.scenarios, { id: 's2', name: 'Fade it' }] }
        expect(planTail(two)).toBe('2 ways in')
        expect(planTail({ ...two, armed_scenario_id: 's2' })).toBe('2 ways in · armed: Fade it')
    })

    it('in position: the live numbers; closed: the outcome', () => {
        const ps = { entry: { fill_price: 238.7 }, stop: { current: 237 }, metrics: { r_multiple_now: 1.2 } }
        expect(planTail({ ...SETUP, status: 'long', position_state: ps })).toBe('in @ 238.7 · stop 237 · +1.2R')
        expect(planTail({ ...SETUP, status: 'closed', position_state: { ...ps, outcome: { reason: 'target hit', r_multiple: 1.9 } } })).toBe('target hit · +1.9R')
    })

    it('a plan with nothing drawn says so', () => {
        expect(planTail({ status: 'waiting', scenarios: [] })).toBe('no scenarios')
    })
})
