// node:test, like the repo's other *.test.js (vite.config.js: vitest runs *.test.jsx only) — written for vitest on
// 2026-11-05, it ran under neither runner.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { rangeWithLevels } from './chartRange.js'

const R = { from: 280, to: 360, range: 80, realFrom: 280, realTo: 360, realRange: 80, displayFrom: 280, displayTo: 360, displayRange: 80 }

describe('rangeWithLevels', () => {
    it('stretches to a line over the candles, every field of the range together', () => {
        assert.deepEqual(rangeWithLevels(R, [323.73, 378.13]), { from: 280, to: 378.13, range: 98.13, realFrom: 280, realTo: 378.13, realRange: 98.13, displayFrom: 280, displayTo: 378.13, displayRange: 98.13 })
    })

    it('stretches down too, for a short\'s target', () => {
        assert.equal(rangeWithLevels(R, [250]).from, 250)
    })

    it('lines inside the candles, or none, change nothing', () => {
        assert.deepEqual(rangeWithLevels(R, [300]), R)
        assert.equal(rangeWithLevels(R, []), R)
        assert.equal(rangeWithLevels(R, [null, NaN]), R)
    })
})
