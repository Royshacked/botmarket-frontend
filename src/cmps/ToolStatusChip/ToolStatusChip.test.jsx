import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { ToolStatusChip } from './ToolStatusChip.jsx'
import { ChatBubble } from '../ChatBubble.jsx'
import { MessageBubble as AxlMessageBubble } from '../AxlHub/AxlHub.jsx'

// Waiting is ONE state — "thinking…" before the first token, "fetching…" while a tool runs. It used
// to be drawn three ways (a bespoke `__thinking` span in ChatPanel, another in PortfolioPanel, and
// this chip), which is how Axl ended up with a bordered thinking mark next to a bare fetching one.
// These tests exist to keep the mark single-sourced: a panel that grows its own span fails here.

afterEach(cleanup)

describe('the waiting mark', () => {
    it('renders nothing without a label — no empty pulsing box between turns', () => {
        const { container } = render(<ToolStatusChip label="" />)
        expect(container.innerHTML).toBe('')
    })

    it('announces itself, so the wait is not silent to a screen reader', () => {
        const { container } = render(<ToolStatusChip label="fetching candles…" />)
        const chip = container.querySelector('.tool-status-chip')
        expect(chip.getAttribute('role')).toBe('status')
        expect(chip.getAttribute('aria-live')).toBe('polite')
    })
})

describe('every desk waits with the same mark', () => {
    // ChatBubble is Kairos / Atlas / Argus / Mentor / Analyst; Axl keeps its own bubble.
    it('the shared bubble uses the chip, not a panel-local span', () => {
        const { container } = render(<ChatBubble msg={{ role: 'assistant', streaming: true, content: '' }} />)
        expect(container.querySelector('.tool-status-chip').textContent).toBe('thinking…')
        expect(container.querySelector('.portfolio-panel__thinking')).toBeNull()
    })

    it('a caller can still name the wait — the mark stays the same', () => {
        const { container } = render(<ChatBubble msg={{ role: 'assistant', streaming: true, content: '' }} placeholder="screening…" />)
        expect(container.querySelector('.tool-status-chip').textContent).toBe('screening…')
    })

    it("Axl's own bubble uses the chip too", () => {
        const { container } = render(<AxlMessageBubble msg={{ role: 'assistant', streaming: true, content: '' }} />)
        expect(container.querySelector('.tool-status-chip').textContent).toBe('thinking…')
    })
})
