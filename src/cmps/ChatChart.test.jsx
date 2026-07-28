import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, renderHook, act } from '@testing-library/react'
import { ChatChart } from './ChatChart.jsx'
import { ChatBubble } from './ChatBubble.jsx'
import { MessageBubble as AxlMessageBubble } from './AxlHub/AxlChatPanel.jsx'
import { useChatStream, toChatHistory } from '../customHooks/useChatStream.js'

// The in-thread chart row: the STILL image an agent rendered and read. The live chart a user asked
// for is not here — it docks at the bottom of the chat (see ChatChartDock.test.jsx). Keeping the
// agent's chart a still is deliberate: it is evidence of what the model actually saw.

afterEach(cleanup)

describe("a chart the agent looked at stays a still image", () => {
    it('renders the PNG with a symbol · timeframe caption', () => {
        const { container } = render(<ChatChart msg={{ imageBase64: 'AAA', symbol: 'NVDA', timeframe: '4hr' }} />)
        const img = container.querySelector('.chat-chart__img')
        expect(img.getAttribute('src')).toBe('data:image/png;base64,AAA')
        expect(container.querySelector('.chat-chart__caption').textContent).toBe('NVDA · 4hr')
        expect(container.querySelector('[data-testid="price-chart"]')).toBeNull()
    })

    it('renders without a caption when the agent sent no symbol/timeframe', () => {
        const { container } = render(<ChatChart msg={{ imageBase64: 'AAA' }} />)
        expect(container.querySelector('.chat-chart__img')).toBeTruthy()
        expect(container.querySelector('.chat-chart__caption')).toBeNull()
    })

    it('renders nothing without an image — never a broken img', () => {
        const { container } = render(<ChatChart msg={{ symbol: 'NVDA' }} />)
        expect(container.innerHTML).toBe('')
    })
})

describe('ChatBubble routes chart rows to the shared component', () => {
    // Kairos / Atlas / Mentor / Analyst / Argus all render through ChatBubble, so this is what makes
    // the chart appear in their threads at all.
    it('a type:chart row renders the chart, not an empty assistant bubble', () => {
        const { container } = render(<ChatBubble msg={{ role: 'assistant', type: 'chart', symbol: 'SPY', timeframe: 'day', imageBase64: 'BBB' }} />)
        expect(container.querySelector('.chat-chart__img')).toBeTruthy()
        expect(container.querySelector('.portfolio-panel__bubble')).toBeNull()
    })

    it('a normal assistant row is untouched', () => {
        const { container } = render(<ChatBubble msg={{ role: 'assistant', content: 'hello' }} />)
        expect(container.querySelector('.chat-chart')).toBeNull()
        expect(container.textContent).toContain('hello')
    })
})

describe('Axl renders the same row from its own bubbles', () => {
    // Axl has NO tools, so the shared <chart> tag is the only way it can ever show a chart — and its
    // panel predates ChatBubble, so without this route the row would vanish in exactly the one chat
    // the user is most likely to type "give SPY" into.
    it('a type:chart row renders the chart, not an empty Axl bubble', () => {
        const { container } = render(<AxlMessageBubble msg={{ role: 'assistant', type: 'chart', symbol: 'SPY', timeframe: 'day', imageBase64: 'CCC' }} />)
        expect(container.querySelector('.chat-chart__img').getAttribute('src')).toBe('data:image/png;base64,CCC')
        expect(container.querySelector('.axl-chat__bubble')).toBeNull()
    })

    it('a normal assistant row still renders as an Axl bubble', () => {
        const { container } = render(<AxlMessageBubble msg={{ role: 'assistant', content: 'hello' }} />)
        expect(container.querySelector('.axl-chat__bubble--assistant')).toBeTruthy()
        expect(container.textContent).toContain('hello')
    })
})

describe('useChatStream owns where the chart row goes', () => {
    it('inserts the chart BEFORE the streaming bubble, so it reads as part of that turn', () => {
        const { result } = renderHook(() => useChatStream())
        let handlers
        act(() => { handlers = result.current.begin('read the chart').handlers })
        act(() => { handlers.onChart({ symbol: 'NVDA', timeframe: '4hr', imageBase64: 'AAA' }) })

        const msgs = result.current.messages
        expect(msgs.map(m => m.role)).toEqual(['user', 'assistant', 'assistant'])
        expect(msgs[1]).toMatchObject({ type: 'chart', symbol: 'NVDA', timeframe: '4hr', imageBase64: 'AAA' })
        expect(msgs[2].streaming).toBe(true)
    })

    it('an event with no image is ignored rather than inserting an empty row', () => {
        // A `live` payload never reaches here — sse.util routes it to the dock — so an image-less
        // event in this path is a malformed one, and an empty chart row would be worse than nothing.
        const { result } = renderHook(() => useChatStream())
        let handlers
        act(() => { handlers = result.current.begin('hi').handlers })
        act(() => { handlers.onChart({ symbol: 'NVDA' }) })
        act(() => { handlers.onChart({ symbol: 'NVDA', live: true }) })
        expect(result.current.messages.length).toBe(2)
    })

    it('a chart-only turn leaves NO empty bubble behind', () => {
        // The normal shape of "give SPY": the chart docked (not a message at all) and agents are told
        // not to narrate a chart, so the reply is genuinely empty. The bubble goes.
        const { result } = renderHook(() => useChatStream())
        act(() => { result.current.begin('give spy') })
        act(() => { result.current.finishStreaming({ role: 'assistant', content: '' }) })

        const msgs = result.current.messages
        expect(msgs.map(m => m.role)).toEqual(['user'])
        expect(msgs.some(m => m.streaming)).toBe(false)
    })

    // The non-empty paths finalize through the typewriter drain, which runs on an interval started
    // back in begin() — so the fake clock has to be installed before the hook, not just before
    // finishStreaming. (The empty path needs none of this: it resolves synchronously, because there
    // is nothing to type.)
    function runTurn(userText, finalMsg) {
        vi.useFakeTimers()
        try {
            const { result } = renderHook(() => useChatStream())
            act(() => { result.current.begin(userText) })
            act(() => { result.current.finishStreaming(finalMsg) })
            act(() => { vi.advanceTimersByTime(2000) })
            return result.current.messages
        } finally {
            vi.useRealTimers()
        }
    }

    it('a reply that DOES have text keeps its bubble', () => {
        const msgs = runTurn('what about spy?', { role: 'assistant', content: 'Range-bound.' })
        expect(msgs.at(-1)).toMatchObject({ role: 'assistant', content: 'Range-bound.' })
    })

    it('an empty reply that carries reasoning keeps its bubble — it has something to show', () => {
        const msgs = runTurn('give spy', { role: 'assistant', content: '', reasoning: 'thought about it' })
        expect(msgs.at(-1)).toMatchObject({ reasoning: 'thought about it' })
        expect(msgs.length).toBe(2)
    })

    it('a panel can still override onChart', () => {
        const { result } = renderHook(() => useChatStream())
        const seen = []
        let handlers
        act(() => { handlers = result.current.begin('hi', { onChart: d => seen.push(d) }).handlers })
        act(() => { handlers.onChart({ symbol: 'NVDA', imageBase64: 'AAA' }) })
        expect(seen.length).toBe(1)
        expect(result.current.messages.length).toBe(2)
    })
})

describe('toChatHistory', () => {
    it('drops chart rows — a chart row has no content to send a model', () => {
        // Every panel builds both its send AND resume history through this, so the guard belongs
        // here rather than in four filters.
        const history = toChatHistory([
            { role: 'user', content: 'chart?' },
            { role: 'assistant', type: 'chart', symbol: 'SPY', imageBase64: 'AAA' },
            { role: 'assistant', content: 'here it is' },
        ])
        expect(history).toEqual([
            { role: 'user', content: 'chart?' },
            { role: 'assistant', content: 'here it is' },
        ])
    })
})
