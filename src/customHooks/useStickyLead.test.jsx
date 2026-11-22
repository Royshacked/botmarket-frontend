import { describe, it, expect } from 'vitest'
import { measureStickyLead } from './useStickyLead.js'

// The Hotlist's sticky bar and symbol column (Roy, 2026-11-22): the two lengths CSS cannot know.
const box = (el, w, h) => { el.getBoundingClientRect = () => ({ width: w, height: h, top: 0, left: 0, right: w, bottom: h }); return el }

describe('measureStickyLead', () => {
    it('sets the bar height on the scroll box and the lead column width on each list table that has one', () => {
        const scroller = document.createElement('div')
        scroller.innerHTML = `
            <div class="root">
                <div class="hot-horizons"></div>
                <table class="hot-table hot-table--list" id="with"><thead><tr><th class="hot-table__star"></th><th>Sym</th></tr></thead></table>
                <table class="hot-table hot-table--list" id="without" style="--hot-lead-w: 9px"><thead><tr><th>Sym</th></tr></thead></table>
            </div>`
        const root = scroller.querySelector('.root')
        box(root.querySelector('.hot-horizons'), 300, 72)
        box(root.querySelector('#with .hot-table__star'), 27, 20)
        measureStickyLead(root, scroller)
        expect(scroller.style.getPropertyValue('--hot-bar-h')).toBe('72px')
        expect(root.querySelector('#with').style.getPropertyValue('--hot-lead-w')).toBe('27px')
        expect(root.querySelector('#without').style.getPropertyValue('--hot-lead-w')).toBe('', 'no lead cell: the symbol pins at 0')
    })

    it('no bar (a row page, the chart): 0, so the header sticks at the top', () => {
        const scroller = document.createElement('div')
        const root = document.createElement('div')
        scroller.appendChild(root)
        measureStickyLead(root, scroller)
        expect(scroller.style.getPropertyValue('--hot-bar-h')).toBe('0px')
    })
})
