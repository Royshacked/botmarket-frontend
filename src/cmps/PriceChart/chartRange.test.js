import { describe, it, expect } from 'vitest'
import { rangeWithLevels } from './chartRange.js'

const R = { from: 280, to: 360, range: 80, realFrom: 280, realTo: 360, realRange: 80, displayFrom: 280, displayTo: 360, displayRange: 80 }

describe('rangeWithLevels', () => {
    it('stretches to a line over the candles, every field of the range together', () => {
        expect(rangeWithLevels(R, [323.73, 378.13])).toEqual({ from: 280, to: 378.13, range: 98.13, realFrom: 280, realTo: 378.13, realRange: 98.13, displayFrom: 280, displayTo: 378.13, displayRange: 98.13 })
    })

    it('stretches down too, for a short\'s target', () => {
        expect(rangeWithLevels(R, [250]).from).toBe(250)
    })

    it('lines inside the candles, or none, change nothing', () => {
        expect(rangeWithLevels(R, [300])).toEqual(R)
        expect(rangeWithLevels(R, [])).toBe(R)
        expect(rangeWithLevels(R, [null, NaN])).toBe(R)
    })
})
