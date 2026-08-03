import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { ChatBubble } from './ChatBubble.jsx'

// The chips under an agent's message. Two kinds, one component:
//   - Argus: a chip is a doorway (click → preview the name), so it has a hint.
//   - Atlas: the chips ARE the portfolio holdings it just named. They lead nowhere —
//     the "Build idea →" link pointed at the archived Idea desk and was removed.

afterEach(cleanup)

const MSG = { role: 'assistant', content: 'Here is the book.', tickers: ['AAPL', 'GLD'] }

describe("Atlas's holdings chips are labels, not links", () => {
    it('renders every ticker as a non-interactive chip — no button, no hint', () => {
        const { container } = render(<ChatBubble msg={MSG} staticTickers />)
        const chips = container.querySelectorAll('.portfolio-panel__ticker-chip')
        expect([...chips].map(c => c.textContent)).toEqual(['AAPL', 'GLD'])
        expect(container.querySelectorAll('.portfolio-panel__ticker-chip button')).toHaveLength(0)
        expect(container.querySelector('button')).toBeNull()
        expect(container.querySelector('.portfolio-panel__ticker-chip-hint')).toBeNull()
        expect(container.textContent).not.toContain('Build idea')
    })

    it('a static chip carries the --static modifier so it does not read as clickable', () => {
        const { container } = render(<ChatBubble msg={MSG} staticTickers />)
        expect(container.querySelectorAll('.portfolio-panel__ticker-chip--static')).toHaveLength(2)
    })
})

describe('a chip with a handler is still a link', () => {
    it('Argus-style chips stay clickable and keep their hint', () => {
        const onSelect = vi.fn()
        const { container } = render(<ChatBubble msg={MSG} onTickerSelect={onSelect} tickerHint="View →" />)
        const chips = container.querySelectorAll('button.portfolio-panel__ticker-chip')
        expect(chips).toHaveLength(2)
        expect(container.querySelectorAll('.portfolio-panel__ticker-chip-hint')).toHaveLength(2)
        fireEvent.click(chips[0])
        expect(onSelect).toHaveBeenCalledWith('AAPL')
    })
})

describe('panels that want neither get neither', () => {
    it('no handler and no staticTickers → no chip row at all', () => {
        // Kairos / Mentor / Analyst render through the same bubble and never show chips.
        const { container } = render(<ChatBubble msg={MSG} />)
        expect(container.querySelector('.portfolio-panel__tickers')).toBeNull()
    })
})
