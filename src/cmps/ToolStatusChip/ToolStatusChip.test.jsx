import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { ToolStatusChip } from './ToolStatusChip.jsx'
import { waitingLabel } from './waitingLabel.js'
import { ChatBubble } from '../ChatBubble.jsx'
import { MessageBubble as AxlMessageBubble } from '../AxlHub/AxlHub.jsx'

// Waiting is ONE state — "thinking…" before the first token, "fetching…" while a tool runs. It used
// to be drawn three ways (a bespoke `__thinking` span in ChatPanel, another in PortfolioPanel, and
// this chip), AND in two places at once: useChatStream.begin() appends the empty streaming bubble
// immediately, so a tool firing mid-wait put "thinking…" inside the bubble and "fetching…" right
// below it. One mark, one place — these tests are what keep it that way.

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

describe('waitingLabel — the one thing said while a turn waits', () => {
    const waiting  = [{ role: 'assistant', content: '', streaming: true }]
    const answering = [{ role: 'assistant', content: 'NVDA is…', streaming: true }]

    it('a live tool beats the generic word — the specific thing wins', () => {
        expect(waitingLabel({ messages: waiting, streamStatus: 'fetching candles…' })).toBe('fetching candles…')
    })

    it('falls back to the desk’s own word when no tool is running', () => {
        expect(waitingLabel({ messages: waiting, streamStatus: '', placeholder: 'scanning…' })).toBe('scanning…')
    })

    it('defaults to thinking… for desks that never named their wait', () => {
        expect(waitingLabel({ messages: waiting, streamStatus: '' })).toBe('thinking…')
    })

    it('goes quiet once tokens arrive — no "thinking…" under a growing answer', () => {
        expect(waitingLabel({ messages: answering, streamStatus: '' })).toBe('')
    })

    it('but still names a tool that fires mid-answer', () => {
        expect(waitingLabel({ messages: answering, streamStatus: 'reading news…' })).toBe('reading news…')
    })

    it('says nothing on an idle thread', () => {
        expect(waitingLabel({ messages: [{ role: 'assistant', content: 'done' }], streamStatus: '' })).toBe('')
    })
})

describe('no bubble draws its own waiting mark', () => {
    // ChatBubble is Kairos / Atlas / Argus / Mentor / Analyst; Axl keeps its own bubble. If either
    // grows a placeholder back, the mark doubles up the moment a tool fires.
    it('the shared bubble renders nothing while wordless', () => {
        const { container } = render(<ChatBubble msg={{ role: 'assistant', streaming: true, content: '' }} />)
        expect(container.innerHTML).toBe('')
    })

    it("Axl's own bubble renders nothing while wordless", () => {
        const { container } = render(<AxlMessageBubble msg={{ role: 'assistant', streaming: true, content: '' }} />)
        expect(container.innerHTML).toBe('')
    })

    it('reasoning still shows while wordless — that is the turn, not the wait', () => {
        const { container } = render(<ChatBubble msg={{ role: 'assistant', streaming: true, content: '', reasoning: 'weighing the tape' }} />)
        expect(container.querySelector('.chat-reasoning')).toBeTruthy()
        expect(container.querySelector('.tool-status-chip')).toBeNull()
    })
})

// ── the live reasoning beat ───────────────────────────────────────────────────
describe('ToolStatusChip — reasoning pulse', () => {
    it('beats when reasoning is streaming, even with no label to show', () => {
        const { container } = render(<ToolStatusChip label="" pulse={0.5} />)
        expect(container.querySelector('.tool-status-chip--reasoning')).toBeTruthy()
        expect(container.querySelector('.tool-status-chip__pulse')).toBeTruthy()
        expect(container.textContent).toContain('reasoning')
    })

    it('a live tool status keeps the words and still beats', () => {
        // The model can think while a tool is in flight — "fetching candles…" is the more useful
        // thing to say, but the beat is what tells the user it is still working.
        const { container } = render(<ToolStatusChip label="fetching candles…" pulse={0.8} />)
        expect(container.textContent).toContain('fetching candles…')
        expect(container.querySelector('.tool-status-chip__pulse')).toBeTruthy()
    })

    it('no pulse and no label renders nothing at all', () => {
        const { container } = render(<ToolStatusChip label="" pulse={null} />)
        expect(container.innerHTML).toBe('')
    })

    it('a faster pulse runs a shorter cycle', () => {
        const cycle = p => render(<ToolStatusChip label="" pulse={p} />)
            .container.querySelector('.tool-status-chip').style.getPropertyValue('--pulse-ms')
        expect(parseInt(cycle(0.9), 10)).toBeLessThan(parseInt(cycle(0.1), 10))
    })
})
