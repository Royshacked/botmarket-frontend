import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import { UserMsg } from './UserMsg.jsx'
import { showUserMsg } from '../services/event-bus.service'
import { chatPreviewParts } from '../customHooks/useChatWs.js'

vi.mock('../services/chat/chatWs.service', () => ({ chatWsService: { connect: vi.fn(), disconnect: vi.fn(), on: vi.fn(), off: vi.fn() } }))
vi.mock('../services/chat/chat.service', () => ({ chatService: { getConversations: vi.fn() } }))
vi.mock('../services/sound.service', () => ({ playNotify: vi.fn() }))

afterEach(() => { cleanup(); vi.clearAllMocks() })

const toast = () => document.querySelector('.user-msg')

describe('UserMsg — the social-chat preview', () => {
    it('renders the sender and the message on their own lines (not one flat string)', () => {
        render(<UserMsg />)
        act(() => showUserMsg({
            txt:     '💬 Roy: did you see AVGO?',
            preview: chatPreviewParts({ senderId: 'u_42', senderName: 'Roy', content: 'did you see AVGO?' }),
            type:    'chat',
            onClick: vi.fn(),
        }))

        expect(screen.getByText('Roy').className).toBe('user-msg__who')
        expect(screen.getByText('did you see AVGO?').className).toBe('user-msg__text')
        // The flat line stays the accessible name, so what's announced doesn't depend on layout.
        expect(toast().getAttribute('aria-label')).toBe('💬 Roy: did you see AVGO?')
    })

    it('gives a human sender an initial disc and a bot its own tinted sigil', () => {
        const { rerender } = render(<UserMsg />)
        act(() => showUserMsg({ txt: 'x', preview: chatPreviewParts({ senderId: 'u_42', senderName: 'Roy', content: 'hey' }), type: 'chat' }))
        const human = document.querySelector('.user-msg__avatar')
        expect(human.textContent).toBe('R')
        expect(human.className).not.toMatch(/--bot/)

        rerender(<UserMsg />)
        act(() => showUserMsg({ txt: 'x', preview: chatPreviewParts({ senderId: 'scanner', content: 'fresh scan' }), type: 'chat' }))
        const bot = document.querySelector('.user-msg__avatar')
        expect(bot.className).toMatch(/user-msg__avatar--bot/)
        expect(bot.className).toMatch(/user-msg__avatar--violet/)   // Argus's hue, from agent meta
        expect(bot.querySelector('svg')).toBeTruthy()
    })

    it('still renders a plain toast as flat text, with no preview chrome', () => {
        render(<UserMsg />)
        act(() => showUserMsg({ txt: 'Saved', type: 'success' }))

        expect(toast().textContent).toContain('Saved')
        expect(document.querySelector('.user-msg__chat')).toBeNull()
    })

    it('dismisses on the close button without opening the conversation', () => {
        const onClick = vi.fn()
        render(<UserMsg />)
        act(() => showUserMsg({ txt: 'x', preview: chatPreviewParts({ senderId: 'u_1', senderName: 'Roy', content: 'hey' }), type: 'chat', onClick }))

        fireEvent.click(screen.getByLabelText('Dismiss'))
        expect(onClick).not.toHaveBeenCalled()
        expect(document.querySelector('.user-msg__chat')).toBeNull()
    })
})
