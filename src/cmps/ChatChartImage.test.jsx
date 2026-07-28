import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, renderHook, act } from '@testing-library/react'
import { ChatChartImage } from './ChatChartImage.jsx'
import { ChatBubble } from './ChatBubble.jsx'
import { useChatStream, toChatHistory } from '../customHooks/useChatStream.js'

// An agent-rendered chart is ONE row, rendered the same way in every agent's chat. Before this it
// existed only in the Idea chat: Kairos and Mentor emitted the `chart` event server-side and the
// frontend silently dropped it, and Atlas had no chart at all.

afterEach(cleanup)

describe('ChatChartImage', () => {
    it('renders the PNG with a symbol · timeframe caption', () => {
        const { container } = render(<ChatChartImage msg={{ imageBase64: 'AAA', symbol: 'NVDA', timeframe: '4hr' }} />)
        const img = container.querySelector('.chat-chart-image__img')
        expect(img.getAttribute('src')).toBe('data:image/png;base64,AAA')
        expect(container.querySelector('.chat-chart-image__caption').textContent).toBe('NVDA · 4hr')
    })

    it('renders without a caption when the agent sent no symbol/timeframe', () => {
        const { container } = render(<ChatChartImage msg={{ imageBase64: 'AAA' }} />)
        expect(container.querySelector('.chat-chart-image__img')).toBeTruthy()
        expect(container.querySelector('.chat-chart-image__caption')).toBeNull()
    })

    it('renders nothing without an image — never a broken img', () => {
        const { container } = render(<ChatChartImage msg={{ symbol: 'NVDA' }} />)
        expect(container.innerHTML).toBe('')
    })
})

describe('ChatBubble routes chart rows to the shared component', () => {
    // Kairos / Atlas / Mentor / Analyst all render through ChatBubble, so this is what makes the
    // chart appear in their threads at all.
    it('a type:chart row renders the image, not an empty assistant bubble', () => {
        const { container } = render(<ChatBubble msg={{ role: 'assistant', type: 'chart', imageBase64: 'BBB', symbol: 'SPY', timeframe: 'day' }} />)
        expect(container.querySelector('.chat-chart-image__img')).toBeTruthy()
        expect(container.querySelector('.portfolio-panel__bubble')).toBeNull()
    })

    it('a normal assistant row is untouched', () => {
        const { container } = render(<ChatBubble msg={{ role: 'assistant', content: 'hello' }} />)
        expect(container.querySelector('.chat-chart-image__img')).toBeNull()
        expect(container.textContent).toContain('hello')
    })
})

describe('useChatStream owns where the chart row goes', () => {
    it('inserts the chart BEFORE the streaming bubble, so it reads as part of that turn', () => {
        const { result } = renderHook(() => useChatStream())
        let handlers
        act(() => { handlers = result.current.begin('show me NVDA').handlers })
        act(() => { handlers.onChart({ symbol: 'NVDA', timeframe: '4hr', imageBase64: 'AAA' }) })

        const msgs = result.current.messages
        expect(msgs.map(m => m.role)).toEqual(['user', 'assistant', 'assistant'])
        expect(msgs[1].type).toBe('chart')
        expect(msgs[2].streaming).toBe(true)
    })

    it('an event with no image is ignored rather than inserting an empty row', () => {
        const { result } = renderHook(() => useChatStream())
        let handlers
        act(() => { handlers = result.current.begin('hi').handlers })
        act(() => { handlers.onChart({ symbol: 'NVDA' }) })
        expect(result.current.messages.length).toBe(2)
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
    it('drops chart rows — an image row has no content to send a model', () => {
        // Every panel builds both its send AND resume history through this, so the guard belongs
        // here rather than in four filters.
        const history = toChatHistory([
            { role: 'user', content: 'chart?' },
            { role: 'assistant', type: 'chart', imageBase64: 'AAA' },
            { role: 'assistant', content: 'here it is' },
        ])
        expect(history).toEqual([
            { role: 'user', content: 'chart?' },
            { role: 'assistant', content: 'here it is' },
        ])
    })
})
