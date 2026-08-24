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

// When an agent stops talking the cursor returns to the composer, so the next turn is just typing.
// It's pinned on the shared row: the six AgentChatInput panels, ChatPanel and Axl all pass
// `isStreaming` already, so none of them wires anything for this.
describe('ChatInputRow focus return', () => {
    const textarea = container => container.querySelector('.chat-input-row__textarea')

    it('takes the cursor back when the reply ends', () => {
        const { container, rerender } = render(<ChatInputRow {...base} isStreaming />)
        rerender(<ChatInputRow {...base} isStreaming={false} />)
        expect(document.activeElement).toBe(textarea(container))
    })

    it('stays out of the way when nothing was streaming', () => {
        const { container } = render(<ChatInputRow {...base} isStreaming={false} />)
        expect(document.activeElement).not.toBe(textarea(container))
    })

    it('leaves a hidden panel alone — a background agent must not pull focus off the open chat', () => {
        const hidden = document.createElement('div')
        hidden.style.display = 'none'
        document.body.appendChild(hidden)
        const { container, rerender } = render(<ChatInputRow {...base} isStreaming />, { container: hidden })
        rerender(<ChatInputRow {...base} isStreaming={false} />)
        expect(document.activeElement).not.toBe(textarea(container))
        hidden.remove()
    })

    it('holds back on a touch device, where focus would raise the keyboard over the reply', () => {
        // jsdom has no matchMedia at all, which is why the desktop cases above read as fine-pointer.
        window.matchMedia = q => ({ matches: q.includes('coarse') })
        try {
            const { container, rerender } = render(<ChatInputRow {...base} isStreaming />)
            rerender(<ChatInputRow {...base} isStreaming={false} />)
            expect(document.activeElement).not.toBe(textarea(container))
        } finally {
            delete window.matchMedia
        }
    })

    it('leaves a field the user is already typing in', () => {
        const other = document.createElement('input')
        document.body.appendChild(other)
        other.focus()
        const { container, rerender } = render(<ChatInputRow {...base} isStreaming />)
        rerender(<ChatInputRow {...base} isStreaming={false} />)
        expect(document.activeElement).toBe(other)
        expect(document.activeElement).not.toBe(textarea(container))
        other.remove()
    })
})

// The keyboard hint a few panels append to their placeholder describes hardware that a phone
// doesn't have — and it's long enough to wrap the field into a cramped block. Trimmed on touch,
// in the shared row, so no panel branches its own copy.
describe('ChatInputRow placeholder on touch', () => {
    const IDEA = 'Describe your trade idea… (Enter to send, Shift+Enter for newline)'
    const placeholderOf = container => container.querySelector('.chat-input-row__textarea').placeholder

    afterEach(() => { delete window.matchMedia })
    const asTouch = () => { window.matchMedia = q => ({ matches: q.includes('coarse') }) }

    it('drops the keyboard hint on a phone, keeping the subject', () => {
        asTouch()
        const { container } = render(<ChatInputRow {...base} placeholder={IDEA} />)
        expect(placeholderOf(container)).toBe('Describe your trade idea…')
    })

    it('keeps it where there is a keyboard', () => {
        const { container } = render(<ChatInputRow {...base} placeholder={IDEA} />)
        expect(placeholderOf(container)).toBe(IDEA)
    })

    it('leaves a parenthetical that is not a keyboard hint', () => {
        asTouch()
        const copy = 'Ask about a holding (or the whole book)'
        const { container } = render(<ChatInputRow {...base} placeholder={copy} />)
        expect(placeholderOf(container)).toBe(copy)
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
