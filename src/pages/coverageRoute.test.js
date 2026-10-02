import { describe, it, expect } from 'vitest'
import { coverageRoute } from './coverageRoute.js'

describe('coverageRoute', () => {
    it('a verdict card with its doc runs the revise pipeline and moves nothing else', () => {
        expect(coverageRoute({ mode: 'revise', resolved: true })).toEqual({ revise: true, book: false, desk: false, detail: false })
    })

    // THE BUG (2026-09-24). Prometheus sent two cards the same morning — a verdict on CIFR and a
    // failed re-model of WIX. The user revised CIFR through the first, then pressed the second, and
    // the Analyst desk showed them CIFR's revise turn: 'open' shared the unresolved-doc fallback,
    // which switches the left column to a desk that keeps its last conversation. The read the card
    // is offering lives in the RIGHT column, so the desk must not move.
    it('an "open" ask puts the BOOK up and leaves the desk where the user left it', () => {
        expect(coverageRoute({ mode: 'open', resolved: true })).toEqual({ revise: false, book: true, desk: false, detail: false })
    })

    // The doc could not be read, so the book may not hold the name either — land on Prometheus so it
    // is one click away instead of nowhere. This is the ONLY path that moves the desk on its own.
    it('nothing resolved → the book AND the desk, whatever the ask was', () => {
        expect(coverageRoute({ mode: 'open',   resolved: false })).toEqual({ revise: false, book: true, desk: true, detail: false })
        expect(coverageRoute({ mode: 'revise', resolved: false })).toEqual({ revise: false, book: true, desk: true, detail: false })
        expect(coverageRoute({                 resolved: false })).toEqual({ revise: false, book: true, desk: true, detail: false })
    })

    // A revise needs the document; without one there is nothing to open in update mode.
    it('never claims a revise it has no doc for', () => {
        expect(coverageRoute({ mode: 'revise', resolved: false }).revise).toBe(false)
    })

    it('an unknown or missing mode behaves like a read, not a revise', () => {
        expect(coverageRoute({ resolved: true })).toEqual({ revise: false, book: true, desk: false, detail: false })
        expect(coverageRoute({ mode: 'whatever', resolved: true })).toEqual({ revise: false, book: true, desk: false, detail: false })
        expect(coverageRoute()).toEqual({ revise: false, book: true, desk: true, detail: false })
    })

    // THE BUG (2026-10-02). On a phone the Radar column is display:none, so "Open coverage" switched
    // an invisible tab and nothing appeared. A handheld read goes to the in-app detail page.
    describe('on a handheld', () => {
        it('a read with its doc opens the detail page and moves nothing behind it', () => {
            expect(coverageRoute({ mode: 'open', resolved: true, handheld: true })).toEqual({ revise: false, book: false, desk: false, detail: true })
            expect(coverageRoute({ resolved: true, handheld: true })).toEqual({ revise: false, book: false, desk: false, detail: true })
        })

        // The desk IS visible on a phone (it is the column that stays), so a revise is unchanged.
        it('a revise still runs the desk pipeline', () => {
            expect(coverageRoute({ mode: 'revise', resolved: true, handheld: true })).toEqual({ revise: true, book: false, desk: false, detail: false })
        })

        // No doc, no page to open — the desk is the visible landing, same as on a desktop.
        it('nothing resolved still lands on the desk', () => {
            expect(coverageRoute({ mode: 'open', resolved: false, handheld: true })).toEqual({ revise: false, book: true, desk: true, detail: false })
        })
    })
})
