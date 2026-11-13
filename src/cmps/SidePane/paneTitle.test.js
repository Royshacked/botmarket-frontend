import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paneTitle } from './paneTitle.js'

// The work pane names the ITEM being built, never who builds it (backend one-axl.md §5, 2026-11-13).

test('a trade: as much of it as is decided — the name, then its direction and horizon', () => {
    assert.equal(paneTitle('mentor', { draft: { asset: 'nvda', direction: 'LONG', type: 'swing' } }), 'NVDA · long swing trade')
    assert.equal(paneTitle('mentor', { draft: { asset: 'TSLA', type: 'short_term_swing' } }), 'TSLA · short-term swing trade')
    assert.equal(paneTitle('mentor', { active_asset: 'AMD' }), 'AMD · trade')
    assert.equal(paneTitle('mentor', { draft: null }), null, 'nothing yet → the caller falls back to "Trade work"')
})

test('a book: its plan\'s name, else a short objective as "… book", else what is happening to it', () => {
    assert.equal(paneTitle('portfolio', { pendingPlan: { name: 'AI infrastructure sleeve' } }), 'AI infrastructure sleeve')
    assert.equal(paneTitle('portfolio', { mandate: { objective: 'growth' } }), 'Growth book')
    assert.equal(paneTitle('portfolio', { mandate: { objective: 'beat the S&P over five years with low drawdowns' } }), 'New portfolio', 'a sentence is not a title')
    assert.equal(paneTitle('portfolio', { reviewMode: true }), 'Portfolio review')
    assert.equal(paneTitle('portfolio', {}), null)
})

test('coverage names its stock; a role with no item, or no state, has no title', () => {
    assert.equal(paneTitle('analyst', { active_symbol: 'msft' }), 'MSFT · coverage')
    assert.equal(paneTitle('scanner', { handoff: true }), null)
    assert.equal(paneTitle('mentor', undefined), null)
    assert.equal(paneTitle('ticket', {}), null)
})
