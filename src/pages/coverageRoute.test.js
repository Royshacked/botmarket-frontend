// A pure function, so node:test, like every *.test.js here (vite.config.js: the two runners split by
// extension). It was written against vitest's API under a .test.js name, so node crashed loading it
// and vitest never collected it — since 2026-10-02 none of these cases ran (fixed 2026-10-14).
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { coverageRoute } from './coverageRoute.js'

describe('coverageRoute', () => {
    it('a verdict card with its doc runs the revise pipeline and moves nothing else', () => {
        assert.deepEqual(coverageRoute({ mode: 'revise', resolved: true }), { revise: true, book: false, desk: false, detail: false })
    })

    // THE BUG (2026-09-24). Prometheus sent two cards the same morning — a verdict on CIFR and a
    // failed re-model of WIX. The user revised CIFR through the first, then pressed the second, and
    // the Analyst desk showed them CIFR's revise turn: 'open' shared the unresolved-doc fallback,
    // which switches the left column to a desk that keeps its last conversation. The read the card
    // is offering lives in the RIGHT column, so the desk must not move.
    it('an "open" ask puts the BOOK up and leaves the desk where the user left it', () => {
        assert.deepEqual(coverageRoute({ mode: 'open', resolved: true }), { revise: false, book: true, desk: false, detail: false })
    })

    // The doc could not be read, so the book may not hold the name either — land on Prometheus so it
    // is one click away instead of nowhere. This is the ONLY path that moves the desk on its own.
    it('nothing resolved → the book AND the desk, whatever the ask was', () => {
        assert.deepEqual(coverageRoute({ mode: 'open',   resolved: false }), { revise: false, book: true, desk: true, detail: false })
        assert.deepEqual(coverageRoute({ mode: 'revise', resolved: false }), { revise: false, book: true, desk: true, detail: false })
        assert.deepEqual(coverageRoute({                 resolved: false }), { revise: false, book: true, desk: true, detail: false })
    })

    // A revise needs the document; without one there is nothing to open in update mode.
    it('never claims a revise it has no doc for', () => {
        assert.equal(coverageRoute({ mode: 'revise', resolved: false }).revise, false)
    })

    it('an unknown or missing mode behaves like a read, not a revise', () => {
        assert.deepEqual(coverageRoute({ resolved: true }), { revise: false, book: true, desk: false, detail: false })
        assert.deepEqual(coverageRoute({ mode: 'whatever', resolved: true }), { revise: false, book: true, desk: false, detail: false })
        assert.deepEqual(coverageRoute(), { revise: false, book: true, desk: true, detail: false })
    })

    // THE BUG (2026-10-02). On a phone the Radar column is display:none, so "Open coverage" switched
    // an invisible tab and nothing appeared. A handheld read goes to the in-app detail page.
    describe('on a handheld', () => {
        it('a read with its doc opens the detail page and moves nothing behind it', () => {
            assert.deepEqual(coverageRoute({ mode: 'open', resolved: true, handheld: true }), { revise: false, book: false, desk: false, detail: true })
            assert.deepEqual(coverageRoute({ resolved: true, handheld: true }), { revise: false, book: false, desk: false, detail: true })
        })

        // The desk IS visible on a phone (it is the column that stays), so a revise is unchanged.
        it('a revise still runs the desk pipeline', () => {
            assert.deepEqual(coverageRoute({ mode: 'revise', resolved: true, handheld: true }), { revise: true, book: false, desk: false, detail: false })
        })

        // No doc, no page to open — the desk is the visible landing, same as on a desktop.
        it('nothing resolved still lands on the desk', () => {
            assert.deepEqual(coverageRoute({ mode: 'open', resolved: false, handheld: true }), { revise: false, book: true, desk: true, detail: false })
        })
    })
})
