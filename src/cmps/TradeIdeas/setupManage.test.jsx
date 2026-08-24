import { describe, it, expect } from 'vitest'
import { MANAGE_LABEL, canAcceptManage, manageVerb, manageProposalLine } from './setupManage.js'

// The client half of "what can a user actually do with a Talos verdict". It has to agree with
// talos.handoff.service on the backend: SETUP_MANAGE_VERBS there is move_stop | take_partial |
// exit_now | let_run, add_leg answers `confirm_order`, and a let_run with no level answers
// `bad_proposal`.
describe('canAcceptManage', () => {
    it('accepts exactly the verbs the server executes', () => {
        expect(Object.keys(MANAGE_LABEL).sort()).toEqual(['exit_now', 'let_run', 'move_stop', 'take_partial'])
        for (const v of ['move_stop', 'take_partial', 'exit_now']) expect(canAcceptManage(v)).toBe(true)
    })

    it('offers no accept for add_leg — that leg is placed by confirming its order', () => {
        expect(canAcceptManage('add_leg')).toBe(false)
    })

    it('offers no accept for a BARE let_run — a decision not to act has nothing to execute', () => {
        expect(canAcceptManage('let_run')).toBe(false)
        expect(canAcceptManage('let_run', { why: 'trend intact' })).toBe(false)
    })

    it('DOES offer an accept for a let_run that moves the target — that is an amend', () => {
        // The same word covers "I am deliberately not trimming" and "there is more in this than we
        // planned, move the target out to X". Only the proposal tells them apart.
        expect(canAcceptManage('let_run', { new_tp: 262 })).toBe(true)
        expect(canAcceptManage('let_run', { tp: 262 })).toBe(true)
        expect(canAcceptManage('let_run', { cancel_tp: true })).toBe(true)
        expect(canAcceptManage('let_run', { new_tp: 'higher' })).toBe(false)
    })

    it('is safe on a missing / unknown verdict', () => {
        expect(canAcceptManage(undefined)).toBe(false)
        expect(canAcceptManage('scale_in')).toBe(false)
        // Not fooled by inherited Object properties — hasOwn, not `in`.
        expect(canAcceptManage('toString')).toBe(false)
    })
})

describe('manageVerb', () => {
    it('speaks the card phrasing, and falls back to the raw verdict', () => {
        expect(manageVerb('move_stop')).toBe('move the stop')
        expect(manageVerb('add_leg')).toBe('add the planned leg')
        expect(manageVerb('scale_in')).toBe('scale_in')
    })
})

describe('manageProposalLine', () => {
    it('reads a stop move in TALOS\'s vocabulary (stop + why)', () => {
        expect(manageProposalLine('move_stop', { stop: 118, why: 'structure defended' }))
            .toBe('New stop 118 (structure defended)')
    })

    it('still renders a proposal written in the shared dialect (new_stop)', () => {
        expect(manageProposalLine('move_stop', { new_stop: 120 })).toBe('New stop 120')
    })

    it('turns a fraction word into English, and tolerates an unknown one', () => {
        expect(manageProposalLine('take_partial', { fraction: 'two_thirds' })).toBe('Bank two thirds of the position')
        expect(manageProposalLine('take_partial', { fraction: 'most' })).toBe('Bank part of the position')
    })

    it('says where an add_leg is actually taken', () => {
        expect(manageProposalLine('add_leg', null)).toMatch(/confirm its order/)
    })

    it('has a line for let_run and exit_now even with no proposal', () => {
        expect(manageProposalLine('let_run', null)).toMatch(/rather than trimming/)
        expect(manageProposalLine('exit_now', {})).toMatch(/Flatten/)
    })

    it('names the new level when a let_run is moving the target', () => {
        expect(manageProposalLine('let_run', { tp: 262, why: 'measured move' }))
            .toBe('Move the target out to 262 (measured move)')
        expect(manageProposalLine('let_run', { cancel_tp: true })).toMatch(/uncapped/)
    })

    it('returns null for an unknown verdict rather than inventing copy', () => {
        expect(manageProposalLine('scale_in', { stop: 1 })).toBe(null)
    })
})
