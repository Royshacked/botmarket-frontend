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

    // The demo pane paints from the same resolution the chart uses: override where set, else
    // the theme default — so what the user sees beside the slider is what the chart will show.
    it('paints the preview candles with the effective colours and follows a change live', () => {
        const { container } = render(<CandleColorPicker />)
        const bodies = side => [...container.querySelectorAll(`[data-side="${side}"]`)].map(g => g.getAttribute('fill'))
        expect(bodies('up').every(f => f === '#1c7a3e')).toBe(true)     // jsdom: code defaults
        expect(bodies('down').every(f => f === '#5e1212')).toBe(true)
        expect(screen.getByText('theme default')).toBeTruthy()

        const shade = Number(screen.getByLabelText('Down candle depth').value)
        fireEvent.change(screen.getByLabelText('Down candle colour'), { target: { value: '30' } })
        const expected = candleHexFromSliders(30, shade)
        expect(bodies('down').every(f => f === expected)).toBe(true)
        expect(bodies('up').every(f => f === '#1c7a3e')).toBe(true)     // the other side is untouched
        expect(screen.queryByText('theme default')).toBeNull()
    })

    // A flank is a module-level component. Defined inside the picker it would be a new type each
    // render, React would remount the inputs on every tick, and a mouse drag would drop.
    it('keeps the same slider element across a change (no remount mid-drag)', () => {
        render(<CandleColorPicker />)
        const before = screen.getByLabelText('Up candle colour')
        fireEvent.change(before, { target: { value: '120' } })
        fireEvent.change(before, { target: { value: '140' } })
        expect(screen.getByLabelText('Up candle colour')).toBe(before)
        expect(before.value).toBe('140')
    })

    it('lays out down · chart · up, in that order', () => {
        const { container } = render(<CandleColorPicker />)
        const kids = [...container.querySelector('.candle-colors').children].map(el => el.className)
        expect(kids[0]).toContain('candle-colors__side--down')
        expect(kids[1]).toContain('candle-colors__demo')
        expect(kids[2]).toContain('candle-colors__side--up')
    })
})
