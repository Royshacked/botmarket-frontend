import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SetupCard } from './SetupCard.jsx'
import { SetupScenarios } from './SetupPlan.jsx'
import { planTail, entryText, fmtEntry } from './setupPlan.utils.js'
import { statusCopy } from './setupStatus.js'
import { fmtEntryLeg } from '../MentorPanel/ScenarioBlock.jsx'

// Driven live (2026-10-01): a setup whose entry is a TRIGGER — "a 15-minute support reclaim",
// filled at market — was saved, and the Lists card read "ARMED · in null". Two defects: the card
// formatted the entry as a price only, and its status words predated the shared ladder, so a setup
// saved explicitly NOT monitored said "Armed".

afterEach(cleanup)

const TRIGGER = { id: 'e1', trigger: 'a 15m close back above 116.50 after the pullback', timeframe: '15min', about: 117.2, quantity: 200, conditions: [] }
const SETUP = {
    id: 'setup_INTC_1', asset: 'INTC', direction: 'long', type: 'swing', trade_mode: 'discretionary', status: 'waiting',
    entry_legs: [TRIGGER], stop_legs: [{ id: 's1', price: 111.5 }], target_legs: [{ id: 't1', price: 127.44 }],
    scenarios: [{ id: 's1', name: 'Support reclaim', entry_legs: [TRIGGER], stop_legs: [{ id: 's1z', price: 111.5, conditions: [] }], target_legs: [{ id: 't1', price: 127.44, conditions: [] }], conditions: [] }],
}

describe('a trigger entry reads as a trigger on every surface', () => {
    it('one reading of an entry: its price, or the trigger with its rough fill', () => {
        expect(entryText({ price: 238.6 })).toBe('238.6')
        expect(entryText(TRIGGER)).toBe('~117.2 on trigger')
        expect(entryText({ trigger: 'RSI back above 30' })).toBe('on trigger')
        expect(entryText({})).toBeNull()
        expect(fmtEntry({})).toBe('—')
        // The Mentor panel reads the same function, so the two cannot disagree.
        expect(fmtEntryLeg).toBe(entryText)
    })

    it('the Lists card never prints "in null"', () => {
        render(<SetupCard setup={SETUP} onArm={vi.fn()} onDelete={vi.fn()} />)
        const body = document.body.textContent
        expect(body).toMatch(/in ~117\.2 on trigger · stop 111\.5 · target 127\.44/)
        expect(body).not.toMatch(/null/)
    })

    it('the plan pop-out shows the trigger on the entry row, and its one-line gist says so too', () => {
        render(<SetupScenarios setup={{ ...SETUP, ladder: ['15min'], conditions: [] }} />)
        expect(screen.getByText('~117.2 on trigger')).toBeTruthy()
        expect(planTail(SETUP)).toMatch(/^entry ~117\.2 on trigger · stop 111\.5 · target 127\.44/)
    })
})

describe('the card\'s status words follow the shared ladder', () => {
    it('a GENERATED setup says it is not watched — never "Armed"', () => {
        expect(statusCopy({ status: 'waiting' }).label).toBe('Not watched')
        render(<SetupCard setup={SETUP} onArm={vi.fn()} onDelete={vi.fn()} />)
        expect(screen.getByText('Not watched')).toBeTruthy()
        expect(screen.queryByText('Armed')).toBeNull()
    })

    it('an armed setup says so, and every status on the ladder has its words', () => {
        expect(statusCopy({ status: 'looking' }).label).toBe('Armed')
        for (const status of ['waiting', 'looking', 'hit', 'long', 'short', 'closed']) {
            expect(statusCopy({ status }).label).not.toBe(status)
        }
    })

    it('hit is two moments — awaiting the user, or at the broker', () => {
        expect(statusCopy({ status: 'hit' }).label).toBe('Ready')
        expect(statusCopy({ status: 'hit', ordersPlacedAt: 1790000000000 }).label).toBe('Placed')
    })
})
