import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initials } from './util.service.js'

// One helper feeds both avatar marks (header button + profile hero) — the cases below are
// the shapes a fullname actually arrives in.
test('initials: first + last for a multi-word name', () => {
    assert.equal(initials('Roy Shacked'), 'RS')
    assert.equal(initials('Ada Byron Lovelace'), 'AL')
    assert.equal(initials('  roy   shacked  '), 'RS')
})

test('initials: first two letters for a single name', () => {
    assert.equal(initials('Roy'), 'RO')
    assert.equal(initials('r'), 'R')
})

test('initials: an absent name reads as Trader, a blank one as T', () => {
    assert.equal(initials(), 'TR')
    assert.equal(initials(''), 'T')
    assert.equal(initials('   '), 'T')
    assert.equal(initials(null), 'T')
})
