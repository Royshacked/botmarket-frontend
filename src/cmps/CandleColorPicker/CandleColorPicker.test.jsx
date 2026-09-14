import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { CandleColorPicker } from './CandleColorPicker.jsx'
import { CANDLE_UP_KEY, CANDLE_DOWN_KEY, slidersFromHex, candleHexFromSliders } from '../../services/candleColors.service.js'

// The picker: two sliders per side that write a hex through the service. Pinned: an untouched
// picker saves nothing and shows no reset; moving one side's slider saves THAT side only and
// the reset appears; reset clears both and puts the sliders back on the theme default.

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('CandleColorPicker', () => {
    it('seeds the sliders from the theme default and saves nothing until moved', () => {
        render(<CandleColorPicker />)
        const { hue } = slidersFromHex('#1c7a3e')   // jsdom: token falls back to the code default
        expect(screen.getByLabelText('Up candle colour').value).toBe(String(hue))
        expect(localStorage.getItem(CANDLE_UP_KEY)).toBeNull()
        expect(screen.queryByText('reset')).toBeNull()
    })

    it('moving the up hue saves the up side only, as the hex those sliders describe', () => {
        render(<CandleColorPicker />)
        const shade = Number(screen.getByLabelText('Up candle depth').value)
        fireEvent.change(screen.getByLabelText('Up candle colour'), { target: { value: '200' } })
        expect(localStorage.getItem(CANDLE_UP_KEY)).toBe(candleHexFromSliders(200, shade))
        expect(localStorage.getItem(CANDLE_DOWN_KEY)).toBeNull()
        expect(screen.getByText('reset')).toBeTruthy()
    })

    it('reset clears both sides and returns the sliders to the default position', () => {
        render(<CandleColorPicker />)
        fireEvent.change(screen.getByLabelText('Up candle colour'),   { target: { value: '200' } })
        fireEvent.change(screen.getByLabelText('Down candle depth'), { target: { value: '90' } })
        fireEvent.click(screen.getByText('reset'))
        expect(localStorage.getItem(CANDLE_UP_KEY)).toBeNull()
        expect(localStorage.getItem(CANDLE_DOWN_KEY)).toBeNull()
        expect(screen.getByLabelText('Up candle colour').value).toBe(String(slidersFromHex('#1c7a3e').hue))
        expect(screen.queryByText('reset')).toBeNull()
    })
})
