// Pure-function tests for the Forecasts heat map's arithmetic.
// Node's built-in harness:  node --test src/cmps/Floor/
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
    heatLevel, pctText, badgeOf, tileVerdict, moveOf, isStale, matchesFilter, groupBySector, sectorLine, capText,
    windowOf, DEFAULT_WINDOW,
} from './forecastMap.utils.js'

const tile = (over = {}) => ({ code: '1', name: 'A', sector: 'Energy', industry: 'Oil', covered: 0, moves: null, assessment: null, ...over })

describe('heatLevel', () => {
    it('steps a quarter of the scale at a time, capped at full colour, signed by direction', () => {
        assert.equal(heatLevel(0.05, 0.2), 1)
        assert.equal(heatLevel(0.1, 0.2), 2)
        assert.equal(heatLevel(0.2, 0.2), 4)
        assert.equal(heatLevel(0.9, 0.2), 4)
        assert.equal(heatLevel(-0.12, 0.2), -3)
    })

    it('a move too small to tint is flat, and no number is no colour', () => {
        assert.equal(heatLevel(0.01, 0.2), 0)
        assert.equal(heatLevel(0, 0.2), 0)
        assert.equal(heatLevel(null, 0.2), null)
        assert.equal(heatLevel(NaN, 0.2), null)
        assert.equal(heatLevel(0.1, 0), null)
    })
})

describe('words', () => {
    it('pctText signs the move and dashes a missing one', () => {
        assert.equal(pctText(0.123), '+12%')
        assert.equal(pctText(-0.04), '−4%')
        assert.equal(pctText(0.001), '0%')
        assert.equal(pctText(null), '—')
    })

    it('capText scales to B or M', () => {
        assert.equal(capText(4.12e11), '$412B')
        assert.equal(capText(3.14e9), '$3.1B')
        assert.equal(capText(6.4e8), '$640M')
        assert.equal(capText(null), '')
    })

    it('the default window is three months', () => {
        assert.equal(DEFAULT_WINDOW, 'rel_3m')
        assert.equal(windowOf('nope').key, 'rel_3m')
    })
})

describe('verdict on a tile', () => {
    it('reads legacy words as today\'s, letters only for a verdict that asks for attention', () => {
        assert.equal(tileVerdict(tile({ assessment: { verdict: 'interesting_trade' } })), 'swing')
        assert.equal(badgeOf(tile({ assessment: { verdict: 'interesting_invest' } })), 'L')
        assert.equal(badgeOf(tile({ assessment: { verdict: 'avoid' } })), 'A')
        assert.equal(badgeOf(tile({ assessment: { verdict: 'no_case' } })), null)
        assert.equal(badgeOf(tile()), null)
    })

    it('filters by verdict; All lets everything through', () => {
        const t = tile({ assessment: { verdict: 'watch' } })
        assert.equal(matchesFilter(t, 'all'), true)
        assert.equal(matchesFilter(t, 'watch'), true)
        assert.equal(matchesFilter(t, 'swing'), false)
        assert.equal(matchesFilter(tile(), 'avoid'), false)
    })

    it('an assessment past its reassessment date is stale', () => {
        const now = Date.parse('2026-10-14T00:00:00Z')
        assert.equal(isStale(tile({ assessment: { expires_at: '2026-10-01T00:00:00Z' } }), now), true)
        assert.equal(isStale(tile({ assessment: { expires_at: '2026-11-01T00:00:00Z' } }), now), false)
        assert.equal(isStale(tile(), now), false)
    })

    it('moveOf reads one window and ignores non-numbers', () => {
        assert.equal(moveOf(tile({ moves: { rel_3m: 0.1 } }), 'rel_3m'), 0.1)
        assert.equal(moveOf(tile({ moves: { rel_3m: null } }), 'rel_3m'), null)
        assert.equal(moveOf(tile(), 'rel_3m'), null)
    })
})

describe('groupBySector', () => {
    const tiles = [
        tile({ code: '3', name: 'Zeta', sector: 'Materials', industry: 'Chemicals', assessment: { verdict: 'swing' }, covered: 2 }),
        tile({ code: '1', name: 'Beta', sector: 'Energy', industry: 'Oil' }),
        tile({ code: '2', name: 'Alpha', sector: 'Energy', industry: 'Equipment', assessment: { verdict: 'avoid' }, covered: 1 }),
        tile({ code: '4', name: 'Loose', sector: null }),
        tile({ code: '5', name: 'Gamma', sector: 'Materials', industry: 'Chemicals', assessment: { verdict: 'interesting_trade' } }),
    ]

    it('sectors alphabetical with the unclassified last; siblings of one industry together, then by name', () => {
        const g = groupBySector(tiles)
        assert.deepEqual(g.map(s => s.sector), ['Energy', 'Materials', 'Unclassified'])
        assert.deepEqual(g[0].tiles.map(t => t.name), ['Alpha', 'Beta'])
        assert.deepEqual(g[1].tiles.map(t => t.name), ['Gamma', 'Zeta'])
    })

    it('counts each sector\'s verdicts and covered names, and says only what is there', () => {
        const g = groupBySector(tiles)
        assert.deepEqual(g[1].counts, { swing: 2, long_term: 0, watch: 0, avoid: 0 })
        assert.equal(g[1].covered, 2)
        assert.equal(sectorLine(g[1]), '2 swing · 2 covered')
        assert.equal(sectorLine(g[0]), '1 avoid · 1 covered')
        assert.equal(sectorLine(g[2]), '')
    })
})
