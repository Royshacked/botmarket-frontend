import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { HouseChip } from './HouseChip.jsx'

// The house's label on a scanned name (backend argus-on-pythia.md §3.4): the book, the industry in the tooltip,
// and the flags — never a claim about the stock.

afterEach(cleanup)

describe('HouseChip', () => {
    it('names the book and, in the tooltip, the industry and that it is not a view of the stock', () => {
        const { container } = render(<HouseChip house={{ book: 'swing', industry: 'Communications Equipment', themes: [] }} />)
        const chip = container.querySelector('.house-chip')
        expect(chip.textContent).toBe('House · swing')
        expect(chip.title).toMatch(/On the house's swing list — Communications Equipment\./)
        expect(chip.title).toMatch(/not of this stock; it adds nothing to the score/)
        expect(chip.className).not.toMatch(/flagged/)
    })

    it('long term, a theme, and the flags', () => {
        const { container } = render(<HouseChip house={{ book: 'long_term', industry: 'Coal', themes: ['Power'], hype: true, avoid: true }} />)
        const chip = container.querySelector('.house-chip')
        expect(chip.textContent).toBe('House · long term')
        expect(chip.title).toMatch(/\(via Power\)/)
        expect(chip.title).toMatch(/HYPE/)
        expect(chip.title).toMatch(/Avoid/)
        expect(chip.className).toMatch(/house-chip--flagged/)
    })

    it('renders nothing without a label, or with an unknown book', () => {
        expect(render(<HouseChip house={null} />).container.innerHTML).toBe('')
        expect(render(<HouseChip house={{ book: 'watch' }} />).container.innerHTML).toBe('')
    })
})
