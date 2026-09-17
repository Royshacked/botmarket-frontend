import { describe, it, expect } from 'vitest'
import { MANAGE_LABEL, canAcceptManage, manageVerb, manageProposalLine } from './setupManage.js'

// Talos's in-position verdict vocabulary, as the client speaks it. The point of pinning it: the
// server refuses what is not on the menu, and the client must never offer a button that leads there.

describe('canAcceptManage', () => {
    it('accepts exactly the verbs the server executes', () => {
        for (const v of Object.keys(MANAGE_LABEL)) expect(canAcceptManage(v)).toBe(true)
        expect(Object.keys(MANAGE_LABEL).sort()).toEqual(['exit_now', 'move_stop', 'take_partial'])
    })

    it('offers no accept for add_leg — that leg is placed by confirming its order', () => {
        expect(canAcceptManage('add_leg')).toBe(false)
    })

    it('let_run is not a verb any more — moving a target out is an edit of the plan', () => {
        expect(canAcceptManage('let_run')).toBe(false)
    })

    it('is safe on a missing / unknown verdict', () => {
        expect(canAcceptManage(undefined)).toBe(false)
        expect(canAcceptManage('yolo')).toBe(false)
    })
})

describe('manageVerb', () => {
    it('speaks the card phrasing, and falls back to the raw verdict', () => {
        expect(manageVerb('move_stop')).toBe('move the stop')
        expect(manageVerb('take_partial')).toBe('take a partial')
        expect(manageVerb('something')).toBe('something')
    })
})

describe('manageProposalLine', () => {
    it('reads a stop move in TALOS\'s vocabulary (stop + why)', () => {
        expect(manageProposalLine('move_stop', { stop: 238.6, why: 'breakeven' })).toBe('New stop 238.6 (breakeven)')
    })

    it('still renders a proposal written in the shared dialect (new_stop)', () => {
        expect(manageProposalLine('move_stop', { new_stop: 240 })).toBe('New stop 240')
    })

    it('names the watched leg\'s own size for a partial, and says why it is being offered', () => {
        expect(manageProposalLine('take_partial', { leg: 't2', quantity: 50, size_pct: 50 })).toMatch(/Bank 50/)
        expect(manageProposalLine('take_partial', { leg: 't2' })).toMatch(/the watched leg/)
    })

    it('says where an add_leg is actually taken', () => {
        expect(manageProposalLine('add_leg', null)).toMatch(/confirm its order/)
    })

    it('has a line for exit_now even with no proposal fields', () => {
        expect(manageProposalLine('exit_now', {})).toBe('Flatten the position now')
        expect(manageProposalLine('exit_now', null)).toBe(null)
    })

    it('returns null for an unknown verdict rather than inventing copy', () => {
        expect(manageProposalLine('yolo', { stop: 1 })).toBe(null)
    })
})
