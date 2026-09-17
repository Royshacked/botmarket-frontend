import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NAV, VENUE_OF_WORKSPACE, tabFromHash } from './profileTabs.js'

test('tabFromHash: a known hash opens that tab, with or without the #', () => {
    assert.equal(tabFromHash('#brokers'), 'brokers')
    assert.equal(tabFromHash('paper'), 'paper')
})

test('tabFromHash: no hash, an empty hash, or an unknown one opens Account', () => {
    assert.equal(tabFromHash(''), 'account')
    assert.equal(tabFromHash(undefined), 'account')
    assert.equal(tabFromHash(null), 'account')
    assert.equal(tabFromHash('#nope'), 'account')
    assert.equal(tabFromHash('#'), 'account')
})

test('every workspace maps to a tab that exists in the nav', () => {
    const ids = new Set(NAV.flatMap(g => g.tabs.map(t => t.id)))
    for (const ws of ['live', 'paper', 'manual']) {
        assert.ok(ids.has(VENUE_OF_WORKSPACE[ws]), `${ws} → ${VENUE_OF_WORKSPACE[ws]}`)
    }
})

test('tab ids are unique across groups', () => {
    const ids = NAV.flatMap(g => g.tabs.map(t => t.id))
    assert.equal(new Set(ids).size, ids.length)
})
