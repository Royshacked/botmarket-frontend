import { describe, it, expect } from 'vitest'
import { actionLine, originLine, actionVerb, executeRoute, confirmCopy, EXECUTE_ERRORS } from './queuedAction.contract.js'
import { ENTRY_CONFIRM_OPEN, SETUP_CONFIRM_OPEN, CALL_CONFIRM_OPEN } from '../../services/event-bus.service'

// The per-type judgment behind the queued list. The list itself is blind: it renders rows and
// offers two buttons, and everything that differs between "enter NVDA" and "trim 30% of MU" —
// which are different asks with different destinations, not variants of one sentence — lives here.

const queueRow = (over = {}) => ({
    id: 'q1', source: 'queue', ready: true, asset: 'MU', direction: 'long',
    action: { type: 'trim', reduceFraction: 0.3 },
    origin: { kind: 'portfolio_item', entityId: 'h1', label: 'Growth review' },
    ...over,
})
const entityRow = (over = {}) => ({
    id: 'e1', source: 'entity', ready: true, asset: 'NVDA',
    action: { type: 'entry' },
    origin: { kind: 'idea', entityId: 'e1', label: null },
    ...over,
})

describe('actionLine', () => {
    it('says what will HAPPEN, not what kind of record it is', () => {
        expect(actionLine(queueRow())).toBe('Trim 30% of MU')
        expect(actionLine(queueRow({ action: { type: 'exit' } }))).toBe('Close all of MU')
        expect(actionLine(queueRow({ action: { type: 'add_to', addFraction: 0.25 } }))).toBe('Add 25% to MU')
        expect(actionLine(entityRow())).toBe('Enter NVDA')
    })

    it('trailing zeros are dropped, awkward fractions are not', () => {
        expect(actionLine(queueRow({ action: { type: 'trim', reduceFraction: 0.5 } }))).toMatch('50%')
        expect(actionLine(queueRow({ action: { type: 'trim', reduceFraction: 0.125 } }))).toMatch('12.5%')
    })

    it('a missing or nonsense fraction degrades to the verb, never "NaN%"', () => {
        expect(actionLine(queueRow({ action: { type: 'trim' } }))).toBe('Trim MU')
        expect(actionLine(queueRow({ action: { type: 'add_to', addFraction: 0 } }))).toBe('Add to MU')
        expect(actionLine({})).toMatch('—')
    })
})

describe('originLine', () => {
    it('carries the label stamped when the decision was taken', () => {
        // Stamped at enqueue on purpose: by the open, the review that decided it is closed.
        expect(originLine(queueRow())).toBe('Growth review')
        expect(originLine(entityRow())).toBe('')
    })
})

describe('executeRoute', () => {
    it('an ENTRY is handed to the surface that already confirms entries', () => {
        // Not re-implemented here: that dialog owns levels, size, risk and per-account scaling, and
        // a second way to place the same order is how two paths drift apart.
        expect(executeRoute(entityRow())).toEqual({ kind: 'event', event: ENTRY_CONFIRM_OPEN, payload: { ideaId: 'e1' } })
        expect(executeRoute(entityRow({ origin: { kind: 'portfolio_item', entityId: 'h9' } })))
            .toEqual({ kind: 'event', event: ENTRY_CONFIRM_OPEN, payload: { ideaId: 'h9' } })
    })

    it('a call and a setup route to their own confirm surfaces', () => {
        expect(executeRoute(entityRow({ origin: { kind: 'call', entityId: 'c1' } })))
            .toEqual({ kind: 'event', event: CALL_CONFIRM_OPEN, payload: { callId: 'c1' } })
        expect(executeRoute(entityRow({ origin: { kind: 'setup', entityId: 's1' } })))
            .toEqual({ kind: 'event', event: SETUP_CONFIRM_OPEN, payload: { setupId: 's1' } })
    })

    it('a QUEUED action gets the queue\'s own confirm — there is nothing left to fill in', () => {
        expect(executeRoute(queueRow()).kind).toBe('confirm')
        expect(executeRoute(queueRow({ action: { type: 'exit' } })).kind).toBe('confirm')
    })

    it('an origin the client cannot route says so rather than guessing', () => {
        expect(executeRoute(entityRow({ origin: { kind: 'weather_desk', entityId: 'x' } })).kind).toBe('none')
    })
})

describe('confirmCopy', () => {
    it('each verb gets its own sentence, and names where it came from', () => {
        expect(confirmCopy(queueRow()).title).toBe('Trim position')
        expect(confirmCopy(queueRow()).body).toMatch(/Reduce your MU position by 30%/)
        expect(confirmCopy(queueRow()).body).toMatch(/Growth review/)
        expect(confirmCopy(queueRow()).cta).toBe('Trim now')

        expect(confirmCopy(queueRow({ action: { type: 'exit' } })).title).toBe('Close position')
        expect(confirmCopy(queueRow({ action: { type: 'add_to', addFraction: 0.4 } })).cta).toBe('Add now')
    })

    it('every verb says it was decided while the market was shut', () => {
        // The one thing the user needs to re-judge: it was decided against a stale price.
        for (const type of ['exit', 'trim', 'add_to']) {
            expect(confirmCopy(queueRow({ action: { type, reduceFraction: 0.3, addFraction: 0.3 } })).body)
                .toMatch(/while the market was shut/)
        }
    })

    it('an unstamped origin does not leave a dangling dash', () => {
        const body = confirmCopy(queueRow({ origin: { kind: 'portfolio_item', entityId: 'h1' } })).body
        expect(body).not.toMatch(/—\s*\./)
    })
})

describe('actionVerb + errors', () => {
    it('the button says what it does', () => {
        expect(actionVerb(queueRow())).toBe('Trim')
        expect(actionVerb(entityRow())).toBe('Enter')
        expect(actionVerb({})).toBe('Execute')
    })

    it('the refusals a user can actually hit are in words', () => {
        expect(EXECUTE_ERRORS.add_too_small).toMatch(/rounds down to zero/)
        expect(EXECUTE_ERRORS.market_closed).toMatch(/stays queued/)
        expect(EXECUTE_ERRORS.not_ready).toBeTruthy()
    })
})

// ── Phase 4: monitor exits in the list ───────────────────────────────────────
// A stop that tripped overnight sits in the same list as a review's trim, and reads differently on
// purpose: it can be a SLICE, and it is not the user's to cancel.
describe('a monitor exit', () => {
    const stopRow = (over = {}) => ({
        id: 'q9', source: 'queue', ready: true, asset: 'MU', cancellable: false, queuedBy: 'monitor',
        action: { type: 'exit', reason: 'tp', quantity: 3, leg: 'tp', tag: 'tp1' },
        origin: { kind: 'portfolio_item', entityId: 'h1', label: 'Target hit' },
        ...over,
    })

    it('a SLICE says how much, not "all"', () => {
        // A scaled target closes part of the position and leaves the rest running. "Close all of
        // MU" over that is the difference between a row you trust and one you go and verify.
        expect(actionLine(stopRow())).toBe('Close 3 of MU')
        expect(confirmCopy(stopRow()).title).toBe('Close part of the position')
        expect(confirmCopy(stopRow()).body).toMatch(/Close 3 of your MU position/)
    })

    it('a full stop-out still reads as the whole position', () => {
        const full = stopRow({ action: { type: 'exit', reason: 'stop', quantity: null } })
        expect(actionLine(full)).toBe('Close all of MU')
        expect(confirmCopy(full).title).toBe('Close position')
    })

    it('carries the reason as its origin line, because that IS the whole story', () => {
        expect(originLine(stopRow())).toBe('Target hit')
    })

    it('still routes to the queue\'s own confirm, like every other queued action', () => {
        expect(executeRoute(stopRow()).kind).toBe('confirm')
    })
})

// A management proposal the user accepted after the close — a stop move, a partial, getting flat.
// Every one of these says its LEVEL back, because the card that proposed it is long gone by the
// open and the number is the part they actually decided.
describe('an accepted management action', () => {
    const row = (action, over = {}) => ({
        id: 'q7', source: 'queue', ready: true, asset: 'NVDA', cancellable: true, queuedBy: 'user',
        origin: { kind: 'setup', entityId: 'setup_1', label: 'Talos: pressing the stop' },
        action, ...over,
    })

    it('names the level on a stop move, on the row AND in the confirm', () => {
        const r = row({ type: 'move_stop', proposal: { new_stop: 238.6, ref: 'breakeven' } })
        expect(actionLine(r)).toBe('Move the NVDA stop to 238.6')
        expect(actionVerb(r)).toBe('Move stop')
        expect(confirmCopy(r).body).toMatch(/238\.6/)
        expect(confirmCopy(r).body).toMatch(/breakeven/)
    })

    it('says the size on a partial, rounded to something a person would say', () => {
        const r = row({ type: 'take_partial', proposal: { size_pct: 33.33 } })
        expect(actionLine(r)).toBe('Bank 33.3% of NVDA')
        expect(confirmCopy(r).cta).toBe('Bank it now')
    })

    it('is blunt about getting flat', () => {
        const r = row({ type: 'exit_now', proposal: {} })
        expect(actionLine(r)).toBe('Get flat on NVDA')
        expect(confirmCopy(r).title).toBe('Get flat')
    })

    it('tells a target MOVE from a target CANCEL — they are opposite intents', () => {
        const moved = row({ type: 'let_run', proposal: { new_tp: 262 } })
        expect(actionLine(moved)).toBe('Move the NVDA target to 262')

        const gone = row({ type: 'let_run', proposal: { cancel_tp: true } })
        expect(actionLine(gone)).toBe('Cancel the NVDA target')
        expect(confirmCopy(gone).title).toBe('Cancel the target')
    })

    it('degrades to a readable line when the level is missing, never to "undefined"', () => {
        const r = row({ type: 'move_stop', proposal: {} })
        expect(actionLine(r)).toBe('Move the NVDA stop')
        expect(confirmCopy(r).body).not.toMatch(/undefined/)
    })

    it('routes to the queue\'s own confirm — the decision is made, there is nothing to fill in', () => {
        expect(executeRoute(row({ type: 'exit_now' })).kind).toBe('confirm')
    })
})
