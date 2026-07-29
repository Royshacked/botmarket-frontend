import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { ChatInputRow } from './ChatInputRow.jsx'
import { AgentChatInput } from './AgentChatInput.jsx'

// The composer's landing state: on an empty thread it IS the screen's subject, so it lifts and
// grows (`--empty`); the first turn settles it back into the docked pill. What's pinned here is
// that the state is ONE shared modifier on the ONE shared row — a panel opts in by saying whether
// its thread is empty, never by styling a composer of its own.

const noop = () => {}
const base = { prefix: 'axl', value: '', onChange: noop, onSend: noop }

afterEach(cleanup)

const row = container => container.querySelector('.chat-input-row')

describe('ChatInputRow landing state', () => {
    it('wears the landing modifier while the thread is empty', () => {
        const { container } = render(<ChatInputRow {...base} empty />)
        expect(row(container).classList.contains('chat-input-row--empty')).toBe(true)
    })

    it('drops it once the conversation starts', () => {
        const { container } = render(<ChatInputRow {...base} empty={false} />)
        expect(row(container).classList.contains('chat-input-row--empty')).toBe(false)
    })

    it('defaults to the docked state — a panel that says nothing gets no lift', () => {
        const { container } = render(<ChatInputRow {...base} />)
        expect(row(container).classList.contains('chat-input-row--empty')).toBe(false)
    })

    it('keeps the panel modifier alongside it', () => {
        const { container } = render(<ChatInputRow {...base} prefix="chat-panel" empty />)
        expect(row(container).className.split(' ')).toEqual(
            expect.arrayContaining(['chat-input-row', 'chat-input-row--chat-panel', 'chat-input-row--empty'])
        )
    })
})

describe('AgentChatInput', () => {
    // The five panels that share this wrapper get the landing state for free: it reads the same
    // `chat.messages` they already hand it, so none of them wires an `empty` prop.
    it('derives the landing state from an empty thread', () => {
        const { container } = render(<AgentChatInput chat={{ messages: [] }} />)
        expect(row(container).classList.contains('chat-input-row--empty')).toBe(true)
    })

    it('settles as soon as the thread has a turn', () => {
        const { container } = render(<AgentChatInput chat={{ messages: [{ role: 'user', content: 'hi' }] }} />)
        expect(row(container).classList.contains('chat-input-row--empty')).toBe(false)
    })
})
