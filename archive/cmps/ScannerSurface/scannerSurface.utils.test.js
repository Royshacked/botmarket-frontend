import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anglePrompt, readFlagFor, summariseDropped, listKey } from './scannerSurface.utils.js'

// The rules Argus's surface draws by (phase 8d) — moved from ScannerPanel with its suite's assertions.

test('one angle is a plain scan; several are the intersection', () => {
    assert.equal(anglePrompt([]), '')
    assert.equal(anglePrompt(['Momentum']), 'Scan for momentum setups')
    assert.equal(anglePrompt(['Momentum', 'Breakouts']), 'Scan for momentum setups + breakout setups — names that fit both angles')
    assert.match(anglePrompt(['Momentum', 'Breakouts', 'False breaks']), /names that fit all of these angles$/)
})

test('a kept name wears the read\'s own flag, else a record that settled the other way from the tape', () => {
    assert.equal(readFlagFor({ direction: 'long', prometheus: { flag: 'unclear', direction: 'short' } }), 'unclear')
    assert.equal(readFlagFor({ direction: 'long', prometheus: { direction: 'short' } }), 'side')
    assert.equal(readFlagFor({ direction: 'long', prometheus: { direction: 'long' } }), null)
    assert.equal(readFlagFor({ direction: 'long', prometheus: { direction: 'unsettled' } }), null)
    assert.equal(readFlagFor({ direction: 'long' }), null)
})

test('the dropped names are said by verdict — the server\'s rows and a raw read\'s alike', () => {
    assert.equal(
        summariseDropped([{ ticker: 'MOS', verdict: 'contradicted' }, { ticker: 'APD', read: { verdict: 'priced_in' } }, { ticker: 'X' }]),
        'MOS contradicted; APD priced in; X short',
    )
    assert.equal(summariseDropped(['A', 'B', 'C', 'D', 'E'].map(t => ({ ticker: t, verdict: 'contradicted' }))), 'A, B, C +2 contradicted')
})

test('a list is keyed by its tickers — the read belongs to exactly that list', () => {
    assert.equal(listKey({ candidates: [{ ticker: 'mos' }, { ticker: 'KLAC' }] }), 'MOS,KLAC')
    assert.equal(listKey({ candidates: [] }), null)
    assert.equal(listKey(null), null)
})
