import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ownedSymbols, ownedParts, ownedTitle } from './ownedSymbols.js'

// Roy, 2026-10-28: "in all lists, if a name is already in setups or portfolio items or in positions, we need some
// indication".

test('the user\'s names: a position, a live setup, a portfolio holding — by symbol, upper-cased', () => {
    const m = ownedSymbols({
        positions: [{ symbol: 'aapl' }],
        setups: [{ asset: 'MSFT', status: 'looking' }, { asset: 'MSFT', status: 'long' }, { asset: 'OLD', status: 'closed' }],
        ideas: [{ asset: 'AAPL', portfolioId: 'p1', portfolioName: 'Growth' }, { asset: 'AAPL', portfolioId: 'p2', portfolioName: 'Income' },
            { asset: 'IDEA', status: 'looking' }, { asset: 'SOLD', portfolioId: 'p1', status: 'closed' }],
    })
    assert.deepEqual(m.get('AAPL'), { position: true, portfolio: ['Growth', 'Income'] })
    assert.deepEqual(m.get('MSFT'), { setup: 2 })
    assert.equal(m.has('OLD'), false, 'a closed setup is over')
    assert.equal(m.has('IDEA'), false, 'a plain idea is not a holding')
    assert.equal(m.has('SOLD'), false)
    assert.equal(ownedSymbols().size, 0)
})

test('the badge\'s parts, in order, minus the kind a list of the user\'s own leaves out — and its words', () => {
    const e = { position: true, setup: 1, portfolio: ['Growth'] }
    assert.deepEqual(ownedParts(e), ['position', 'setup', 'portfolio'])
    assert.deepEqual(ownedParts(e, 'setup'), ['position', 'portfolio'])
    assert.deepEqual(ownedParts(undefined), [])
    assert.equal(ownedTitle(e, ownedParts(e)), 'an open position · in your setups · in your portfolio Growth')
    assert.equal(ownedTitle({ setup: 3 }, ['setup']), 'in 3 of your setups')
})
