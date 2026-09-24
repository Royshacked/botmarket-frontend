import { describe, it, expect } from 'vitest'
import { coverageRoute } from './coverageRoute.js'

describe('coverageRoute', () => {
    it('a verdict card with its doc runs the revise pipeline and moves nothing else', () => {
        expect(coverageRoute({ mode: 'revise', resolved: true })).toEqual({ revise: true, book: false, desk: false })
    })

    // THE BUG (2026-09-24). Prometheus sent two cards the same morning — a verdict on CIFR and a
    // failed re-model of WIX. The user revised CIFR through the first, then pressed the second, and
    // the Analyst desk showed them CIFR's revise turn: 'open' shared the unresolved-doc fallback,
    // which switches the left column to a desk that keeps its last conversation. The read the card
    // is offering lives in the RIGHT column, so the desk must not move.
    it('an "open" ask puts the BOOK up and leaves the desk where the user left it', () => {
        expect(coverageRoute({ mode: 'open', resolved: true })).toEqual({ revise: false, book: true, desk: false })
    })

    // The doc could not be read, so the book may not hold the name either — land on Prometheus so it
    // is one click away instead of nowhere. This is the ONLY path that moves the desk on its own.
    it('nothing resolved → the book AND the desk, whatever the ask was', () => {
        expect(coverageRoute({ mode: 'open',   resolved: false })).toEqual({ revise: false, book: true, desk: true })
        expect(coverageRoute({ mode: 'revise', resolved: false })).toEqual({ revise: false, book: true, desk: true })
        expect(coverageRoute({                 resolved: false })).toEqual({ revise: false, book: true, desk: true })
    })

    // A revise needs the document; without one there is nothing to open in update mode.
    it('never claims a revise it has no doc for', () => {
        expect(coverageRoute({ mode: 'revise', resolved: false }).revise).toBe(false)
    })

    it('an unknown or missing mode behaves like a read, not a revise', () => {
        expect(coverageRoute({ resolved: true })).toEqual({ revise: false, book: true, desk: false })
        expect(coverageRoute({ mode: 'whatever', resolved: true })).toEqual({ revise: false, book: true, desk: false })
        expect(coverageRoute()).toEqual({ revise: false, book: true, desk: true })
    })
})
