import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { bottomLine, nextCatalyst, firstRisk } from './bottomLine.utils.js'

// A Hotlist row's page in bottom lines (Roy, 2026-11-21) — the whole story is the chat's.
describe('bottom lines', () => {
    it('the first sentence — a price or an abbreviation does not end it; a long one is cut at a word', () => {
        assert.equal(bottomLine('We reaffirm FY2027 EPS of $8.10, in line. The base case supports the stock.'), 'We reaffirm FY2027 EPS of $8.10, in line.')
        assert.equal(bottomLine('Now. The stock is below both averages. More.'), 'Now. The stock is below both averages.', 'a one-word verdict carries on into its reason')
        assert.equal(bottomLine('  one   line  '), 'one line')
        assert.equal(bottomLine(''), null)
        const long = bottomLine(`${'word '.repeat(60)}end.`, 50)
        assert.ok(long.length <= 50 && long.endsWith('…'), long)
    })
    it('the next catalyst from today on; none past', () => {
        const cats = [{ date: '2026-10-01', note: 'Old print.' }, { date: '2026-12-14', note: 'Expected earnings report — assess growth. More words.' }]
        assert.equal(nextCatalyst(cats, '2026-11-21'), 'Dec 14 — Expected earnings report — assess growth.')
        assert.equal(nextCatalyst([{ date: '2026-10-01', note: 'Old.' }], '2026-11-21'), null)
        assert.equal(nextCatalyst(null), null)
    })
    it('the first kill criterion as the risk', () => {
        assert.equal(firstRisk(['FY2027 EPS guidance falls below $6.50, the bear case. Then more.', 'b']), 'FY2027 EPS guidance falls below $6.50, the bear case.')
        assert.equal(firstRisk([]), null)
    })
})
