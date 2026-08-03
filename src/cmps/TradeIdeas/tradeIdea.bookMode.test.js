import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isPortfolioReview, portfoliosFromIdeas } from './tradeIdea.utils.js'

// Reopening a book is two different acts, and the BOOK's state picks which — not the caller, and not
// the words the user used. A plan nobody has acted on is a draft to re-work; a book with a position
// open is a review, because re-planning sends every holding back to `waiting` and would take a live
// position off monitoring in order to rewrite a plan the market has already acted on.

const leg = (status, over = {}) => ({ id: `i-${status}`, portfolioId: 'p1', portfolioName: 'Core', asset: 'SPY', status, ...over })

test('a book still being built is an EDIT — nothing is live, so re-planning costs nothing', () => {
    assert.equal(isPortfolioReview([leg('waiting'), leg('waiting')]), false)
})

test('a book with a position open is a REVIEW — a live leg is never stood down to re-plan', () => {
    assert.equal(isPortfolioReview([leg('waiting'), leg('long')]), true)
    assert.equal(isPortfolioReview([leg('short')]), true)
})

// 'hit' means an order is parked, not that a position exists — the same line isDeleteLocked draws.
// So an activated-but-unfilled book still opens as a re-plan, and its pending orders stand down with
// it. That is the deliberate boundary, not an oversight: pre-position is still a plan.
test('an activated book that has not filled is still an edit — a parked order is not a position', () => {
    assert.equal(isPortfolioReview([leg('hit'), leg('waiting')]), false)
})

test('a book whose positions have all CLOSED is an edit again — nothing is live to protect', () => {
    assert.equal(isPortfolioReview([leg('closed'), leg('closed')]), false)
})

test('an empty or missing book is an edit, never a review — there is nothing to review', () => {
    assert.equal(isPortfolioReview([]), false)
    assert.equal(isPortfolioReview(), false)
    assert.equal(isPortfolioReview(null), false)
})

// The hand-off reads the book row straight out of the same derivation the lists render from, so the
// two have to fit together: `.ideas` is what carries the statuses this decision turns on.
test('reads the ideas off a portfoliosFromIdeas row, which is how the hand-off calls it', () => {
    const [book] = portfoliosFromIdeas([leg('waiting'), leg('long'), { id: 'x', asset: 'QQQ', status: 'long' }])

    assert.equal(book.portfolioId, 'p1')
    assert.equal(isPortfolioReview(book.ideas), true)
})
