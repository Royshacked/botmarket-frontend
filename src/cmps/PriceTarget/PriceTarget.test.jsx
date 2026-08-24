import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

import { PriceTarget } from './PriceTarget.jsx'

afterEach(cleanup)

// The one renderer behind three surfaces (AnalystPanel draft, Radar coverage book, Floor rows). These
// cover what the three copies it replaced used to disagree about.

describe('PriceTarget', () => {
    it('renders the number with the PT label by default', () => {
        const { container } = render(<PriceTarget priceTarget={{ value: 200 }} />)
        expect(container.textContent).toBe('PT 200')
    })

    it('drops the label when the host passes none — the Floor column already reads as targets', () => {
        const { container } = render(<PriceTarget priceTarget={{ value: 200 }} label={null} />)
        expect(container.textContent).toBe('200')
    })

    it('shows the horizon — the deadline the monitor grades the hit against', () => {
        const { container } = render(<PriceTarget priceTarget={{ value: 200, horizon: '12m' }} />)
        expect(container.textContent).toBe('PT 200 / 12m')
        // It recedes: it is metadata about the target, not the target.
        expect(container.querySelector('.price-target__horizon')).toBeTruthy()
    })

    it('signs and colours the gap by direction', () => {
        const { container } = render(<PriceTarget priceTarget={{ value: 200 }} gap={{ pct: 11.1 }} />)
        expect(container.textContent).toBe('PT 200 +11.1%')
        expect(container.querySelector('.price-target__gap--up')).toBeTruthy()

        cleanup()
        const down = render(<PriceTarget priceTarget={{ value: 200 }} gap={{ pct: -8.4 }} />)
        expect(down.container.textContent).toBe('PT 200 -8.4%')   // the minus rides on the number
        expect(down.container.querySelector('.price-target__gap--down')).toBeTruthy()
    })

    it('a flat gap reads as up, not as missing', () => {
        const { container } = render(<PriceTarget priceTarget={{ value: 200 }} gap={{ pct: 0 }} />)
        expect(container.textContent).toBe('PT 200 +0%')
        expect(container.querySelector('.price-target__gap--up')).toBeTruthy()
    })

    it('spells out the gap source only where the host has room for it', () => {
        const { container } = render(<PriceTarget priceTarget={{ value: 200 }} gap={{ pct: 11.1 }} gapSource />)
        expect(container.textContent).toBe('PT 200 +11.1% vs Street')
    })

    it('renders nothing without a number — a PT with no value is meaningless', () => {
        for (const pt of [null, undefined, {}, { horizon: '12m' }]) {
            const { container } = render(<PriceTarget priceTarget={pt} gap={{ pct: 11.1 }} />)
            expect(container.textContent).toBe('')
            cleanup()
        }
    })

    it('a missing gap drops the percentage but keeps the target', () => {
        const { container } = render(<PriceTarget priceTarget={{ value: 200, horizon: '6m' }} gap={null} />)
        expect(container.textContent).toBe('PT 200 / 6m')
        expect(container.querySelector('.price-target__gap')).toBeNull()
    })

    it('a zero target still renders — 0 is a number, not an absence', () => {
        render(<PriceTarget priceTarget={{ value: 0 }} />)
        expect(screen.getByText(/PT 0/)).toBeTruthy()
    })
})
